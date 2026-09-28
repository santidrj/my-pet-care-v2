import { v7 as uuidv7 } from "uuid";
import type { IdGenerator } from "../application/ports.js";

export function createUuidV7Generator(): IdGenerator {
  return {
    next(): string {
      return uuidv7();
    },
  };
}

export function createSequentialIdGenerator(prefix = "id"): IdGenerator {
  let n = 0;
  return {
    next(): string {
      n += 1;
      return `${prefix}-${String(n).padStart(4, "0")}`;
    },
  };
}
