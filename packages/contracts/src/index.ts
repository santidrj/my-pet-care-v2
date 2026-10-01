import { z } from "zod";

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int(),
  detail: z.string(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const notFoundProblem = {
  type: "urn:my-pet-care:not-found",
  title: "Not Found",
  status: 404,
  detail: "No route matches this request.",
} as const satisfies ProblemDetails;

export const internalErrorProblem = {
  type: "urn:my-pet-care:internal-error",
  title: "Internal Server Error",
  status: 500,
  detail: "The service failed to handle this request.",
} as const satisfies ProblemDetails;

export const unauthorizedProblem = {
  type: "urn:my-pet-care:unauthorized",
  title: "Unauthorized",
  status: 401,
  detail: "Authentication is required to access this resource.",
} as const satisfies ProblemDetails;

export const validationFailedProblem = {
  type: "urn:my-pet-care:validation-failed",
  title: "Bad Request",
  status: 400,
  detail: "The request is invalid.",
} as const satisfies ProblemDetails;

export const forbiddenProblem = {
  type: "urn:my-pet-care:forbidden",
  title: "Forbidden",
  status: 403,
  detail: "You are not allowed to perform this operation.",
} as const satisfies ProblemDetails;

export const conflictProblem = {
  type: "urn:my-pet-care:conflict",
  title: "Conflict",
  status: 409,
  detail: "The request conflicts with the current state of the resource.",
} as const satisfies ProblemDetails;

export const usernameTakenProblem = {
  type: "urn:my-pet-care:username-taken",
  title: "Conflict",
  status: 409,
  detail: "Username is already in use.",
} as const satisfies ProblemDetails;

export const emailTakenProblem = {
  type: "urn:my-pet-care:email-taken",
  title: "Conflict",
  status: 409,
  detail: "Email is already in use.",
} as const satisfies ProblemDetails;

export const ownerAlreadyDeactivatedProblem = {
  type: "urn:my-pet-care:owner-already-deactivated",
  title: "Conflict",
  status: 409,
  detail: "The Owner is already deactivated.",
} as const satisfies ProblemDetails;

export const ownerDeactivatedProblem = {
  type: "urn:my-pet-care:owner-deactivated",
  title: "Conflict",
  status: 409,
  detail: "This Owner is deactivated.",
} as const satisfies ProblemDetails;

export const communityOwnerProblem = {
  type: "urn:my-pet-care:community-owner",
  title: "Conflict",
  status: 409,
  detail: "This Owner cannot be deactivated while they are a Community owner.",
} as const satisfies ProblemDetails;

export const petAlreadyDeactivatedProblem = {
  type: "urn:my-pet-care:pet-already-deactivated",
  title: "Conflict",
  status: 409,
  detail: "The Pet is already deactivated.",
} as const satisfies ProblemDetails;

export const resourceNotFoundProblem = {
  type: "urn:my-pet-care:resource-not-found",
  title: "Not Found",
  status: 404,
  detail: "The requested resource was not found.",
} as const satisfies ProblemDetails;

export const communityCheckUnavailableProblem = {
  type: "urn:my-pet-care:community-check-unavailable",
  title: "Conflict",
  status: 409,
  detail: "Owner deactivation could not be completed.",
} as const satisfies ProblemDetails;

export const petDeactivatedProblem = {
  type: "urn:my-pet-care:pet-deactivated",
  title: "Conflict",
  status: 409,
  detail: "This Pet is deactivated.",
} as const satisfies ProblemDetails;

export const latestWeightMissingProblem = {
  type: "urn:my-pet-care:latest-weight-missing",
  title: "Conflict",
  status: 409,
  detail: "This Pet has no latest weight.",
} as const satisfies ProblemDetails;

export const shareUnavailableProblem = {
  type: "urn:my-pet-care:share-unavailable",
  title: "Gone",
  status: 410,
  detail: "This share is no longer available.",
} as const satisfies ProblemDetails;

export const ownerPetManagerUnavailableProblem = {
  type: "urn:my-pet-care:owner-pet-manager-unavailable",
  title: "Service Unavailable",
  status: 503,
  detail: "Owner & Pet Manager could not be reached.",
} as const satisfies ProblemDetails;

export const petHealthUnavailableProblem = {
  type: "urn:my-pet-care:pet-health-unavailable",
  title: "Service Unavailable",
  status: 503,
  detail: "Pet Health Service could not be reached.",
} as const satisfies ProblemDetails;

export const communityCollaboratorUnavailableProblem = {
  type: "urn:my-pet-care:community-collaborator-unavailable",
  title: "Service Unavailable",
  status: 503,
  detail: "The Community collaborator could not be reached.",
} as const satisfies ProblemDetails;
