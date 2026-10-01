import { Failures } from "../domain/failures.js";
import type { AuthFailure } from "../domain/failures.js";
import { sha256Hex } from "./crypto.js";
import { OWNER_ACCESS_SECONDS, type OwnerTokenResponse, type UseCaseDeps } from "./ports.js";
import { err, ok, type Result } from "./result.js";

export async function refresh(
  deps: UseCaseDeps,
  input: { refreshToken: string },
): Promise<Result<OwnerTokenResponse, AuthFailure>> {
  const presentedVerifier = sha256Hex(input.refreshToken);
  const session = await deps.store.findSessionByVerifier(presentedVerifier);
  if (session === null) {
    return err(Failures.credentialsRejected());
  }

  const presented = session.verifiers.find(
    (verifier) => verifier.verifier === presentedVerifier,
  );
  if (presented === undefined || !presented.current) {
    await deps.store.deleteSession(session.id);
    return err(Failures.credentialsRejected());
  }

  if (deps.now().getTime() >= session.absoluteExpiresAt.getTime()) {
    await deps.store.deleteSession(session.id);
    return err(Failures.credentialsRejected());
  }

  const lookup = await deps.owners.findByOwnerId(session.ownerId);
  if (lookup.status === "unavailable") {
    return err(Failures.ownerPetManagerUnavailable());
  }

  const fingerprintMatches =
    lookup.status === "found" &&
    sha256Hex(lookup.credentials.passwordHash) === session.passwordFingerprint;
  if (lookup.status !== "found" || !lookup.credentials.active || !fingerprintMatches) {
    await deps.store.deleteSessionsForOwner(session.ownerId);
    return err(Failures.credentialsRejected());
  }

  const refreshToken = deps.tokens.newSecret();
  const rotated = await deps.store.rotateRefresh({
    presentedVerifier,
    nextVerifier: sha256Hex(refreshToken),
    now: deps.now(),
  });
  if (rotated !== "rotated") {
    return err(Failures.credentialsRejected());
  }

  const now = deps.now();
  const accessToken = await deps.signer.signOwner(
    session.ownerId,
    OWNER_ACCESS_SECONDS,
    now,
  );
  return ok({
    accessToken,
    tokenType: "Bearer",
    expiresIn: OWNER_ACCESS_SECONDS,
    refreshToken,
  });
}
