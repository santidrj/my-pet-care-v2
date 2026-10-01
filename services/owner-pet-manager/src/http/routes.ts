import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { UseCaseDeps } from "../application/ports.js";
import {
  createOwner,
  deactivateOwner,
  getCredentialsByIdentifier,
  getCredentialsByOwnerId,
  getOwnerById,
  getOwnerByUsername,
  setPasswordFromAuth,
  setPetListVisibility,
  updateOwner,
} from "../application/owners.js";
import {
  checkPetOwnership,
  createPet,
  deactivatePet,
  getPet,
  getPetSummary,
  listPetsForOwner,
  updatePet,
} from "../application/pets.js";
import type { Result } from "../application/result.js";
import type { DomainFailure } from "../domain/failures.js";
import { problemFromFailure } from "./problems.js";

type FailureRecorder = {
  record(request: FastifyRequest, problemType: string, error?: unknown): void;
};

function sendProblem(
  reply: FastifyReply,
  problem: ReturnType<typeof problemFromFailure>,
) {
  return reply
    .status(problem.status)
    .header("content-type", "application/problem+json")
    .serializer((payload) => JSON.stringify(payload))
    .send(problem);
}

async function mapResult<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  result: Result<T, DomainFailure>,
  failures: FailureRecorder,
  successStatus: number,
): Promise<unknown> {
  if (!result.ok) {
    const problem = problemFromFailure(result.error);
    failures.record(request, problem.type);
    return sendProblem(reply, problem);
  }
  if (successStatus === 204) {
    return reply.status(204).send();
  }
  return reply.status(successStatus).send(result.value);
}

const createOwnerBody = z
  .object({
    username: z.string().min(1),
    email: z.string().min(1),
    password: z.string().min(1),
    photo: z.string().min(1).optional(),
  })
  .strict();

const updateOwnerBody = z
  .object({
    username: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    photo: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required.",
  });

const visibilityBody = z
  .object({
    petListVisibility: z.enum(["public", "private"]),
  })
  .strict();

const setPasswordBody = z
  .object({
    password: z.string().min(1),
  })
  .strict();

const createPetBody = z
  .object({
    name: z.string().min(1),
    species: z.enum(["dog", "cat"]),
    sex: z.enum(["male", "female", "unknown"]),
    breed: z.string().min(1).optional(),
    dateOfBirth: z.string().min(1).optional(),
    photo: z.string().min(1).optional(),
  })
  .strict();

const updatePetBody = z
  .object({
    name: z.string().min(1).optional(),
    species: z.enum(["dog", "cat"]).optional(),
    sex: z.enum(["male", "female", "unknown"]).optional(),
    breed: z.string().min(1).nullable().optional(),
    dateOfBirth: z.string().min(1).nullable().optional(),
    photo: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required.",
  });

export function registerRoutes(
  app: FastifyInstance,
  deps: UseCaseDeps,
  failures: FailureRecorder,
): void {
  app.post(
    "/owners",
    {
      schema: {
        body: createOwnerBody,
      },
    },
    async (request, reply) => {
      const body = request.body as z.infer<typeof createOwnerBody>;
      const result = await createOwner(deps, body);
      return mapResult(request, reply, result, failures, 201);
    },
  );

  app.get(
    "/owners",
    {
      schema: {
        querystring: z.object({
          username: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const query = request.query as { username: string };
      const result = await getOwnerByUsername(deps, request.actor, query.username);
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.get(
    "/owners/credentials",
    {
      schema: {
        querystring: z.object({
          identifier: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const query = request.query as { identifier: string };
      const result = await getCredentialsByIdentifier(
        deps,
        request.actor,
        query.identifier,
      );
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.get(
    "/owners/:ownerId/credentials",
    {
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const params = request.params as { ownerId: string };
      const result = await getCredentialsByOwnerId(
        deps,
        request.actor,
        params.ownerId,
      );
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.put(
    "/owners/:ownerId/credentials/password",
    {
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
        body: setPasswordBody,
      },
    },
    async (request, reply) => {
      const params = request.params as { ownerId: string };
      const body = request.body as z.infer<typeof setPasswordBody>;
      const result = await setPasswordFromAuth(
        deps,
        request.actor,
        params.ownerId,
        body.password,
      );
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.get(
    "/owners/:ownerId",
    {
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const params = request.params as { ownerId: string };
      const result = await getOwnerById(deps, request.actor, params.ownerId);
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.patch(
    "/owners/:ownerId",
    {
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
        body: updateOwnerBody,
      },
    },
    async (request, reply) => {
      const params = request.params as { ownerId: string };
      const body = request.body as z.infer<typeof updateOwnerBody>;
      const result = await updateOwner(deps, request.actor, params.ownerId, body);
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.delete(
    "/owners/:ownerId",
    {
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const params = request.params as { ownerId: string };
      const result = await deactivateOwner(deps, request.actor, params.ownerId);
      return mapResult(request, reply, result, failures, 204);
    },
  );

  app.put(
    "/owners/:ownerId/pet-list-visibility",
    {
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
        body: visibilityBody,
      },
    },
    async (request, reply) => {
      const params = request.params as { ownerId: string };
      const body = request.body as z.infer<typeof visibilityBody>;
      const result = await setPetListVisibility(
        deps,
        request.actor,
        params.ownerId,
        body.petListVisibility,
      );
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.post(
    "/owners/:ownerId/pets",
    {
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
        body: createPetBody,
      },
    },
    async (request, reply) => {
      const params = request.params as { ownerId: string };
      const body = request.body as z.infer<typeof createPetBody>;
      const result = await createPet(deps, request.actor, params.ownerId, body);
      return mapResult(request, reply, result, failures, 201);
    },
  );

  app.get(
    "/owners/:ownerId/pets",
    {
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
        querystring: z.object({
          status: z.enum(["active", "all"]).optional(),
        }),
      },
    },
    async (request, reply) => {
      const params = request.params as { ownerId: string };
      const query = request.query as { status?: "active" | "all" };
      const result = await listPetsForOwner(
        deps,
        request.actor,
        params.ownerId,
        query.status ?? "active",
      );
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.get(
    "/pets/:petId",
    {
      schema: {
        params: z.object({ petId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const params = request.params as { petId: string };
      const result = await getPet(deps, request.actor, params.petId);
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.patch(
    "/pets/:petId",
    {
      schema: {
        params: z.object({ petId: z.string().uuid() }),
        body: updatePetBody,
      },
    },
    async (request, reply) => {
      const params = request.params as { petId: string };
      const body = request.body as z.infer<typeof updatePetBody>;
      const result = await updatePet(deps, request.actor, params.petId, body);
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.delete(
    "/pets/:petId",
    {
      schema: {
        params: z.object({ petId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const params = request.params as { petId: string };
      const result = await deactivatePet(deps, request.actor, params.petId);
      return mapResult(request, reply, result, failures, 204);
    },
  );

  app.get(
    "/pets/:petId/summary",
    {
      schema: {
        params: z.object({ petId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const params = request.params as { petId: string };
      const result = await getPetSummary(deps, request.actor, params.petId);
      return mapResult(request, reply, result, failures, 200);
    },
  );

  app.get(
    "/pets/:petId/owners/:ownerId",
    {
      schema: {
        params: z.object({
          petId: z.string().uuid(),
          ownerId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const params = request.params as { petId: string; ownerId: string };
      const result = await checkPetOwnership(
        deps,
        request.actor,
        params.petId,
        params.ownerId,
      );
      return mapResult(request, reply, result, failures, 200);
    },
  );
}
