import type { Logger } from "pino";
import type {
  AuthRevocationClient,
  AuthRevocationReason,
} from "../application/ports.js";
import { loggedFetch } from "./outbound-log.js";
import { serviceName } from "../service.js";

export type AuthRevokeClientOptions = {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  logger: Logger;
};

export function createAuthRevocationClient(
  options: AuthRevokeClientOptions,
): AuthRevocationClient {
  const base = options.baseUrl.replace(/\/$/, "");

  return {
    async revoke(ownerId: string, reason: AuthRevocationReason): Promise<void> {
      try {
        const response = await loggedFetch(
          {
            logger: options.logger,
            service: serviceName,
            target: "authentication-service",
            method: "POST",
            route: "/owners/{ownerId}/token-revocations",
          },
          options.fetch,
          `${base}/owners/${encodeURIComponent(ownerId)}/token-revocations`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason }),
          },
        );
        void response;
      } catch {
        // Best-effort: Owner change already committed.
      }
    },
  };
}
