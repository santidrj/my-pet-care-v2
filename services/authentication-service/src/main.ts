import { readFile } from "node:fs/promises";
import { importSPKI } from "jose";
import { createOutboundCredentialProvider } from "@my-pet-care/platform-service-authenticator";
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
import { defaultPort, serviceName } from "./service.js";

const LOG_LEVELS = new Set(["fatal", "error", "warn", "info", "debug", "trace"]);
const SWEEP_INTERVAL_MS = 60_000;

async function exitAfterFlush(logger: Logger, code: number): Promise<never> {
  await new Promise<void>((resolve) => {
    logger.flush(() => {
      resolve();
    });
  });
  process.exit(code);
}

function readPort(value: string | undefined, fallback: number): number | undefined {
  if (value === undefined) {
    return fallback;
  }
  if (!/^[0-9]+$/.test(value)) {
    return undefined;
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    return undefined;
  }
  return port;
}

function readActiveFlag(value: string | undefined): boolean | undefined {
  if (value === undefined || value.length === 0 || value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function readFloorMs(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0) {
    return 1000;
  }
  if (!/^[0-9]+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  if (parsed >= 2000) {
    return undefined;
  }
  return parsed;
}

async function loadPublicKey(): Promise<CryptoKey> {
  const pem = process.env.JWT_PUBLIC_KEY;
  const path = process.env.JWT_PUBLIC_KEY_PATH;
  let spki: string;
  if (pem !== undefined && pem.length > 0) {
    spki = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  } else if (path !== undefined && path.length > 0) {
    spki = await readFile(path, "utf8");
  } else {
    throw new Error("JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH is required.");
  }
  return importSPKI(spki, "EdDSA");
}

const requestedLevel = process.env.LOG_LEVEL;
const logLevel = requestedLevel === undefined ? "info" : requestedLevel;
const logger = createLogger(LOG_LEVELS.has(logLevel) ? logLevel : "info");

if (!LOG_LEVELS.has(logLevel)) {
  logger.error({ service: serviceName, msg: "LOG_LEVEL is invalid." });
  await exitAfterFlush(logger, 1);
}

const databaseUrl = process.env.DATABASE_URL ?? "";
if (databaseUrl.length === 0) {
  logger.error({ service: serviceName, msg: "DATABASE_URL is required." });
  await exitAfterFlush(logger, 1);
}

const port = readPort(process.env.PORT, defaultPort);
if (port === undefined) {
  logger.error({ service: serviceName, msg: "PORT is invalid." });
  await exitAfterFlush(logger, 1);
}

const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH ?? "";
if (privateKeyPath.length === 0) {
  logger.error({ service: serviceName, msg: "JWT_PRIVATE_KEY_PATH is required." });
  await exitAfterFlush(logger, 1);
}

const resetLinkTemplate = process.env.RESET_LINK_TEMPLATE ?? "";
if (resetLinkTemplate.match(/\{token\}/g)?.length !== 1) {
  logger.error({
    service: serviceName,
    msg: "RESET_LINK_TEMPLATE must contain one {token} placeholder.",
  });
  await exitAfterFlush(logger, 1);
}

const setupSecret = process.env.PLATFORM_SETUP_SECRET ?? "";
if (setupSecret.length === 0) {
  logger.error({ service: serviceName, msg: "PLATFORM_SETUP_SECRET is required." });
  await exitAfterFlush(logger, 1);
}

const platformServiceSecret = process.env.PLATFORM_SERVICE_SECRET ?? "";
if (platformServiceSecret.length === 0) {
  logger.error({ service: serviceName, msg: "PLATFORM_SERVICE_SECRET is required." });
  await exitAfterFlush(logger, 1);
}

const platformServiceId = process.env.PLATFORM_SERVICE_ID ?? "authentication-service";
if (platformServiceId !== "authentication-service") {
  logger.error({
    service: serviceName,
    msg: "PLATFORM_SERVICE_ID must be authentication-service.",
  });
  await exitAfterFlush(logger, 1);
}

const active = readActiveFlag(process.env.PLATFORM_CLIENT_ACTIVE);
if (active === undefined) {
  logger.error({ service: serviceName, msg: "PLATFORM_CLIENT_ACTIVE is invalid." });
  await exitAfterFlush(logger, 1);
}

const resetNoSendFloorMs = readFloorMs(process.env.RESET_NO_SEND_FLOOR_MS);
if (resetNoSendFloorMs === undefined) {
  logger.error({ service: serviceName, msg: "RESET_NO_SEND_FLOOR_MS is invalid." });
  await exitAfterFlush(logger, 1);
}

const ownerPetManagerBaseUrl = process.env.OWNER_PET_MANAGER_BASE_URL ?? "";
if (ownerPetManagerBaseUrl.length === 0) {
  logger.error({ service: serviceName, msg: "OWNER_PET_MANAGER_BASE_URL is required." });
  await exitAfterFlush(logger, 1);
}

const mailSink = process.env.MAIL_SINK;
let mail: MailChannel;
if (mailSink === undefined || mailSink.length === 0) {
  mail = createFailingMailChannel();
} else if (mailSink.startsWith("file:")) {
  mail = createFileMailChannel(mailSink.slice("file:".length));
} else {
  logger.error({ service: serviceName, msg: "MAIL_SINK must be file:<path>." });
  await exitAfterFlush(logger, 1);
}

let publicKey: CryptoKey;
let privateKey: CryptoKey;
try {
  publicKey = await loadPublicKey();
  privateKey = await loadPrivateKey(await readFile(privateKeyPath, "utf8"));
} catch (err) {
  logger.error({ service: serviceName, msg: "JWT signing key could not be loaded.", err });
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

const passwords = await createArgon2SecretHasher();
const store = createDrizzleStore(database.db);
const outbound = createOutboundCredentialProvider({
  tokenEndpoint: `http://127.0.0.1:${port}/oauth/token`,
  serviceId: "authentication-service",
  secret: platformServiceSecret,
  grantFetch: clientCredentialsGrantFetch({
    logger,
    service: serviceName,
  }),
});

const deps: UseCaseDeps = {
  store,
  owners: createOwnerPetManagerClient({
    baseUrl: ownerPetManagerBaseUrl,
    credentials: outbound,
    logger,
  }),
  passwords,
  signer: createSigner(privateKey!),
  tokens: createTokenFactory(),
  ids: createUuidV7Generator(),
  now: () => new Date(),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  resetNoSendFloorMs: resetNoSendFloorMs!,
  resetLinkTemplate,
  mail: mail!,
  setupSecret,
};

let ensured: Awaited<ReturnType<typeof ensurePlatformClient>>;
try {
  ensured = await ensurePlatformClient(deps, {
    serviceId: "authentication-service",
    secret: platformServiceSecret,
    active: active!,
    setupSecret,
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
  publicKey: publicKey!,
});

try {
  await app.ready();
  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error): void => {
      app.server.off("error", fail);
      reject(err);
    };
    app.server.once("error", fail);
    app.server.listen({ host: "127.0.0.1", port }, () => {
      app.server.off("error", fail);
      resolve();
    });
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
