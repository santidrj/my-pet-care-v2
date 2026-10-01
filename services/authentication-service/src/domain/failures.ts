export type AuthFailureCode =
  | "validation_failed"
  | "credentials_rejected"
  | "unauthorized"
  | "forbidden"
  | "resource_not_found"
  | "try_again_later"
  | "owner_pet_manager_unavailable"
  | "mail_delivery_failed";

export type AuthFailure = {
  code: AuthFailureCode;
};

export const Failures = {
  validation: (): AuthFailure => ({ code: "validation_failed" }),
  credentialsRejected: (): AuthFailure => ({ code: "credentials_rejected" }),
  unauthorized: (): AuthFailure => ({ code: "unauthorized" }),
  forbidden: (): AuthFailure => ({ code: "forbidden" }),
  notFound: (): AuthFailure => ({ code: "resource_not_found" }),
  tryAgainLater: (): AuthFailure => ({ code: "try_again_later" }),
  ownerPetManagerUnavailable: (): AuthFailure => ({
    code: "owner_pet_manager_unavailable",
  }),
  mailDeliveryFailed: (): AuthFailure => ({ code: "mail_delivery_failed" }),
} as const;
