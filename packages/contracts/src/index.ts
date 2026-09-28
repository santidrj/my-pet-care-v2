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
