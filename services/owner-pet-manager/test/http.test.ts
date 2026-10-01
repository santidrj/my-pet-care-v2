import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { before, describe, it } from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import pino, { type Logger } from "pino";
import { unauthorizedProblem } from "@my-pet-care/contracts";
import { buildApp } from "../src/app.ts";
import type { UseCaseDeps } from "../src/application/ports.ts";
import { createTestPasswordHasher } from "../src/infrastructure/argon2-hasher.ts";
import { createDenylistPasswordPolicy } from "../src/infrastructure/denylist-policy.ts";
import { createUuidV7Generator } from "../src/infrastructure/ids.ts";
import { createInMemoryStore } from "../src/infrastructure/memory-store.ts";

const ALG = "EdDSA";
const ISSUER = "my-pet-care:authentication-service";
const OWNER_AUD = "my-pet-care";
const PLATFORM_AUD = "my-pet-care:platform";

describe("HTTP routes", () => {
  let publicKey: CryptoKey;
  let privateKey: CryptoKey;
  let deps: UseCaseDeps;

  before(async () => {
    const pair = await generateKeyPair(ALG);
    publicKey = pair.publicKey;
    privateKey = pair.privateKey;
  });

  async function signOwner(ownerId: string): Promise<string> {
    return new SignJWT({ ownerId })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(OWNER_AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  }

  async function signService(service: string): Promise<string> {
    return new SignJWT({ service })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(PLATFORM_AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  }

  async function createTestApp(logger: Logger = pino({ level: "silent" })) {
    deps = {
      store: createInMemoryStore(),
      passwordHasher: createTestPasswordHasher(),
      passwordPolicy: createDenylistPasswordPolicy(),
      community: {
        async isCommunityOwner() {
          return false;
        },
        async endBelonging() {},
      },
      authRevocation: {
        async revoke() {},
      },
      ids: createUuidV7Generator(),
    };

    return buildApp({
      service: "owner-pet-manager",
      logger,
      deps,
      authenticator: { publicKey },
    });
  }

  it("creates an Owner without JWT and returns 201", async () => {
    const app = await createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/owners",
      payload: {
        username: "alice",
        email: "alice@example.com",
        password: "unique-passphrase-99",
      },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.username, "alice");
    assert.equal(body.petListVisibility, "private");
    assert.equal(body.email, "alice@example.com");
    await app.close();
  });

  it("requires JWT for get Owner and returns Owner without email for another Owner", async () => {
    const app = await createTestApp();

    const created = await app.inject({
      method: "POST",
      url: "/owners",
      payload: {
        username: "alice",
        email: "alice@example.com",
        password: "unique-passphrase-99",
      },
    });
    assert.equal(created.statusCode, 201);
    const owner = created.json();

    const unauthorized = await app.inject({
      method: "GET",
      url: `/owners/${owner.id}`,
    });
    assert.equal(unauthorized.statusCode, 401);

    const otherOwner = await app.inject({
      method: "POST",
      url: "/owners",
      payload: {
        username: "bob",
        email: "bob@example.com",
        password: "unique-passphrase-99",
      },
    });
    const bob = otherOwner.json();

    const token = await signOwner(bob.id);
    const response = await app.inject({
      method: "GET",
      url: `/owners/${owner.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.username, "alice");
    assert.equal(body.email, undefined);

    const selfToken = await signOwner(owner.id);
    const self = await app.inject({
      method: "GET",
      url: `/owners/${owner.id}`,
      headers: { authorization: `Bearer ${selfToken}` },
    });
    assert.equal(self.json().email, "alice@example.com");

    await app.close();
  });

  it("rejects a Pet species or sex outside the allowed values with 400", async () => {
    const app = await createTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/owners",
      payload: {
        username: "alice",
        email: "alice@example.com",
        password: "unique-passphrase-99",
      },
    });
    const owner = created.json();
    const token = await signOwner(owner.id);

    for (const payload of [
      { name: "Tweety", species: "bird", sex: "female" },
      { name: "Rex", species: "dog", sex: "lizard" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/owners/${owner.id}/pets`,
        headers: { authorization: `Bearer ${token}` },
        payload,
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().type, "urn:my-pet-care:validation-failed");
    }
    await app.close();
  });

  it("logs an authenticator 401 with its problemType", async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    });
    const logger = pino(
      {
        level: "info",
        formatters: {
          level(label) {
            return { level: label };
          },
        },
      },
      stream,
    );
    const app = await createTestApp(logger);

    const response = await app.inject({
      method: "GET",
      url: "/owners/00000000-0000-7000-8000-000000000001",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), unauthorizedProblem);
    const line = chunks
      .join("")
      .split("\n")
      .filter((entry) => entry.length > 0)
      .map((entry) => JSON.parse(entry) as Record<string, unknown>)
      .find((entry) => entry.event === "http.request.completed");
    assert.ok(line);
    assert.equal(line.problemType, unauthorizedProblem.type);
    assert.equal(line.statusCode, 401);
    assert.equal(line.outcome, "failure");
    assert.equal(line.service, "owner-pet-manager");
    await app.close();
  });

  it("serves health publicly", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok" });
    await app.close();
  });

  it("allows Auth service credentials lookup", async () => {
    const app = await createTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/owners",
      payload: {
        username: "alice",
        email: "alice@example.com",
        password: "unique-passphrase-99",
      },
    });
    const owner = created.json();
    const token = await signService("authentication-service");
    const response = await app.inject({
      method: "GET",
      url: `/owners/credentials?identifier=alice`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().ownerId, owner.id);
    assert.equal(typeof response.json().passwordHash, "string");
    await app.close();
  });
});
