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
