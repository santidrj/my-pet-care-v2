import { readFile } from "node:fs/promises";
import {
  createOutboundCredentialProvider,
  publishPlatformClient,
} from "@my-pet-care/platform-service-authenticator";
import { importSPKI } from "jose";
import { buildApp } from "./app.js";
import { createDatabase } from "./database.js";
import { createArgon2PasswordHasher } from "./infrastructure/argon2-hasher.js";
import { createAuthRevocationClient } from "./infrastructure/auth-revoke-client.js";
import { createCommunityClient } from "./infrastructure/community-client.js";
import { createDenylistPasswordPolicy } from "./infrastructure/denylist-policy.js";
import { createUuidV7Generator } from "./infrastructure/ids.js";
import { createLogger, type Logger } from "./logger.js";
import { defaultPort, serviceName } from "./service.js";

const LOG_LEVELS = new Set(["fatal", "error", "warn", "info", "debug", "trace"]);

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

function readListenHost(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    return "127.0.0.1";
  }
  return value.trim();
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

const authBaseUrl = process.env.AUTH_BASE_URL ?? "";
const communityBaseUrl = process.env.COMMUNITY_BASE_URL ?? "";
const platformServiceId = process.env.PLATFORM_SERVICE_ID ?? "owner-pet-manager";
const platformServiceSecret = process.env.PLATFORM_SERVICE_SECRET ?? "";
const authTokenUrl =
  process.env.AUTH_TOKEN_URL ??
  (authBaseUrl.length > 0 ? `${authBaseUrl.replace(/\/$/, "")}/oauth/token` : "");

if (authBaseUrl.length === 0) {
  logger.error({ service: serviceName, msg: "AUTH_BASE_URL is required." });
  await exitAfterFlush(logger, 1);
}
if (communityBaseUrl.length === 0) {
  logger.error({ service: serviceName, msg: "COMMUNITY_BASE_URL is required." });
  await exitAfterFlush(logger, 1);
}
if (platformServiceSecret.length === 0) {
  logger.error({
    service: serviceName,
    msg: "PLATFORM_SERVICE_SECRET is required.",
  });
  await exitAfterFlush(logger, 1);
}
const platformSetupSecret = process.env.PLATFORM_SETUP_SECRET ?? "";
if (platformSetupSecret.length === 0) {
  logger.error({
    service: serviceName,
    msg: "PLATFORM_SETUP_SECRET is required.",
  });
  await exitAfterFlush(logger, 1);
}
const platformClientActive = process.env.PLATFORM_CLIENT_ACTIVE;
if (
  platformClientActive !== undefined &&
  platformClientActive !== "true" &&
  platformClientActive !== "false"
) {
  logger.error({
    service: serviceName,
    msg: "PLATFORM_CLIENT_ACTIVE is invalid.",
  });
  await exitAfterFlush(logger, 1);
}
if (authTokenUrl.length === 0) {
  logger.error({ service: serviceName, msg: "AUTH_TOKEN_URL is required." });
  await exitAfterFlush(logger, 1);
}

let publicKey: CryptoKey;
try {
  publicKey = await loadPublicKey();
} catch (err) {
  logger.error({
    service: serviceName,
    msg: "JWT public key could not be loaded.",
    err,
  });
  await exitAfterFlush(logger, 1);
}

if (platformServiceId !== "owner-pet-manager") {
  logger.error({
    service: serviceName,
    msg: "PLATFORM_SERVICE_ID must be owner-pet-manager.",
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
  authenticator: { publicKey: publicKey! },
});

try {
  await publishPlatformClient({
    baseUrl: authBaseUrl,
    serviceId: "owner-pet-manager",
    secret: platformServiceSecret,
    setupSecret: platformSetupSecret,
    active: platformClientActive !== "false",
  });
  await app.ready();
  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error): void => {
      app.server.off("error", fail);
      reject(err);
    };
    app.server.once("error", fail);
    app.server.listen({ host: readListenHost(process.env.LISTEN_HOST), port }, () => {
      app.server.off("error", fail);
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
