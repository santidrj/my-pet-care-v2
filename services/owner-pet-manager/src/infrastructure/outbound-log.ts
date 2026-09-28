import type { Logger } from "pino";
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
    correlationId: correlationId ?? "00000000-0000-0000-0000-000000000000",
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
    logClientCompleted(options, {
      outcome,
      durationMs,
      statusCode: response.status,
    });
    return response;
  } catch (cause) {
    const durationMs = Math.round(Date.now() - started);
    const err =
      cause instanceof Error
        ? cause
        : new Error("The outbound call failed.");
    const stable = new Error("The outbound call failed.");
    stable.stack = err.stack;
    logClientCompleted(options, {
      outcome: "failure",
      durationMs,
      err: stable,
    });
    throw cause;
  }
}
