import type { Logger } from "pino";
import { buildServiceApp } from "@my-pet-care/service-skeleton";

export function buildApp(service: string, logger: Logger) {
  return buildServiceApp({ service, logger });
}
