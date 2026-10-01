import { generateKeyPair } from "jose";
import { login } from "../src/application/login.ts";
import type {
  OwnerCredentials,
  OwnerDirectory,
  OwnerLookup,
  SetPasswordResult,
  UseCaseDeps,
} from "../src/application/ports.ts";
import { classifyIdentifier } from "../src/domain/identifier.ts";
import { createInMemoryStore } from "../src/infrastructure/memory-store.ts";
import { createTestSecretHasher } from "../src/infrastructure/password.ts";
import { createSigner } from "../src/infrastructure/signer.ts";
import { createTokenFactory, createUuidV7Generator } from "../src/infrastructure/tokens.ts";

export type FakeOwners = OwnerDirectory & {
  add(credentials: OwnerCredentials & { username: string; email: string }): void;
  unavailable: boolean;
  passwords: Map<string, string>;
};

export function createFakeOwners(
  hash: (password: string) => Promise<string>,
): FakeOwners {
  const records: (OwnerCredentials & { username: string; email: string })[] = [];
  const passwords = new Map<string, string>();
  const directory: FakeOwners = {
    passwords,
    unavailable: false,
    add(credentials) {
      records.push(credentials);
      passwords.set(credentials.ownerId, credentials.passwordHash);
    },
    async findByIdentifier(identifier): Promise<OwnerLookup> {
      if (directory.unavailable) {
        return { status: "unavailable" };
      }
      const classified = classifyIdentifier(identifier);
      if (classified === null) {
        return { status: "not_found" };
      }
      const found = records.find((record) =>
        classified.kind === "email"
          ? record.email.toLowerCase() === classified.value.toLowerCase()
          : record.username === classified.value,
      );
      if (found === undefined) {
        return { status: "not_found" };
      }
      return {
        status: "found",
        credentials: {
          ownerId: found.ownerId,
          passwordHash: passwords.get(found.ownerId) ?? found.passwordHash,
          active: found.active,
        },
      };
    },
    async findByOwnerId(ownerId): Promise<OwnerLookup> {
      if (directory.unavailable) {
        return { status: "unavailable" };
      }
      const found = records.find((record) => record.ownerId === ownerId);
      if (found === undefined) {
        return { status: "not_found" };
      }
      return {
        status: "found",
        credentials: {
          ownerId: found.ownerId,
          passwordHash: passwords.get(found.ownerId) ?? found.passwordHash,
          active: found.active,
        },
      };
    },
    async setPassword(ownerId, password): Promise<SetPasswordResult> {
      if (directory.unavailable) {
        return { status: "unavailable" };
      }
      if (password === "password") {
        return { status: "validation" };
      }
      const found = records.find((record) => record.ownerId === ownerId);
      if (found === undefined) {
        return { status: "not_found" };
      }
      passwords.set(ownerId, await hash(password));
      return { status: "updated" };
    },
  };
  return directory;
}

export async function createHarness(store: UseCaseDeps["store"] = createInMemoryStore()) {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const passwords = await createTestSecretHasher();
  const clock = { current: new Date("2026-01-01T00:00:00.000Z") };
  const delays: number[] = [];
  const sent: { links: string[]; fail: boolean } = { links: [], fail: false };
  const owners = createFakeOwners((password) => passwords.hash(password));
  const deps: UseCaseDeps = {
    store,
    owners,
    passwords,
    signer: createSigner(privateKey),
    tokens: createTokenFactory(),
    ids: createUuidV7Generator(),
    now: () => clock.current,
    delay: async (ms) => {
      delays.push(ms);
    },
    resetNoSendFloorMs: 1000,
    resetLinkTemplate: "https://example.test/reset?token={token}",
    mail: {
      async send(message) {
        if (sent.fail) {
          throw new Error("delivery failed");
        }
        sent.links.push(message.link);
      },
    },
    setupSecret: "setup-secret",
  };
  return { deps, publicKey, privateKey, clock, delays, sent, owners, passwords, login };
}
