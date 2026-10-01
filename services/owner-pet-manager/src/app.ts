import type { Logger } from "pino";
import {
  buildServiceApp,
  recordRequestFailure,
} from "@my-pet-care/service-skeleton";
import type { AuthenticatorPluginOptions } from "@my-pet-care/platform-service-authenticator";
import type { UseCaseDeps } from "./application/ports.js";
import { registerRoutes } from "./http/routes.js";

export type BuildAppOptions = {
  service: string;
  logger: Logger;
  deps: UseCaseDeps;
  authenticator: AuthenticatorPluginOptions;
};

export async function buildApp(options: BuildAppOptions) {
  const { service, logger, deps, authenticator } = options;

  const app = await buildServiceApp({
    service,
    logger,
    authenticator: {
      ...authenticator,
      publicRoutes: [
        { method: "POST", path: "/owners" },
        ...(authenticator.publicRoutes ?? []),
      ],
    },
  });

  registerRoutes(
    app as unknown as Parameters<typeof registerRoutes>[0],
    deps,
    {
      record(request, problemType, error) {
        recordRequestFailure(request, problemType, error);
      },
    },
  );

  return app;
}
