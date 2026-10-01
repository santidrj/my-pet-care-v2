import type { Actor } from "@my-pet-care/platform-service-authenticator";
import { Failures } from "../domain/failures.js";
import type { AuthFailure } from "../domain/failures.js";
import type { UseCaseDeps } from "./ports.js";
import { err, ok, type Result } from "./result.js";

export async function revokeOwnerSessions(
  deps: UseCaseDeps,
  actor: Actor | null,
  ownerId: string,
): Promise<Result<void, AuthFailure>> {
  if (actor === null) {
    return err(Failures.unauthorized());
  }
  if (actor.kind !== "platform" || actor.service !== "owner-pet-manager") {
    return err(Failures.forbidden());
  }
  await deps.store.deleteSessionsForOwner(ownerId);
  return ok(undefined);
}
