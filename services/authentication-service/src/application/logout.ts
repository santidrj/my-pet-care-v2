import { sha256Hex } from "./crypto.js";
import type { UseCaseDeps } from "./ports.js";
import { ok, type Result } from "./result.js";

export async function logout(
  deps: UseCaseDeps,
  input: { refreshToken: string },
): Promise<Result<void, never>> {
  const verifier = sha256Hex(input.refreshToken);
  const session = await deps.store.findSessionByVerifier(verifier);
  if (session === null) {
    return ok(undefined);
  }
  const presented = session.verifiers.find((item) => item.verifier === verifier);
  if (presented === undefined || !presented.current) {
    return ok(undefined);
  }
  await deps.store.deleteSession(session.id);
  return ok(undefined);
}
