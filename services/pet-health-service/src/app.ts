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
} from "@my-pet-care/contracts";

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

export function buildApp(service: string, logger: Logger) {
  const app = Fastify({
    loggerInstance: logger,
    logController: new LogController({ disableRequestLogging: true }),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook("onRequest", async (request) => {
    request.correlationId = correlationIdFrom(request.headers["request-id"]);
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
    failures.set(request, {
      problemType: internalErrorProblem.type,
      error,
    });
    return sendProblem(reply, internalErrorProblem);
  });

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
