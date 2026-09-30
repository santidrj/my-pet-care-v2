import { Failures } from "../domain/failures.js";
import { classifyIdentifier, rateLimitSubject } from "../domain/identifier.js";
import { sha256Hex } from "./crypto.js";
import {
  LOGIN_ADDRESS_LIMIT,
  LOGIN_SUBJECT_LIMIT,
  LOGIN_WINDOW_MS,
  OWNER_ACCESS_SECONDS,
  SESSION_TTL_MS,
  type OwnerTokenResponse,
  type UseCaseDeps,
} from "./ports.js";
import { err, ok, type Result } from "./result.js";
import type { AuthFailure } from "../domain/failures.js";

export async function login(
  deps: UseCaseDeps,
  input: { identifier: string; password: string; address: string },
): Promise<Result<OwnerTokenResponse, AuthFailure>> {
  const classified = classifyIdentifier(input.identifier);
  const subject = rateLimitSubject(input.identifier);
  if (classified === null || subject === null) {
    return err(Failures.validation());
  }

  const reservation = await deps.store.reserveRateSlot({
    id: deps.ids.next(),
    kind: "login",
    subject,
    address: input.address,
    now: deps.now(),
    windowMs: LOGIN_WINDOW_MS,
    subjectLimit: LOGIN_SUBJECT_LIMIT,
    addressLimit: LOGIN_ADDRESS_LIMIT,
  });
  if (!reservation.reserved) {
    return err(Failures.tryAgainLater());
  }

  const lookup = await deps.owners.findByIdentifier(input.identifier);
  if (lookup.status === "unavailable") {
    await deps.store.releaseRateSlot(reservation.id);
    return err(Failures.ownerPetManagerUnavailable());
  }

  const hash =
    lookup.status === "found" ? lookup.credentials.passwordHash : deps.passwords.dummyHash;
  const passwordMatches = await deps.passwords.verify(hash, input.password);
  const accepted =
    lookup.status === "found" && lookup.credentials.active && passwordMatches;
  if (!accepted || lookup.status !== "found") {
    return err(Failures.credentialsRejected());
  }

  const now = deps.now();
  const refreshToken = deps.tokens.newSecret();
  await deps.store.insertSession({
    id: deps.ids.next(),
    ownerId: lookup.credentials.ownerId,
    passwordFingerprint: sha256Hex(lookup.credentials.passwordHash),
    createdAt: now,
    absoluteExpiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    verifiers: [{ verifier: sha256Hex(refreshToken), current: true }],
  });
  const accessToken = await deps.signer.signOwner(
    lookup.credentials.ownerId,
    OWNER_ACCESS_SECONDS,
    now,
  );
  await deps.store.releaseRateSlot(reservation.id);
  return ok({
    accessToken,
    tokenType: "Bearer",
    expiresIn: OWNER_ACCESS_SECONDS,
    refreshToken,
  });
}
