import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignJWT } from "jose";
import pino from "pino";
import { v7 as uuidv7 } from "uuid";
import { buildApp } from "../src/app.ts";
import { createHarness } from "./harness.ts";

async function appFor(harness: Awaited<ReturnType<typeof createHarness>>) {
  return buildApp({
    service: "authentication-service",
    logger: pino({ level: "silent" }),
    deps: harness.deps,
    publicKey: harness.publicKey,
  });
}

describe("HTTP wire collapses", () => {
  it("uses one credentials-rejected body for unknown, wrong, and deactivated Owners", async () => {
    const harness = await createHarness();
    const passwordHash = await harness.passwords.hash("correct-horse");
    harness.owners.add({
      ownerId: uuidv7(),
      username: "Alice",
      email: "alice@example.com",
      passwordHash,
      active: true,
    });
    harness.owners.add({
      ownerId: uuidv7(),
      username: "gone",
      email: "gone@example.com",
      passwordHash,
      active: false,
    });
    const app = await appFor(harness);
    const unknown = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identifier: "missing", password: "correct-horse" },
    });
    const wrong = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identifier: "Alice", password: "nope" },
    });
    const deactivated = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identifier: "gone", password: "correct-horse" },
    });
    assert.equal(unknown.statusCode, 401);
    assert.deepEqual(unknown.json(), wrong.json());
    assert.deepEqual(wrong.json(), deactivated.json());
    assert.equal(unknown.json().type, "urn:my-pet-care:credentials-rejected");
    await app.close();
  });

  it("returns validation, dependency, and try-again-later as different problems", async () => {
    const harness = await createHarness();
    harness.owners.add({
      ownerId: uuidv7(),
      username: "Alice",
      email: "alice@example.com",
      passwordHash: await harness.passwords.hash("correct-horse"),
      active: true,
    });
    const app = await appFor(harness);
    const invalid = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identifier: "not an id", password: "correct-horse" },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().type, "urn:my-pet-care:validation-failed");

    harness.owners.unavailable = true;
    const down = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identifier: "Alice", password: "correct-horse" },
    });
    assert.equal(down.statusCode, 503);
    assert.equal(down.json().type, "urn:my-pet-care:owner-pet-manager-unavailable");
    harness.owners.unavailable = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await app.inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress: `203.0.113.${attempt}`,
        payload: { identifier: "Alice", password: "nope" },
      });
    }
    const limited = await app.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: "203.0.113.60",
      payload: { identifier: "Alice", password: "correct-horse" },
    });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().type, "urn:my-pet-care:try-again-later");
    await app.close();
  });

  it("hides unknown and deactivated reset emails behind one not-found problem", async () => {
    const harness = await createHarness();
    harness.owners.add({
      ownerId: uuidv7(),
      username: "gone",
      email: "gone@example.com",
      passwordHash: await harness.passwords.hash("correct-horse"),
      active: false,
    });
    const app = await appFor(harness);
    const unknown = await app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "missing@example.com" },
    });
    const deactivated = await app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "gone@example.com" },
    });
    assert.equal(unknown.statusCode, 404);
    assert.deepEqual(unknown.json(), deactivated.json());
    assert.equal(unknown.json().type, "urn:my-pet-care:resource-not-found");
    await app.close();
  });

  it("requires the setup secret before other ensure fields", async () => {
    const harness = await createHarness();
    const app = await appFor(harness);
    const missing = await app.inject({
      method: "PUT",
      url: "/platform-clients/nope",
      payload: {},
    });
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.json().type, "urn:my-pet-care:unauthorized");
    const ensured = await app.inject({
      method: "PUT",
      url: "/platform-clients/activity-manager",
      payload: { secret: "activity-secret", active: true, setupSecret: "setup-secret" },
    });
    assert.equal(ensured.statusCode, 204);
    await app.close();
  });

  it("allows only Owner & Pet Manager to revoke sessions", async () => {
    const harness = await createHarness();
    const app = await appFor(harness);
    const ownerId = uuidv7();
    const missing = await app.inject({
      method: "POST",
      url: `/owners/${ownerId}/token-revocations`,
      payload: { reason: "deactivation" },
    });
    assert.equal(missing.statusCode, 401);
    const token = await new SignJWT({ service: "activity-manager" })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuer("my-pet-care:authentication-service")
      .setAudience("my-pet-care:platform")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(harness.privateKey);
    const forbidden = await app.inject({
      method: "POST",
      url: `/owners/${ownerId}/token-revocations`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: "deactivation" },
    });
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.json().type, "urn:my-pet-care:forbidden");
    await app.close();
  });

  it("treats an empty password as rejected credentials", async () => {
    const harness = await createHarness();
    harness.owners.add({
      ownerId: uuidv7(),
      username: "Alice",
      email: "alice@example.com",
      passwordHash: await harness.passwords.hash("correct-horse"),
      active: true,
    });
    const app = await appFor(harness);
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identifier: "Alice", password: "" },
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().type, "urn:my-pet-care:credentials-rejected");
    await app.close();
  });

  it("rejects a client-credentials body before it checks the secret", async () => {
    const harness = await createHarness();
    const app = await appFor(harness);
    const response = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: { serviceId: "owner-pet-manager", secret: "secret" },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().type, "urn:my-pet-care:validation-failed");
    await app.close();
  });

  it("treats an unknown refresh token as a completed logout", async () => {
    const harness = await createHarness();
    const app = await appFor(harness);
    const response = await app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: "not-a-session" },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(response.body, "");
    await app.close();
  });
});
