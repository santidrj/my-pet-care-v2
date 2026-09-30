import type { PlatformServiceId } from "./verify-token.js";

export class PlatformClientEnsureError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Platform client ensure was rejected");
    this.name = "PlatformClientEnsureError";
    this.status = status;
  }
}

export type EnsurePlatformClientOptions = {
  baseUrl: string;
  serviceId: PlatformServiceId;
  secret: string;
  setupSecret: string;
  active?: boolean;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  deadlineMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

const RETRY_DELAY_MS = 200;

export type PlatformClientStartup =
  | {
      ok: true;
      options: Pick<
        EnsurePlatformClientOptions,
        "baseUrl" | "serviceId" | "secret" | "setupSecret" | "active"
      >;
    }
  | { ok: false; message: string };

/** Reads the env every platform service other than Authentication Service needs. */
export function platformClientStartup(
  serviceId: PlatformServiceId,
  env: NodeJS.ProcessEnv = process.env,
): PlatformClientStartup {
  const secret = env.PLATFORM_SERVICE_SECRET ?? "";
  if (secret.length === 0) {
    return { ok: false, message: "PLATFORM_SERVICE_SECRET is required." };
  }
  const setupSecret = env.PLATFORM_SETUP_SECRET ?? "";
  if (setupSecret.length === 0) {
    return { ok: false, message: "PLATFORM_SETUP_SECRET is required." };
  }
  const configuredId = env.PLATFORM_SERVICE_ID ?? serviceId;
  if (configuredId !== serviceId) {
    return { ok: false, message: `PLATFORM_SERVICE_ID must be ${serviceId}.` };
  }
  const activeRaw = env.PLATFORM_CLIENT_ACTIVE;
  if (activeRaw !== undefined && activeRaw !== "true" && activeRaw !== "false") {
    return { ok: false, message: "PLATFORM_CLIENT_ACTIVE is invalid." };
  }
  const baseUrl = env.AUTH_BASE_URL ?? "";
  if (baseUrl.length === 0) {
    return { ok: false, message: "AUTH_BASE_URL is required." };
  }
  return {
    ok: true,
    options: {
      baseUrl,
      serviceId,
      secret,
      setupSecret,
      active: activeRaw !== "false",
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Publishes this process's platform client and retries while Authentication
 * Service is not yet accepting the call. A 400 or 401 is final.
 */
export async function ensurePlatformClient(
  options: EnsurePlatformClientOptions,
): Promise<void> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? delay;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const deadlineMs = options.deadlineMs ?? 30_000;
  const started = now().getTime();
  const url = `${options.baseUrl.replace(/\/$/, "")}/platform-clients/${options.serviceId}`;
  const body = JSON.stringify({
    secret: options.secret,
    active: options.active ?? true,
    setupSecret: options.setupSecret,
  });

  let lastError: unknown;
  for (;;) {
    try {
      const response = await fetchImpl(url, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 204) {
        return;
      }
      if (response.status === 400 || response.status === 401) {
        throw new PlatformClientEnsureError(response.status);
      }
      lastError = new PlatformClientEnsureError(response.status);
    } catch (err) {
      if (err instanceof PlatformClientEnsureError && (err.status === 400 || err.status === 401)) {
        throw err;
      }
      lastError = err;
    }

    if (now().getTime() - started >= deadlineMs) {
      throw lastError instanceof Error
        ? lastError
        : new PlatformClientEnsureError(503);
    }
    await sleep(RETRY_DELAY_MS);
  }
}
