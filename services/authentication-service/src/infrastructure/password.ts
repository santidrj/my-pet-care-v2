import * as argon2 from "argon2";
import type { SecretHasher } from "../application/ports.js";

/** OWASP minimum Argon2id: m=19456 KiB, t=2, p=1 (ADR-0012). */
export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const TEST_ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 8,
  timeCost: 1,
  parallelism: 1,
};

function createHasher(options: argon2.Options, dummyHash: string): SecretHasher {
  return {
    dummyHash,
    async hash(secret: string): Promise<string> {
      return argon2.hash(secret, options);
    },
    async verify(hash: string, secret: string): Promise<boolean> {
      try {
        return await argon2.verify(hash, secret);
      } catch {
        return false;
      }
    },
  };
}

export async function createArgon2SecretHasher(): Promise<SecretHasher> {
  const dummyHash = await argon2.hash("authentication-service-dummy", ARGON2_OPTIONS);
  return createHasher(ARGON2_OPTIONS, dummyHash);
}

export async function createTestSecretHasher(): Promise<SecretHasher> {
  const dummyHash = await argon2.hash("authentication-service-dummy", TEST_ARGON2_OPTIONS);
  return createHasher(TEST_ARGON2_OPTIONS, dummyHash);
}
