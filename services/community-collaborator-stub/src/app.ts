import Fastify from "fastify";
import type { Logger } from "pino";

export type StubOptions = {
  /** Owner ids for which GET community-ownership returns true. */
  communityOwnerIds: ReadonlySet<string>;
};

/**
 * Community collaborator stub used by OPM until the real collaborator exists.
 *
 * OPM calls (Authorization header ignored):
 * - GET  /owners/{ownerId}/community-ownership → { isCommunityOwner }
 * - POST /owners/{ownerId}/belonging-endings → 204
 */
export function buildApp(logger: Logger, options: StubOptions) {
  const app = Fastify({ loggerInstance: logger });

  app.get("/health", async () => ({ status: "ok" as const }));

  app.get<{ Params: { ownerId: string } }>(
    "/owners/:ownerId/community-ownership",
    async (request) => ({
      isCommunityOwner: options.communityOwnerIds.has(request.params.ownerId),
    }),
  );

  app.post<{ Params: { ownerId: string } }>(
    "/owners/:ownerId/belonging-endings",
    async (_request, reply) => {
      return reply.status(204).send();
    },
  );

  return app;
}
