import {
  PLATFORM_SERVICE_IDS,
  type PlatformServiceId,
} from "@my-pet-care/platform-service-authenticator";
import { Failures } from "../domain/failures.js";
import type { AuthFailure } from "../domain/failures.js";
import { secretsMatch } from "./crypto.js";
import type { UseCaseDeps } from "./ports.js";
import { err, ok, type Result } from "./result.js";

function isPlatformServiceId(value: string): value is PlatformServiceId {
  return (PLATFORM_SERVICE_IDS as readonly string[]).includes(value);
}

export async function ensurePlatformClient(
  deps: UseCaseDeps,
  input: {
    serviceId: string;
    secret: unknown;
    active: unknown;
    setupSecret: unknown;
  },
): Promise<Result<void, AuthFailure>> {
  const setupSecret = typeof input.setupSecret === "string" ? input.setupSecret : "";
  if (setupSecret.length === 0 || !secretsMatch(setupSecret, deps.setupSecret)) {
    return err(Failures.unauthorized());
  }

  if (
    typeof input.secret !== "string" ||
    input.secret.length === 0 ||
    typeof input.active !== "boolean" ||
    !isPlatformServiceId(input.serviceId)
  ) {
    return err(Failures.validation());
  }

  const existing = await deps.store.findPlatformClient(input.serviceId);
  if (
    existing !== null &&
    existing.active === input.active &&
    (await deps.passwords.verify(existing.secretHash, input.secret))
  ) {
    return ok(undefined);
  }

  const secretHash = await deps.passwords.hash(input.secret);
  await deps.store.upsertPlatformClient({
    serviceId: input.serviceId,
    secretHash,
    active: input.active,
  });
  return ok(undefined);
}
