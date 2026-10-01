import { Failures, type DomainFailure } from "../domain/failures.js";

type PgErrorLike = {
  code?: string;
  constraint?: string;
  cause?: unknown;
};

function asPgError(error: unknown): PgErrorLike | null {
  if (error === null || typeof error !== "object") {
    return null;
  }
  return error as PgErrorLike;
}

function findPgUniqueViolation(
  error: unknown,
): { constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 8; depth += 1) {
    const pg = asPgError(current);
    if (pg === null) {
      return null;
    }
    if (pg.code === "23505") {
      return { constraint: pg.constraint };
    }
    if (pg.cause === undefined) {
      return null;
    }
    current = pg.cause;
  }
  return null;
}

/** Maps a Postgres unique-index violation on owners to a domain failure, if applicable. */
export function mapOwnerUniqueViolation(error: unknown): DomainFailure | null {
  const violation = findPgUniqueViolation(error);
  if (violation === null) {
    return null;
  }
  switch (violation.constraint) {
    case "owners_username_uidx":
      return Failures.usernameTaken();
    case "owners_email_lower_uidx":
      return Failures.emailTaken();
    default:
      return Failures.usernameTaken();
  }
}
