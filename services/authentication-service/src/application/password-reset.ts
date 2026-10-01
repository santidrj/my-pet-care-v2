import { Failures } from "../domain/failures.js";
import type { AuthFailure } from "../domain/failures.js";
import { isValidEmail } from "../domain/identifier.js";
import { sha256Hex } from "./crypto.js";
import {
  RESET_SUBJECT_LIMIT,
  RESET_TTL_MS,
  RESET_WINDOW_MS,
  type UseCaseDeps,
} from "./ports.js";
import { err, ok, type Result } from "./result.js";

export async function requestPasswordReset(
  deps: UseCaseDeps,
  input: { email: string; address: string },
): Promise<Result<void, AuthFailure>> {
  if (!isValidEmail(input.email)) {
    return err(Failures.validation());
  }

  const subject = input.email.toLowerCase();
  const reservation = await deps.store.reserveRateSlot({
    id: deps.ids.next(),
    kind: "reset",
    subject,
    address: input.address,
    now: deps.now(),
    windowMs: RESET_WINDOW_MS,
    subjectLimit: RESET_SUBJECT_LIMIT,
    addressLimit: null,
  });
  if (!reservation.reserved) {
    return err(Failures.tryAgainLater());
  }

  const lookup = await deps.owners.findByIdentifier(input.email);
  if (lookup.status === "unavailable") {
    await deps.store.releaseRateSlot(reservation.id);
    return err(Failures.ownerPetManagerUnavailable());
  }

  if (lookup.status !== "found" || !lookup.credentials.active) {
    await deps.delay(deps.resetNoSendFloorMs);
    return err(Failures.notFound());
  }

  const resetToken = deps.tokens.newSecret();
  const link = deps.resetLinkTemplate.replace("{token}", resetToken);
  try {
    await deps.mail.send({ to: subject, link });
  } catch {
    await deps.store.releaseRateSlot(reservation.id);
    return err(Failures.mailDeliveryFailed());
  }

  const now = deps.now();
  await deps.store.insertPasswordReset({
    id: deps.ids.next(),
    ownerId: lookup.credentials.ownerId,
    verifier: sha256Hex(resetToken),
    expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    used: false,
  });
  return ok(undefined);
}

export async function completePasswordReset(
  deps: UseCaseDeps,
  input: { resetToken: string; password: string },
): Promise<Result<void, AuthFailure>> {
  const verifier = sha256Hex(input.resetToken);
  let failure: AuthFailure | null = null;
  const outcome = await deps.store.decidePasswordReset({
    verifier,
    now: deps.now(),
    decide: async (reset) => {
      const updated = await deps.owners.setPassword(reset.ownerId, input.password);
      if (updated.status === "validation") {
        failure = Failures.validation();
        return "leave";
      }
      if (updated.status === "unavailable") {
        failure = Failures.ownerPetManagerUnavailable();
        return "leave";
      }
      if (updated.status !== "updated") {
        failure = Failures.notFound();
        return "leave";
      }
      return "consume";
    },
  });
  if (outcome === "consumed") {
    return ok(undefined);
  }
  if (outcome === "left") {
    return err(failure ?? Failures.notFound());
  }
  return err(Failures.notFound());
}
