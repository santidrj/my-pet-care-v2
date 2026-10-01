import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  HTTPMethods,
} from "fastify";
import fp from "fastify-plugin";
import { unauthorizedProblem } from "@my-pet-care/contracts";
import {
  verifyToken,
  type Actor,
  type VerifyTokenOptions,
} from "./verify-token.js";

export type PublicRoutePattern = {
  method: HTTPMethods | "*" | string;
  /** Exact path, or a path ending in `/*` for prefix match. */
  path: string;
};

export type AuthenticatorPluginOptions = VerifyTokenOptions & {
  publicRoutes?: PublicRoutePattern[];
  /** Called just before the uniform 401 is sent. Used to record the failure for service logs. */
  onUnauthorized?: (request: FastifyRequest) => void;
};

declare module "fastify" {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

function pathnameOf(url: string): string {
  const path = url.split("?", 1)[0] ?? "/";
  return path.length === 0 ? "/" : path;
}

function methodMatches(
  pattern: PublicRoutePattern["method"],
  method: string,
): boolean {
  if (pattern === "*") {
    return true;
  }
  return pattern.toUpperCase() === method.toUpperCase();
}

function pathMatches(pattern: string, pathname: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1); // keep trailing slash of "foo/"
    return pathname === pattern.slice(0, -2) || pathname.startsWith(prefix);
  }
  return pathname === pattern;
}

export function isPublicRoute(
  publicRoutes: PublicRoutePattern[],
  method: string,
  url: string,
): boolean {
  const pathname = pathnameOf(url);
  return publicRoutes.some(
    (route) =>
      methodMatches(route.method, method) && pathMatches(route.path, pathname),
  );
}

function sendUnauthorized(reply: FastifyReply) {
  return reply
    .status(unauthorizedProblem.status)
    .header("content-type", "application/problem+json")
    .send(unauthorizedProblem);
}

function bearerTokenFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string") {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1];
}

const authenticatorPlugin: FastifyPluginAsync<AuthenticatorPluginOptions> = async (
  app,
  options,
) => {
  const publicRoutes = options.publicRoutes ?? [];

  app.decorateRequest("actor", null);

  app.addHook("onRequest", async (request, reply) => {
    if (isPublicRoute(publicRoutes, request.method, request.url)) {
      return;
    }

    const token = bearerTokenFrom(request);
    if (token === undefined) {
      options.onUnauthorized?.(request);
      return sendUnauthorized(reply);
    }

    try {
      request.actor = await verifyToken(token, {
        publicKey: options.publicKey,
      });
    } catch {
      options.onUnauthorized?.(request);
      return sendUnauthorized(reply);
    }
  });
};

/** Break Fastify encapsulation so auth applies to sibling routes on the parent. */
export const platformServiceAuthenticator = fp(authenticatorPlugin, {
  name: "platform-service-authenticator",
  fastify: "5.x",
});

export async function registerPlatformServiceAuthenticator(
  app: FastifyInstance,
  options: AuthenticatorPluginOptions,
): Promise<void> {
  await app.register(platformServiceAuthenticator, options);
}
