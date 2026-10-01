export type DomainFailureCode =
  | "validation_failed"
  | "forbidden"
  | "resource_not_found"
  | "community_check_unavailable"
  | "username_taken"
  | "email_taken"
  | "owner_already_deactivated"
  | "owner_deactivated"
  | "community_owner"
  | "pet_deactivated"
  | "pet_already_deactivated";

export type DomainFailure = {
  code: DomainFailureCode;
  /** Fixed wire detail; never varies for indistinguishability cases. */
  detail: string;
};

export const Failures = {
  validation: (detail = "The request is invalid."): DomainFailure => ({
    code: "validation_failed",
    detail,
  }),
  forbidden: (
    detail = "You are not allowed to perform this operation.",
  ): DomainFailure => ({
    code: "forbidden",
    detail,
  }),
  notFound: (
    detail = "The requested resource was not found.",
  ): DomainFailure => ({
    code: "resource_not_found",
    detail,
  }),
  /** FR-012: missing, deactivated, and private fail the same way. */
  petSummaryUnavailable: (): DomainFailure => ({
    code: "resource_not_found",
    detail: "Pet summary is not available.",
  }),
  communityCheckUnavailable: (): DomainFailure => ({
    code: "community_check_unavailable",
    detail: "Owner deactivation could not be completed.",
  }),
  ownerAlreadyDeactivated: (): DomainFailure => ({
    code: "owner_already_deactivated",
    detail: "The Owner is already deactivated.",
  }),
  petAlreadyDeactivated: (): DomainFailure => ({
    code: "pet_already_deactivated",
    detail: "The Pet is already deactivated.",
  }),
  communityOwner: (): DomainFailure => ({
    code: "community_owner",
    detail: "This Owner cannot be deactivated while they are a Community owner.",
  }),
  usernameTaken: (): DomainFailure => ({
    code: "username_taken",
    detail: "Username is already in use.",
  }),
  emailTaken: (): DomainFailure => ({
    code: "email_taken",
    detail: "Email is already in use.",
  }),
  ownerDeactivated: (): DomainFailure => ({
    code: "owner_deactivated",
    detail: "This Owner is deactivated.",
  }),
  petDeactivated: (): DomainFailure => ({
    code: "pet_deactivated",
    detail: "This Pet is deactivated.",
  }),
} as const;
