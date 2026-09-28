import { buildApp } from "./app.js";
import { createDatabase } from "./database.js";
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

const database = createDatabase(databaseUrl);
try {
  await database.check();
} catch (err) {
  logger.error({ service: serviceName, msg: "Database is unreachable.", err });
  await database.close();
  await exitAfterFlush(logger, 1);
}

const app = buildApp(serviceName, logger);

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
