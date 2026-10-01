import { randomBytes } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import type { IdGenerator, TokenFactory } from "../application/ports.js";

export function createUuidV7Generator(): IdGenerator {
  return {
    next(): string {
      return uuidv7();
    },
  };
}

export function createTokenFactory(): TokenFactory {
  return {
    newSecret(): string {
      return randomBytes(32).toString("base64url");
    },
  };
}
