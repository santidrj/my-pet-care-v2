import {
  communityCheckUnavailableProblem,
  communityOwnerProblem,
  emailTakenProblem,
  forbiddenProblem,
  internalErrorProblem,
  ownerAlreadyDeactivatedProblem,
  ownerDeactivatedProblem,
  petAlreadyDeactivatedProblem,
  petDeactivatedProblem,
  resourceNotFoundProblem,
  usernameTakenProblem,
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
    case "resource_not_found":
      return { ...resourceNotFoundProblem, detail: failure.detail };
    case "community_check_unavailable":
      return {
        ...communityCheckUnavailableProblem,
        detail: failure.detail,
      };
    case "username_taken":
      return { ...usernameTakenProblem, detail: failure.detail };
    case "email_taken":
      return { ...emailTakenProblem, detail: failure.detail };
    case "owner_already_deactivated":
      return { ...ownerAlreadyDeactivatedProblem, detail: failure.detail };
    case "owner_deactivated":
      return { ...ownerDeactivatedProblem, detail: failure.detail };
    case "community_owner":
      return { ...communityOwnerProblem, detail: failure.detail };
    case "pet_deactivated":
      return { ...petDeactivatedProblem, detail: failure.detail };
    case "pet_already_deactivated":
      return { ...petAlreadyDeactivatedProblem, detail: failure.detail };
    default: {
      const _exhaustive: never = failure.code;
      void _exhaustive;
      return internalErrorProblem;
    }
  }
}
