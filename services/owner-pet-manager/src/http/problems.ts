import {
  communityCheckUnavailableProblem,
  conflictProblem,
  forbiddenProblem,
  internalErrorProblem,
  resourceNotFoundProblem,
  validationFailedProblem,
  type ProblemDetails,
} from "@my-pet-care/contracts";
import type { DomainFailure } from "../domain/failures.js";

export function problemFromFailure(failure: DomainFailure): ProblemDetails {
  switch (failure.code) {
    case "validation_failed":
      return { ...validationFailedProblem, detail: failure.detail };
    case "forbidden":
      return { ...forbiddenProblem, detail: failure.detail };
    case "conflict":
      return { ...conflictProblem, detail: failure.detail };
    case "resource_not_found":
      return { ...resourceNotFoundProblem, detail: failure.detail };
    case "community_check_unavailable":
      return {
        ...communityCheckUnavailableProblem,
        detail: failure.detail,
      };
    default: {
      const _exhaustive: never = failure.code;
      void _exhaustive;
      return internalErrorProblem;
    }
  }
}
