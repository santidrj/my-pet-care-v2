import type { PlatformServiceId } from "./verify-token.js";

/** Default refresh-before-expiry margin; larger than verification leeway (±60s). */
export const DEFAULT_SKEW_MARGIN_SECONDS = 300 as const;

/** Default timeout for Authentication Service client-credentials grant. */
export const DEFAULT_GRANT_TIMEOUT_MS = 5_000 as const;

export type OutboundCredentialProviderOptions = {
  tokenEndpoint: string;
  serviceId: PlatformServiceId;
  secret: string;
  fetch?: typeof globalThis.fetch;
  /**
   * Client-credentials call only. Peer calls still use `fetch`, so the grant
   * can be logged without logging those calls twice.
   */
  grantFetch?: typeof globalThis.fetch;
  skewMarginSeconds?: number;
  grantTimeoutMs?: number;
  now?: () => Date;
};

export type OutboundCredentialProvider = {
  getAccessToken: () => Promise<string>;
  fetch: typeof globalThis.fetch;
};

export class PlatformTokenUnavailableError extends Error {
  constructor(message = "Platform access token unavailable") {
    super(message);
    this.name = "PlatformTokenUnavailableError";
  }
}

type CachedToken = {
  accessToken: string;
  /** Epoch ms after which the cache must not be reused. */
  refreshAtMs: number;
};

type TokenGrantResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
};

function isTokenGrantResponse(value: unknown): value is TokenGrantResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.accessToken === "string" &&
    record.accessToken.length > 0 &&
    typeof record.expiresIn === "number" &&
    Number.isFinite(record.expiresIn)
  );
}

function mergeHeaders(
  init: RequestInit | undefined,
  authorization: string,
): Headers {
  const headers = new Headers(init?.headers);
  headers.set("authorization", authorization);
  return headers;
}

export function createOutboundCredentialProvider(
  options: OutboundCredentialProviderOptions,
): OutboundCredentialProvider {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const grantFetch = options.grantFetch ?? fetchImpl;
  const skewMarginSeconds =
    options.skewMarginSeconds ?? DEFAULT_SKEW_MARGIN_SECONDS;
  const grantTimeoutMs =
    options.grantTimeoutMs ?? DEFAULT_GRANT_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());

  let cache: CachedToken | undefined;
  let inflight: Promise<string> | undefined;

  async function obtainToken(): Promise<string> {
    let response: Response;
    try {
      response = await grantFetch(options.tokenEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          grantType: "client_credentials",
          serviceId: options.serviceId,
          secret: options.secret,
        }),
        signal: AbortSignal.timeout(grantTimeoutMs),
      });
    } catch {
      throw new PlatformTokenUnavailableError();
    }

    if (!response.ok) {
      throw new PlatformTokenUnavailableError();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new PlatformTokenUnavailableError();
    }

    if (!isTokenGrantResponse(body)) {
      throw new PlatformTokenUnavailableError();
    }

    const refreshAtMs =
      now().getTime() + Math.max(0, body.expiresIn - skewMarginSeconds) * 1000;
    cache = { accessToken: body.accessToken, refreshAtMs };
    return body.accessToken;
  }

  async function getAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      cache !== undefined &&
      now().getTime() < cache.refreshAtMs
    ) {
      return cache.accessToken;
    }

    if (inflight !== undefined) {
      if (!forceRefresh) {
        return inflight;
      }
      try {
        await inflight;
      } catch {
        // Prior grant failed; continue with a forced re-fetch.
      }
      cache = undefined;
      // Another forced refresh may have started while we waited.
      if (inflight !== undefined) {
        return inflight;
      }
    }

    const request = obtainToken().finally(() => {
      if (inflight === request) {
        inflight = undefined;
      }
    });
    inflight = request;
    return request;
  }

  const authorizedFetch: typeof globalThis.fetch = async (input, init) => {
    const token = await getAccessToken();
    const response = await fetchImpl(input, {
      ...init,
      headers: mergeHeaders(init, `Bearer ${token}`),
    });

    if (response.status !== 401) {
      return response;
    }

    cache = undefined;
    const refreshed = await getAccessToken(true);
    return fetchImpl(input, {
      ...init,
      headers: mergeHeaders(init, `Bearer ${refreshed}`),
    });
  };

  return {
    getAccessToken: () => getAccessToken(false),
    fetch: authorizedFetch,
  };
}
