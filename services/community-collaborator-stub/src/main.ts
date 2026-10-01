import {
  platformClientStartup,
  publishPlatformClient,
} from "@my-pet-care/platform-service-authenticator";
import { ConfigError, loadMergedConfig, platformProcessEnv } from "@my-pet-care/service-config";
import { buildApp } from "./app.js";
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

const merged = await loadMergedConfig().catch((err: unknown) => {
  const message =
    err instanceof ConfigError ? err.message : "Configuration could not be loaded.";
  console.error(message);
  process.exit(1);
});

const service = merged.communityCollaborator;
const logger = createLogger(service.logLevel);
const communityOwnerIds = new Set(service.communityOwnerIds);
const app = buildApp(logger, { communityOwnerIds });

const startup = platformClientStartup(
  "community",
  platformProcessEnv(merged.platform, {
    authBaseUrl: service.authBaseUrl,
    platformClientActive: service.platformClientActive,
  }),
);
if (!startup.ok) {
  logger.error({ service: serviceName, msg: startup.message });
  await exitAfterFlush(logger, 1);
  throw new Error(startup.message);
}

try {
  await publishPlatformClient(startup.options);
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
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stop().then(() => exitAfterFlush(logger, 0));
  });
}
