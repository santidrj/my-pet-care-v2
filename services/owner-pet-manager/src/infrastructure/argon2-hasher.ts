import * as argon2 from "argon2";
import type { PasswordHasher } from "../application/ports.js";

/** OWASP minimum Argon2id: m=19456 KiB, t=2, p=1 (ADR-0012). */
export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function createArgon2PasswordHasher(): PasswordHasher {
  return {
    async hash(password: string): Promise<string> {
      return argon2.hash(password, ARGON2_OPTIONS);
    },
  };
}

/** Fast hasher for unit tests (still Argon2id, lower cost). */
export function createTestPasswordHasher(): PasswordHasher {
  return {
    async hash(password: string): Promise<string> {
      return argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 8,
        timeCost: 1,
        parallelism: 1,
      });
    },
  };
}
