import { AsyncLocalStorage } from "node:async_hooks";

type CorrelationStore = {
  correlationId: string;
};

const storage = new AsyncLocalStorage<CorrelationStore>();

export function enterCorrelationId(correlationId: string): void {
  storage.enterWith({ correlationId });
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
