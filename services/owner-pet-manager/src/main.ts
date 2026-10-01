import { readFile } from "node:fs/promises";
import {
  createOutboundCredentialProvider,
  publishPlatformClient,
} from "@my-pet-care/platform-service-authenticator";
import {
  ConfigError,
  loadMergedConfig,
} from "@my-pet-care/service-config";
import { clientCredentialsGrantFetch } from "@my-pet-care/service-skeleton";
import { importSPKI } from "jose";
import { buildApp } from "./app.js";
import { createDatabase } from "./database.js";
import { createArgon2PasswordHasher } from "./infrastructure/argon2-hasher.js";
import { createAuthRevocationClient } from "./infrastructure/auth-revoke-client.js";
import { createCommunityClient } from "./infrastructure/community-client.js";
import { createDenylistPasswordPolicy } from "./infrastructure/denylist-policy.js";
import { createUuidV7Generator } from "./infrastructure/ids.js";
import { createLogger, type Logger } from "./logger.js";
import { serviceName } from "./service.js";

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

const service = merged.ownerPetManager;
const platform = merged.platform;
const logger = createLogger(service.logLevel);

const databaseUrl = service.databaseUrl;
const port = service.port;
const authBaseUrl = service.authBaseUrl;
const communityBaseUrl = service.communityBaseUrl;
const platformServiceSecret = platform.serviceSecret;
const platformSetupSecret = platform.setupSecret;
const authTokenUrl = `${authBaseUrl.replace(/\/$/, "")}/oauth/token`;

let publicKey!: CryptoKey;
try {
  publicKey = await loadPublicKey(platform.jwtPublicKeyPath);
} catch (err) {
  logger.error({
    service: serviceName,
    msg: "JWT public key could not be loaded.",
    err,
  });
  await exitAfterFlush(logger, 1);
}

const database = createDatabase(databaseUrl);
try {
  await database.check();
} catch (err) {
  logger.error({ service: serviceName, msg: "Database is unreachable.", err });
  await database.close();
  await exitAfterFlush(logger, 1);
}

const outbound = createOutboundCredentialProvider({
  tokenEndpoint: authTokenUrl,
  serviceId: "owner-pet-manager",
  secret: platformServiceSecret,
  grantFetch: clientCredentialsGrantFetch({
    logger,
    service: serviceName,
  }),
});

const deps = {
  store: database.store,
  passwordHasher: createArgon2PasswordHasher(),
  passwordPolicy: createDenylistPasswordPolicy(),
  community: createCommunityClient({
    baseUrl: communityBaseUrl,
    fetch: outbound.fetch,
    logger,
  }),
  authRevocation: createAuthRevocationClient({
    baseUrl: authBaseUrl,
    fetch: outbound.fetch,
    logger,
  }),
  ids: createUuidV7Generator(),
};

const app = await buildApp({
  service: serviceName,
  logger,
  deps,
  authenticator: { publicKey },
});

try {
  await publishPlatformClient({
    baseUrl: authBaseUrl,
    serviceId: "owner-pet-manager",
    secret: platformServiceSecret,
    setupSecret: platformSetupSecret,
    active: service.platformClientActive,
  });
  await app.ready();
  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error): void => {
      (app.server as unknown as NodeJS.EventEmitter).removeListener("error", fail);
      reject(err);
    };
    app.server.once("error", fail);
    app.server.listen({ host: "127.0.0.1", port }, () => {
      (app.server as unknown as NodeJS.EventEmitter).removeListener("error", fail);
      resolve();
    });
  });
} catch (err) {
  app.log.error({ service: serviceName, msg: "Service failed to start.", err });
  await database.close();
  await exitAfterFlush(logger, 1);
}

app.log.info({ service: serviceName, msg: "Service started." });

let stopping = false;

async function stop(): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  app.log.info({ service: serviceName, msg: "Service stopping." });
  await app.close();
  await database.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stop().then(() => exitAfterFlush(logger, 0));
  });
}
