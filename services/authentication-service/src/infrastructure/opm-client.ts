import type { OutboundCredentialProvider } from "@my-pet-care/platform-service-authenticator";
import { loggedFetch } from "@my-pet-care/service-skeleton";
import type { Logger } from "pino";
import type { OwnerDirectory, OwnerLookup, SetPasswordResult } from "../application/ports.js";

const TIMEOUT_MS = 5_000;

type CredentialsBody = {
  ownerId?: unknown;
  passwordHash?: unknown;
  active?: unknown;
};

function isCredentials(value: unknown): value is {
  ownerId: string;
  passwordHash: string;
  active: boolean;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const body = value as CredentialsBody;
  return (
    typeof body.ownerId === "string" &&
    body.ownerId.length > 0 &&
    typeof body.passwordHash === "string" &&
    body.passwordHash.length > 0 &&
    typeof body.active === "boolean"
  );
}

export function createOwnerPetManagerClient(options: {
  baseUrl: string;
  credentials: OutboundCredentialProvider;
  logger: Logger;
  fetch?: typeof globalThis.fetch;
}): OwnerDirectory {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/$/, "");

  async function send(
    route: string,
    url: string,
    init: RequestInit,
  ): Promise<Response | "unavailable"> {
    try {
      const accessToken = await options.credentials.getAccessToken();
      return await loggedFetch(
        {
          logger: options.logger,
          service: "authentication-service",
          target: "owner-pet-manager",
          method: init.method ?? "GET",
          route,
        },
        fetchImpl,
        url,
        {
          ...init,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${accessToken}`,
            ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
    } catch {
      return "unavailable";
    }
  }

  async function readLookup(response: Response | "unavailable"): Promise<OwnerLookup> {
    if (response === "unavailable") {
      return { status: "unavailable" };
    }
    if (response.status === 404) {
      return { status: "not_found" };
    }
    if (!response.ok) {
      return { status: "unavailable" };
    }
    try {
      const body: unknown = await response.json();
      if (!isCredentials(body)) {
        return { status: "unavailable" };
      }
      return {
        status: "found",
        credentials: {
          ownerId: body.ownerId,
          passwordHash: body.passwordHash,
          active: body.active,
        },
      };
    } catch {
      return { status: "unavailable" };
    }
  }

  return {
    async findByIdentifier(identifier) {
      const url = `${base}/owners/credentials?identifier=${encodeURIComponent(identifier)}`;
      return readLookup(await send("GET /owners/credentials", url, { method: "GET" }));
    },
    async findByOwnerId(ownerId) {
      const url = `${base}/owners/${encodeURIComponent(ownerId)}/credentials`;
      return readLookup(
        await send("GET /owners/:ownerId/credentials", url, { method: "GET" }),
      );
    },
    async setPassword(ownerId, password): Promise<SetPasswordResult> {
      const response = await send(
        "PUT /owners/:ownerId/credentials/password",
        `${base}/owners/${encodeURIComponent(ownerId)}/credentials/password`,
        { method: "PUT", body: JSON.stringify({ password }) },
      );
      if (response === "unavailable") {
        return { status: "unavailable" };
      }
      if (response.status === 400) {
        return { status: "validation" };
      }
      if (response.status === 404) {
        return { status: "not_found" };
      }
      if (!response.ok) {
        return { status: "unavailable" };
      }
      return { status: "updated" };
    },
  };
}
