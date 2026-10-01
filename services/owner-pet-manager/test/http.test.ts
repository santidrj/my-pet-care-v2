import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import pino from "pino";
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

  async function createTestApp() {
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
      logger: pino({ level: "silent" }),
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

  it("serves health publicly", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok" });
    await app.close();
  });

  function assertProblemJson(response: { statusCode: number; headers: Record<string, string | string[] | undefined>; json: () => { type: string } }) {
    const contentType = response.headers["content-type"];
    assert.equal(contentType, "application/problem+json");
    assert.ok(response.json().type.startsWith("urn:my-pet-care:"));
  }

  it("rejects unknown fields on create Owner with 400 problem+json", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/owners",
      payload: {
        username: "alice",
        email: "alice@example.com",
        password: "unique-passphrase-99",
        extra: "nope",
      },
    });
    assert.equal(response.statusCode, 400);
    assertProblemJson(response);
    assert.equal(response.json().type, "urn:my-pet-care:validation-failed");
    await app.close();
  });

  it("returns 409 username-taken for duplicate username", async () => {
    const app = await createTestApp();
    await app.inject({
      method: "POST",
      url: "/owners",
      payload: {
        username: "alice",
        email: "alice@example.com",
        password: "unique-passphrase-99",
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/owners",
      payload: {
        username: "alice",
        email: "other@example.com",
        password: "unique-passphrase-99",
      },
    });
    assert.equal(response.statusCode, 409);
    assertProblemJson(response);
    assert.equal(response.json().type, "urn:my-pet-care:username-taken");
    await app.close();
  });

  it("returns 403 for Owner credentials lookup without Auth service JWT", async () => {
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
    const response = await app.inject({
      method: "GET",
      url: "/owners/credentials?identifier=alice",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 403);
    assertProblemJson(response);
    assert.equal(response.json().type, "urn:my-pet-care:forbidden");
    await app.close();
  });

  it("returns 404 resource-not-found for missing Owner", async () => {
    const app = await createTestApp();
    const token = await signOwner("00000000-0000-4000-8000-000000000001");
    const response = await app.inject({
      method: "GET",
      url: "/owners/00000000-0000-4000-8000-000000000099",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 404);
    assertProblemJson(response);
    assert.equal(response.json().type, "urn:my-pet-care:resource-not-found");
    await app.close();
  });

  it("returns 409 owner-already-deactivated on second deactivate", async () => {
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
    const first = await app.inject({
      method: "DELETE",
      url: `/owners/${owner.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(first.statusCode, 204);
    const second = await app.inject({
      method: "DELETE",
      url: `/owners/${owner.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(second.statusCode, 409);
    assertProblemJson(second);
    assert.equal(second.json().type, "urn:my-pet-care:owner-already-deactivated");
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
