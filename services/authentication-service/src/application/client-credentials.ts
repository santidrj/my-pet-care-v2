import {
  PLATFORM_SERVICE_IDS,
  type PlatformServiceId,
} from "@my-pet-care/platform-service-authenticator";
import { Failures } from "../domain/failures.js";
import type { AuthFailure } from "../domain/failures.js";
import {
  CLIENT_ADDRESS_LIMIT,
  CLIENT_SUBJECT_LIMIT,
  LOGIN_WINDOW_MS,
  PLATFORM_ACCESS_SECONDS,
  type PlatformTokenResponse,
  type UseCaseDeps,
} from "./ports.js";
import { err, ok, type Result } from "./result.js";

function isPlatformServiceId(value: string): value is PlatformServiceId {
  return (PLATFORM_SERVICE_IDS as readonly string[]).includes(value);
}

export async function clientCredentials(
  deps: UseCaseDeps,
  input: { serviceId: string; secret: string; address: string },
): Promise<Result<PlatformTokenResponse, AuthFailure>> {
  const reservation = await deps.store.reserveRateSlot({
    id: deps.ids.next(),
    kind: "client_credentials",
    subject: input.serviceId,
    address: input.address,
    now: deps.now(),
    windowMs: LOGIN_WINDOW_MS,
    subjectLimit: CLIENT_SUBJECT_LIMIT,
    addressLimit: CLIENT_ADDRESS_LIMIT,
  });
  if (!reservation.reserved) {
    return err(Failures.tryAgainLater());
  }

  const client = isPlatformServiceId(input.serviceId)
    ? await deps.store.findPlatformClient(input.serviceId)
    : null;
  const hash = client === null ? deps.passwords.dummyHash : client.secretHash;
  const secretMatches = await deps.passwords.verify(hash, input.secret);
  if (client === null || !client.active || !secretMatches) {
    return err(Failures.credentialsRejected());
  }

  await deps.store.releaseRateSlot(reservation.id);
  const now = deps.now();
  const accessToken = await deps.signer.signPlatform(
    client.serviceId,
    PLATFORM_ACCESS_SECONDS,
    now,
  );
  return ok({
    accessToken,
    tokenType: "Bearer",
    expiresIn: PLATFORM_ACCESS_SECONDS,
  });
}
