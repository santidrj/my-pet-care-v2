export type DomainFailureCode =
  | "validation_failed"
  | "forbidden"
  | "conflict"
  | "resource_not_found"
  | "community_check_unavailable";

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
  conflict: (
    detail = "The request conflicts with the current state of the resource.",
  ): DomainFailure => ({
    code: "conflict",
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
  alreadyDeactivated: (): DomainFailure => ({
    code: "conflict",
    detail: "The resource is already deactivated.",
  }),
  communityOwner: (): DomainFailure => ({
    code: "conflict",
    detail: "This Owner cannot be deactivated while they are a Community owner.",
  }),
  usernameTaken: (): DomainFailure => ({
    code: "conflict",
    detail: "Username or email is already in use.",
  }),
  emailTaken: (): DomainFailure => ({
    code: "conflict",
    detail: "Username or email is already in use.",
  }),
} as const;
