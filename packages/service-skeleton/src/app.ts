import { randomUUID } from "node:crypto";
import Fastify, {
  LogController,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "@fastify/type-provider-zod";
import type { Logger } from "pino";
import { z } from "zod";
import {
  internalErrorProblem,
  notFoundProblem,
  problemDetailsSchema,
  unauthorizedProblem,
  validationFailedProblem,
  type ProblemDetails,
} from "@my-pet-care/contracts";
import {
  registerPlatformServiceAuthenticator,
  type AuthenticatorPluginOptions,
} from "@my-pet-care/platform-service-authenticator";
import { enterCorrelationId } from "./correlation.js";

declare module "fastify" {
  interface FastifyRequest {
    correlationId?: string;
  }

  interface FastifyContextConfig {
    /**
     * Path parameters omitted from `http.request.completed`.
     * A capability token, such as an external share link, is not a path-id field.
     */
    sensitiveParams?: readonly string[];
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FailureState {
  problemType: string;
  error?: unknown;
}

const failures = new WeakMap<FastifyRequest, FailureState>();

export function recordRequestFailure(
  request: FastifyRequest,
  problemType: string,
  error?: unknown,
): void {
  failures.set(request, { problemType, error });
}

function correlationIdFrom(header: string | string[] | undefined): string {
  if (typeof header === "string" && UUID_PATTERN.test(header)) {
    return header;
  }
  return randomUUID();
}

function serviceError(error: Error): Error {
  const logged = new Error("The service failed to handle this request.");
  const frames = error.stack?.split("\n").slice(1).join("\n");
  logged.stack = frames
    ? `${logged.name}: ${logged.message}\n${frames}`
    : `${logged.name}: ${logged.message}`;
  return logged;
}

function sendProblem(reply: FastifyReply, problem: ProblemDetails) {
  const body = problemDetailsSchema.parse(problem);
  return reply
    .status(body.status)
    .header("content-type", "application/problem+json")
    .serializer((payload) => JSON.stringify(payload))
    .send(body);
}

function isSchemaValidationError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "validation" in error
  );
}

function completedFields(
  service: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Record<string, unknown> {
  const statusCode = reply.statusCode;
  const outcome = statusCode >= 400 ? "failure" : "success";
  const fields: Record<string, unknown> = {
    service,
    correlationId: request.correlationId ?? randomUUID(),
    event: "http.request.completed",
    outcome,
    durationMs: Math.round(reply.elapsedTime),
    method: request.method,
    route: request.routeOptions.url ?? "unmatched",
    statusCode,
  };

  const params = request.params;
  if (
    request.routeOptions.url !== undefined &&
    typeof params === "object" &&
    params !== null
  ) {
    const sensitive = new Set(
      request.routeOptions.config?.sensitiveParams ?? [],
    );
    for (const [key, value] of Object.entries(params)) {
      if (sensitive.has(key)) {
        continue;
      }
      fields[key] = value;
    }
  }

  if (outcome === "failure") {
    const problemType = failures.get(request)?.problemType;
    if (problemType !== undefined) {
      fields.problemType = problemType;
    }
  }

  return fields;
}

export type BuildServiceAppOptions = {
  service: string;
  logger: Logger;
  authenticator?: AuthenticatorPluginOptions;
};

export async function buildServiceApp(options: BuildServiceAppOptions) {
  const { service, logger, authenticator } = options;

  const app = Fastify({
    loggerInstance: logger,
    logController: new LogController({ disableRequestLogging: true }),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook("onRequest", async (request) => {
    request.correlationId = correlationIdFrom(request.headers["request-id"]);
    enterCorrelationId(request.correlationId);
  });

  app.addHook("onResponse", async (request, reply) => {
    const fields = completedFields(service, request, reply);
    if (reply.statusCode < 400) {
      logger.info(fields);
      return;
    }
    if (reply.statusCode >= 500) {
      const error = failures.get(request)?.error;
      logger.error(
        error instanceof Error ? { ...fields, err: serviceError(error) } : fields,
      );
      return;
    }
    logger.warn(fields);
  });

  app.setNotFoundHandler((request, reply) => {
    recordRequestFailure(request, notFoundProblem.type);
    return sendProblem(reply, notFoundProblem);
  });

  app.setErrorHandler((error, request, reply) => {
    if (isSchemaValidationError(error)) {
      recordRequestFailure(request, validationFailedProblem.type);
      return sendProblem(reply, validationFailedProblem);
    }
    recordRequestFailure(request, internalErrorProblem.type, error);
    return sendProblem(reply, internalErrorProblem);
  });

  if (authenticator !== undefined) {
    const callerOnUnauthorized = authenticator.onUnauthorized;
    await registerPlatformServiceAuthenticator(
      app as unknown as Parameters<typeof registerPlatformServiceAuthenticator>[0],
      {
        ...authenticator,
        publicRoutes: [
          { method: "GET", path: "/health" },
          ...(authenticator.publicRoutes ?? []),
        ],
        onUnauthorized(request) {
          recordRequestFailure(request, unauthorizedProblem.type);
          callerOnUnauthorized?.(request);
        },
      },
    );
  }

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal("ok"),
          }),
        },
      },
    },
    () => ({ status: "ok" as const }),
  );

  return app;
}
