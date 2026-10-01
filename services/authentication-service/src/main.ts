import { readFile } from "node:fs/promises";
import { importSPKI } from "jose";
import { createOutboundCredentialProvider } from "@my-pet-care/platform-service-authenticator";
import { ConfigError, loadMergedConfig } from "@my-pet-care/service-config";
import { clientCredentialsGrantFetch } from "@my-pet-care/service-skeleton";
import { buildApp } from "./app.js";
import { ensurePlatformClient } from "./application/ensure-client.js";
import type { MailChannel, UseCaseDeps } from "./application/ports.js";
import { sweep } from "./application/sweep.js";
import { createDatabase } from "./database.js";
import { createDrizzleStore } from "./infrastructure/drizzle-store.js";
import {
  createFailingMailChannel,
  createFileMailChannel,
} from "./infrastructure/mail-file.js";
import { createOwnerPetManagerClient } from "./infrastructure/opm-client.js";
import { createArgon2SecretHasher } from "./infrastructure/password.js";
import { createSigner, loadPrivateKey } from "./infrastructure/signer.js";
import { createTokenFactory, createUuidV7Generator } from "./infrastructure/tokens.js";
import { createLogger, type Logger } from "./logger.js";
import { serviceName } from "./service.js";

const SWEEP_INTERVAL_MS = 60_000;

async function exitAfterFlush(logger: Logger, code: number): Promise<never> {
  await new Promise<void>((resolve) => {
    logger.flush(() => {
      resolve();
    });
  });
  process.exit(code);
}

async function loadPublicKey(path: string): Promise<CryptoKey> {
  const spki = await readFile(path, "utf8");
  return importSPKI(spki, "EdDSA");
}

const merged = await loadMergedConfig().catch((err: unknown) => {
  const message =
    err instanceof ConfigError ? err.message : "Configuration could not be loaded.";
  console.error(message);
  process.exit(1);
});

const service = merged.authenticationService;
const platform = merged.platform;
const logger = createLogger(service.logLevel);

const mailSink = service.mailSink;
let mail!: MailChannel;
if (mailSink === undefined || mailSink.length === 0) {
  mail = createFailingMailChannel();
} else if (mailSink.startsWith("file:")) {
  mail = createFileMailChannel(mailSink.slice("file:".length));
} else {
  logger.error({ service: serviceName, msg: "mailSink must be file:<path>." });
  await exitAfterFlush(logger, 1);
}

let publicKey!: CryptoKey;
let privateKey!: CryptoKey;
try {
  publicKey = await loadPublicKey(platform.jwtPublicKeyPath);
  privateKey = await loadPrivateKey(await readFile(service.jwtPrivateKeyPath, "utf8"));
} catch (err) {
  logger.error({ service: serviceName, msg: "JWT signing key could not be loaded.", err });
  await exitAfterFlush(logger, 1);
}

const database = createDatabase(service.databaseUrl);
try {
  await database.check();
} catch (err) {
  logger.error({ service: serviceName, msg: "Database is unreachable.", err });
  await database.close();
  await exitAfterFlush(logger, 1);
}

const passwords = await createArgon2SecretHasher();
const store = createDrizzleStore(database.db);
const outbound = createOutboundCredentialProvider({
  tokenEndpoint: `http://127.0.0.1:${service.port}/oauth/token`,
  serviceId: "authentication-service",
  secret: platform.serviceSecret,
  grantFetch: clientCredentialsGrantFetch({
    logger,
    service: serviceName,
  }),
});

const deps: UseCaseDeps = {
  store,
  owners: createOwnerPetManagerClient({
    baseUrl: service.ownerPetManagerBaseUrl,
    credentials: outbound,
    logger,
  }),
  passwords,
  signer: createSigner(privateKey),
  tokens: createTokenFactory(),
  ids: createUuidV7Generator(),
  now: () => new Date(),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  resetNoSendFloorMs: service.resetNoSendFloorMs,
  resetLinkTemplate: service.resetLinkTemplate,
  mail,
  setupSecret: platform.setupSecret,
};

let ensured: Awaited<ReturnType<typeof ensurePlatformClient>>;
try {
  ensured = await ensurePlatformClient(deps, {
    serviceId: "authentication-service",
    secret: platform.serviceSecret,
    active: service.platformClientActive,
    setupSecret: platform.setupSecret,
  });
} catch (err) {
  logger.error({ service: serviceName, msg: "Platform client could not be ensured.", err });
  await database.close();
  await exitAfterFlush(logger, 1);
  throw err;
}
if (!ensured.ok) {
  logger.error({ service: serviceName, msg: "Platform client could not be ensured." });
  await database.close();
  await exitAfterFlush(logger, 1);
}

const app = await buildApp({
  service: serviceName,
  logger,
  deps,
  publicKey,
});

try {
  await app.ready();
  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error): void => {
      (app.server as unknown as NodeJS.EventEmitter).removeListener("error", fail);
      reject(err);
    };
    app.server.once("error", fail);
    app.server.listen(
      { host: process.env.LISTEN_HOST?.trim() || "127.0.0.1", port: service.port },
      () => {
        (app.server as unknown as NodeJS.EventEmitter).removeListener("error", fail);
        resolve();
      },
    );
  });
} catch (err) {
  app.log.error({ service: serviceName, msg: "Service failed to start.", err });
  await database.close();
  await exitAfterFlush(logger, 1);
}

const sweepTimer = setInterval(() => {
  void sweep(deps).catch((err: unknown) => {
    logger.error({ service: serviceName, msg: "Sweep failed.", err });
  });
}, SWEEP_INTERVAL_MS);
sweepTimer.unref();

app.log.info({ service: serviceName, msg: "Service started." });

let stopping = false;

async function stop(): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  clearInterval(sweepTimer);
  app.log.info({ service: serviceName, msg: "Service stopping." });
  await app.close();
  await database.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stop().then(() => exitAfterFlush(logger, 0));
  });
}
