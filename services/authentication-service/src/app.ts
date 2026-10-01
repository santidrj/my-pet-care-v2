import type { Logger } from "pino";
import {
  buildServiceApp,
  recordRequestFailure,
} from "@my-pet-care/service-skeleton";
import type { UseCaseDeps } from "./application/ports.js";
import { registerRoutes } from "./http/routes.js";

export async function buildApp(options: {
  service: string;
  logger: Logger;
  deps: UseCaseDeps;
  publicKey: CryptoKey;
}) {
  const { service, logger, deps, publicKey } = options;
  const app = await buildServiceApp({
    service,
    logger,
    authenticator: {
      publicKey,
      publicRoutes: [
        { method: "POST", path: "/auth/login" },
        { method: "POST", path: "/auth/refresh" },
        { method: "POST", path: "/auth/logout" },
        { method: "POST", path: "/auth/password-reset/request" },
        { method: "POST", path: "/auth/password-reset/complete" },
        { method: "POST", path: "/oauth/token" },
        { method: "PUT", path: "/platform-clients/*" },
      ],
    },
  });

  registerRoutes(
    app as unknown as Parameters<typeof registerRoutes>[0],
    deps,
    (request, problemType) => {
      recordRequestFailure(request, problemType);
    },
  );

  return app;
}
