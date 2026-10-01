import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientCredentials } from "../application/client-credentials.js";
import { ensurePlatformClient } from "../application/ensure-client.js";
import { login } from "../application/login.js";
import { logout } from "../application/logout.js";
import {
  completePasswordReset,
  requestPasswordReset,
} from "../application/password-reset.js";
import type { UseCaseDeps } from "../application/ports.js";
import { refresh } from "../application/refresh.js";
import { revokeOwnerSessions } from "../application/revoke.js";
import type { Result } from "../application/result.js";
import type { AuthFailure } from "../domain/failures.js";
import { problemFromFailure } from "./problems.js";

type App = FastifyInstance<any, any, any, any, ZodTypeProvider>;

const loginBody = z.object({
  identifier: z.string().min(1),
  password: z.string(),
});

const refreshBody = z.object({
  refreshToken: z.string().min(1),
});

const resetRequestBody = z.object({
  email: z.string().min(1),
});

const resetCompleteBody = z.object({
  resetToken: z.string().min(1),
  password: z.string().min(1),
});

const clientCredentialsBody = z.object({
  grantType: z.literal("client_credentials"),
  serviceId: z.string().min(1),
  secret: z.string().min(1),
});

const ensureBody = z.object({
  secret: z.unknown().optional(),
  active: z.unknown().optional(),
  setupSecret: z.unknown().optional(),
});

const revokeBody = z.object({
  reason: z.enum(["deactivation", "passwordChange"]),
});

const ownerTokenResponse = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().min(1),
});

const platformTokenResponse = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
});

function callerAddress(request: FastifyRequest): string {
  return request.ip.length > 0 ? request.ip : "unknown";
}

async function sendResult<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  result: Result<T, AuthFailure>,
  successStatus: number,
  recordFailure: (request: FastifyRequest, problemType: string) => void,
): Promise<void> {
  if (!result.ok) {
    const problem = problemFromFailure(result.error);
    recordFailure(request, problem.type);
    await reply
      .status(problem.status)
      .header("content-type", "application/problem+json")
      .send(problem);
    return;
  }
  if (successStatus === 204) {
    await reply.status(204).send();
    return;
  }
  await reply.status(successStatus).send(result.value);
}

export function registerRoutes(
  app: App,
  deps: UseCaseDeps,
  recordFailure: (request: FastifyRequest, problemType: string) => void,
): void {
  app.post(
    "/auth/login",
    { schema: { body: loginBody, response: { 200: ownerTokenResponse } } },
    async (request, reply) => {
      const body = request.body as z.infer<typeof loginBody>;
      const result = await login(deps, {
        identifier: body.identifier,
        password: body.password,
        address: callerAddress(request),
      });
      await sendResult(request, reply, result, 200, recordFailure);
    },
  );

  app.post(
    "/auth/refresh",
    { schema: { body: refreshBody, response: { 200: ownerTokenResponse } } },
    async (request, reply) => {
      const body = request.body as z.infer<typeof refreshBody>;
      const result = await refresh(deps, { refreshToken: body.refreshToken });
      await sendResult(request, reply, result, 200, recordFailure);
    },
  );

  app.post(
    "/auth/logout",
    { schema: { body: refreshBody } },
    async (request, reply) => {
      const body = request.body as z.infer<typeof refreshBody>;
      const result = await logout(deps, { refreshToken: body.refreshToken });
      await sendResult(request, reply, result, 204, recordFailure);
    },
  );

  app.post(
    "/auth/password-reset/request",
    { schema: { body: resetRequestBody } },
    async (request, reply) => {
      const body = request.body as z.infer<typeof resetRequestBody>;
      const result = await requestPasswordReset(deps, {
        email: body.email,
        address: callerAddress(request),
      });
      await sendResult(request, reply, result, 202, recordFailure);
    },
  );

  app.post(
    "/auth/password-reset/complete",
    { schema: { body: resetCompleteBody } },
    async (request, reply) => {
      const body = request.body as z.infer<typeof resetCompleteBody>;
      const result = await completePasswordReset(deps, {
        resetToken: body.resetToken,
        password: body.password,
      });
      await sendResult(request, reply, result, 204, recordFailure);
    },
  );

  app.post(
    "/oauth/token",
    { schema: { body: clientCredentialsBody, response: { 200: platformTokenResponse } } },
    async (request, reply) => {
      const body = request.body as z.infer<typeof clientCredentialsBody>;
      const result = await clientCredentials(deps, {
        serviceId: body.serviceId,
        secret: body.secret,
        address: callerAddress(request),
      });
      await sendResult(request, reply, result, 200, recordFailure);
    },
  );

  app.put(
    "/platform-clients/:serviceId",
    {
      schema: {
        params: z.object({ serviceId: z.string().min(1) }),
        body: ensureBody,
      },
    },
    async (request, reply) => {
      const params = request.params as { serviceId: string };
      const body = request.body as z.infer<typeof ensureBody>;
      const result = await ensurePlatformClient(deps, {
        serviceId: params.serviceId,
        secret: body.secret,
        active: body.active,
        setupSecret: body.setupSecret,
      });
      await sendResult(request, reply, result, 204, recordFailure);
    },
  );

  app.post(
    "/owners/:ownerId/token-revocations",
    {
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
        body: revokeBody,
      },
    },
    async (request, reply) => {
      const params = request.params as { ownerId: string };
      const result = await revokeOwnerSessions(deps, request.actor, params.ownerId);
      await sendResult(request, reply, result, 204, recordFailure);
    },
  );
}
