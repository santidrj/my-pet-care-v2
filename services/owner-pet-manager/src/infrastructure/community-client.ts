import type { Logger } from "pino";
import type { CommunityCollaborator } from "../application/ports.js";
import { loggedFetch } from "./outbound-log.js";
import { serviceName } from "../service.js";

export type CommunityClientOptions = {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  logger: Logger;
};

export function createCommunityClient(
  options: CommunityClientOptions,
): CommunityCollaborator {
  const base = options.baseUrl.replace(/\/$/, "");

  return {
    async isCommunityOwner(ownerId: string): Promise<boolean> {
      const response = await loggedFetch(
        {
          logger: options.logger,
          service: serviceName,
          target: "community",
          method: "GET",
          route: "/owners/{ownerId}/community-ownership",
        },
        options.fetch,
        `${base}/owners/${encodeURIComponent(ownerId)}/community-ownership`,
        { method: "GET", headers: { accept: "application/json" } },
      );
      if (!response.ok) {
        throw new Error("The Community-owner check failed.");
      }
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        typeof (body as { isCommunityOwner?: unknown }).isCommunityOwner !==
          "boolean"
      ) {
        throw new Error("The Community-owner check failed.");
      }
      return (body as { isCommunityOwner: boolean }).isCommunityOwner;
    },

    async endBelonging(ownerId: string): Promise<void> {
      try {
        const response = await loggedFetch(
          {
            logger: options.logger,
            service: serviceName,
            target: "community",
            method: "POST",
            route: "/owners/{ownerId}/belonging-endings",
          },
          options.fetch,
          `${base}/owners/${encodeURIComponent(ownerId)}/belonging-endings`,
          { method: "POST" },
        );
        void response;
      } catch {
        // Best-effort: Deactivation already committed.
      }
    },
  };
}
