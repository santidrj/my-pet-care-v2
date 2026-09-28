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
} from "fastify-type-provider-zod";
import type { Logger } from "pino";
import { z } from "zod";
import {
  internalErrorProblem,
  notFoundProblem,
  problemDetailsSchema,
  type ProblemDetails,
  validationFailedProblem,
} from "@my-pet-care/contracts";
import {
  registerPlatformServiceAuthenticator,
  type AuthenticatorPluginOptions,
} from "@my-pet-care/platform-service-authenticator";
import type { UseCaseDeps } from "./application/ports.js";
import { registerRoutes } from "./http/routes.js";
import { enterCorrelationId } from "./infrastructure/correlation.js";

declare module "fastify" {
  interface FastifyRequest {
    correlationId?: string;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FailureState {
  problemType: string;
  error?: unknown;
}

const failures = new WeakMap<FastifyRequest, FailureState>();

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
    for (const [key, value] of Object.entries(params)) {
      fields[key] = value;
    }
  }

  if (outcome === "failure") {
    fields.problemType = failures.get(request)?.problemType;
  }

  return fields;
}

export type BuildAppOptions = {
  service: string;
  logger: Logger;
  deps: UseCaseDeps;
  authenticator: AuthenticatorPluginOptions;
};

export async function buildApp(options: BuildAppOptions) {
  const { service, logger, deps, authenticator } = options;

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
    failures.set(request, { problemType: notFoundProblem.type });
    return sendProblem(reply, notFoundProblem);
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      error !== null &&
      typeof error === "object" &&
      "validation" in error
    ) {
      failures.set(request, { problemType: validationFailedProblem.type });
      return sendProblem(reply, validationFailedProblem);
    }
    failures.set(request, {
      problemType: internalErrorProblem.type,
      error,
    });
    return sendProblem(reply, internalErrorProblem);
  });

  await registerPlatformServiceAuthenticator(
    app as unknown as Parameters<typeof registerPlatformServiceAuthenticator>[0],
    {
      ...authenticator,
      publicRoutes: [
        { method: "GET", path: "/health" },
        { method: "POST", path: "/owners" },
        ...(authenticator.publicRoutes ?? []),
      ],
    },
  );

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

  registerRoutes(
    app as unknown as Parameters<typeof registerRoutes>[0],
    deps,
    {
      record(request, problemType, error) {
        failures.set(request, { problemType, error });
      },
    },
  );

  return app;
}
