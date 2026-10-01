import type { Logger } from "pino";
import { problemDetailsSchema } from "@my-pet-care/contracts";
import { currentCorrelationId } from "./correlation.js";

export type OutboundLogTarget =
  | "authentication-service"
  | "community"
  | "owner-pet-manager"
  | "pet-health-service"
  | "activity-manager";

export type OutboundLogOptions = {
  logger: Logger;
  service: string;
  target: OutboundLogTarget;
  method: string;
  route: string;
};

const MISSING_CORRELATION_ID = "00000000-0000-0000-0000-000000000000";

function stableOutboundError(cause: unknown): Error {
  const logged = new Error("The outbound call failed.");
  const stack = cause instanceof Error ? cause.stack : undefined;
  const frames = stack?.split("\n").slice(1).join("\n");
  logged.stack = frames
    ? `${logged.name}: ${logged.message}\n${frames}`
    : `${logged.name}: ${logged.message}`;
  return logged;
}

function logClientCompleted(
  options: OutboundLogOptions,
  fields: {
    outcome: "success" | "failure";
    durationMs: number;
    statusCode?: number;
    problemType?: string;
    err?: Error;
  },
): void {
  const correlationId = currentCorrelationId();
  const line: Record<string, unknown> = {
    service: options.service,
    correlationId: correlationId ?? MISSING_CORRELATION_ID,
    event: "http.client.completed",
    outcome: fields.outcome,
    durationMs: fields.durationMs,
    target: options.target,
    method: options.method,
    route: options.route,
  };
  if (fields.statusCode !== undefined) {
    line.statusCode = fields.statusCode;
  }
  if (fields.problemType !== undefined) {
    line.problemType = fields.problemType;
  }

  if (fields.outcome === "success") {
    options.logger.info(line);
    return;
  }
  if (fields.statusCode === undefined || fields.statusCode >= 500) {
    if (fields.err !== undefined) {
      options.logger.error({ ...line, err: fields.err });
      return;
    }
    options.logger.error(line);
    return;
  }
  options.logger.warn(line);
}

async function problemTypeFrom(response: Response): Promise<string | undefined> {
  try {
    const parsed = problemDetailsSchema.safeParse(await response.clone().json());
    return parsed.success ? parsed.data.type : undefined;
  } catch {
    return undefined;
  }
}

export async function loggedFetch(
  options: OutboundLogOptions,
  fetchImpl: typeof globalThis.fetch,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const correlationId = currentCorrelationId();
  if (correlationId !== undefined) {
    headers.set("request-id", correlationId);
  }

  const started = Date.now();
  try {
    const response = await fetchImpl(input, { ...init, headers });
    const durationMs = Math.round(Date.now() - started);
    const outcome = response.ok ? "success" : "failure";
    const problemType =
      outcome === "failure" ? await problemTypeFrom(response) : undefined;
    logClientCompleted(options, {
      outcome,
      durationMs,
      statusCode: response.status,
      problemType,
    });
    return response;
  } catch (cause) {
    const durationMs = Math.round(Date.now() - started);
    logClientCompleted(options, {
      outcome: "failure",
      durationMs,
      err: stableOutboundError(cause),
    });
    throw cause;
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

/** Fetch wrapper that logs the Authentication Service client-credentials grant. */
export function clientCredentialsGrantFetch(options: {
  logger: Logger;
  service: string;
  fetch?: typeof globalThis.fetch;
}): typeof globalThis.fetch {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return (input, init) =>
    loggedFetch(
      {
        logger: options.logger,
        service: options.service,
        target: "authentication-service",
        method: "POST",
        route: "/oauth/token",
      },
      fetchImpl,
      requestUrl(input),
      init,
    );
}
