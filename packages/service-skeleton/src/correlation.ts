import { AsyncLocalStorage } from "node:async_hooks";

type CorrelationStore = {
  correlationId: string;
};

const storage = new AsyncLocalStorage<CorrelationStore>();

export function runWithCorrelationId<T>(
  correlationId: string,
  fn: () => T,
): T {
  return storage.run({ correlationId }, fn);
}

export function enterCorrelationId(correlationId: string): void {
  storage.enterWith({ correlationId });
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
