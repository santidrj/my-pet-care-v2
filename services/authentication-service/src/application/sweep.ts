import type { UseCaseDeps } from "./ports.js";

export async function sweep(deps: UseCaseDeps): Promise<void> {
  await deps.store.sweep(deps.now());
}
