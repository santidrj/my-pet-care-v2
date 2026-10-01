import {
  credentialsRejectedProblem,
  forbiddenProblem,
  internalErrorProblem,
  mailDeliveryFailedProblem,
  ownerPetManagerUnavailableProblem,
  resourceNotFoundProblem,
  tryAgainLaterProblem,
  unauthorizedProblem,
  validationFailedProblem,
  type ProblemDetails,
} from "@my-pet-care/contracts";
import type { AuthFailure } from "../domain/failures.js";

export function problemFromFailure(failure: AuthFailure): ProblemDetails {
  switch (failure.code) {
    case "validation_failed":
      return validationFailedProblem;
    case "credentials_rejected":
      return credentialsRejectedProblem;
    case "unauthorized":
      return unauthorizedProblem;
    case "forbidden":
      return forbiddenProblem;
    case "resource_not_found":
      return resourceNotFoundProblem;
    case "try_again_later":
      return tryAgainLaterProblem;
    case "owner_pet_manager_unavailable":
      return ownerPetManagerUnavailableProblem;
    case "mail_delivery_failed":
      return mailDeliveryFailedProblem;
    default: {
      const _exhaustive: never = failure.code;
      void _exhaustive;
      return internalErrorProblem;
    }
  }
}
