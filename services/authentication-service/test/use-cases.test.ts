import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeProtectedHeader, jwtVerify } from "jose";
import { v7 as uuidv7 } from "uuid";
import { clientCredentials } from "../src/application/client-credentials.ts";
import { ensurePlatformClient } from "../src/application/ensure-client.ts";
import { login } from "../src/application/login.ts";
import { logout } from "../src/application/logout.ts";
import {
  completePasswordReset,
  requestPasswordReset,
} from "../src/application/password-reset.ts";
import { refresh } from "../src/application/refresh.ts";
import { revokeOwnerSessions } from "../src/application/revoke.ts";
import { sweep } from "../src/application/sweep.ts";
import { ISSUER, OWNER_AUDIENCE, PLATFORM_AUDIENCE } from "@my-pet-care/platform-service-authenticator";
import { createHarness } from "./harness.ts";

const ISSUED_AT = Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000);

async function owner(password = "correct-horse") {
  const harness = await createHarness();
  const ownerId = uuidv7();
  const passwordHash = await harness.passwords.hash(password);
  harness.owners.add({
    ownerId,
    username: "Alice",
    email: "Alice@Example.com",
    passwordHash,
    active: true,
  });
  return { harness, ownerId, password };
}

describe("login", () => {
  it("issues an Owner access token and a refresh token", async () => {
    const { harness, ownerId, password } = await owner();
    const result = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.4",
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.value.tokenType, "Bearer");
    assert.equal(result.value.expiresIn, 900);
    assert.equal(result.value.refreshToken.includes("="), false);
    const header = decodeProtectedHeader(result.value.accessToken);
    assert.equal(header.alg, "EdDSA");
    assert.equal(header.kid, undefined);
    const { payload } = await jwtVerify(result.value.accessToken, harness.publicKey, {
      issuer: ISSUER,
      audience: OWNER_AUDIENCE,
      currentDate: harness.clock.current,
    });
    assert.equal(payload.ownerId, ownerId);
    assert.equal(payload.service, undefined);
    assert.equal(payload.jti, undefined);
    assert.equal(payload.exp, ISSUED_AT + 900);
  });

  it("rejects an identifier that is neither a username nor an email before checking the password", async () => {
    const harness = await createHarness();
    let called = false;
    harness.deps.owners.findByIdentifier = async () => {
      called = true;
      return { status: "not_found" };
    };
    const result = await login(harness.deps, {
      identifier: "not an id",
      password: "whatever",
      address: "203.0.113.4",
    });
    assert.deepEqual(result, { ok: false, error: { code: "validation_failed" } });
    assert.equal(called, false);
  });

  it("rejects unknown, wrong, and deactivated Owners the same way", async () => {
    const { harness, password } = await owner();
    const unknown = await login(harness.deps, {
      identifier: "missing",
      password,
      address: "203.0.113.5",
    });
    const wrong = await login(harness.deps, {
      identifier: "Alice",
      password: "nope",
      address: "203.0.113.6",
    });
    harness.owners.add({
      ownerId: uuidv7(),
      username: "gone",
      email: "gone@example.com",
      passwordHash: await harness.passwords.hash(password),
      active: false,
    });
    const deactivated = await login(harness.deps, {
      identifier: "gone",
      password,
      address: "203.0.113.7",
    });
    assert.deepEqual(unknown, wrong);
    assert.deepEqual(wrong, deactivated);
    assert.equal(unknown.ok, false);
  });

  it("does not issue a token when Owner & Pet Manager is unreachable", async () => {
    const { harness, password } = await owner();
    harness.owners.unavailable = true;
    const failed = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.8",
    });
    assert.deepEqual(failed, {
      ok: false,
      error: { code: "owner_pet_manager_unavailable" },
    });
    harness.owners.unavailable = false;
    const again = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.8",
    });
    assert.equal(again.ok, true);
  });

  it("slows the sixth failure for one identifier and still allows a later success", async () => {
    const { harness } = await owner();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await login(harness.deps, {
        identifier: "Alice",
        password: "nope",
        address: `203.0.113.${attempt}`,
      });
      assert.equal(failed.ok, false);
      if (!failed.ok) {
        assert.equal(failed.error.code, "credentials_rejected");
      }
    }
    const limited = await login(harness.deps, {
      identifier: "Alice",
      password: "correct-horse",
      address: "203.0.113.50",
    });
    assert.deepEqual(limited, { ok: false, error: { code: "try_again_later" } });
    harness.clock.current = new Date("2026-01-01T00:16:00.000Z");
    const later = await login(harness.deps, {
      identifier: "Alice",
      password: "correct-horse",
      address: "203.0.113.50",
    });
    assert.equal(later.ok, true);
  });
});

describe("refresh and logout", () => {
  it("rotates the refresh token and revokes the session when an old token is presented", async () => {
    const { harness, password } = await owner();
    const first = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.9",
    });
    assert.equal(first.ok, true);
    if (!first.ok) {
      return;
    }
    const second = await refresh(harness.deps, { refreshToken: first.value.refreshToken });
    assert.equal(second.ok, true);
    if (!second.ok) {
      return;
    }
    const reused = await refresh(harness.deps, { refreshToken: first.value.refreshToken });
    assert.deepEqual(reused, { ok: false, error: { code: "credentials_rejected" } });
    const killed = await refresh(harness.deps, { refreshToken: second.value.refreshToken });
    assert.deepEqual(killed, { ok: false, error: { code: "credentials_rejected" } });
  });

  it("revokes every session when the stored password no longer matches", async () => {
    const { harness, ownerId, password } = await owner();
    const first = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.91",
    });
    const second = await login(harness.deps, {
      identifier: "alice@example.com",
      password,
      address: "203.0.113.92",
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    harness.owners.passwords.set(ownerId, await harness.passwords.hash("replaced-secret"));
    if (!first.ok || !second.ok) {
      return;
    }
    const rejected = await refresh(harness.deps, { refreshToken: first.value.refreshToken });
    assert.equal(rejected.ok, false);
    const other = await refresh(harness.deps, { refreshToken: second.value.refreshToken });
    assert.equal(other.ok, false);
  });

  it("keeps the current refresh token when Owner & Pet Manager cannot be reached", async () => {
    const { harness, password } = await owner();
    const first = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.10",
    });
    assert.equal(first.ok, true);
    if (!first.ok) {
      return;
    }
    harness.owners.unavailable = true;
    const blocked = await refresh(harness.deps, { refreshToken: first.value.refreshToken });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.error.code, "owner_pet_manager_unavailable");
    }
    harness.owners.unavailable = false;
    const retried = await refresh(harness.deps, { refreshToken: first.value.refreshToken });
    assert.equal(retried.ok, true);
  });

  it("ends only the session whose current refresh token was presented", async () => {
    const { harness, password } = await owner();
    const first = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.11",
    });
    const second = await login(harness.deps, {
      identifier: "alice@example.com",
      password,
      address: "203.0.113.12",
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) {
      return;
    }
    const ended = await logout(harness.deps, { refreshToken: first.value.refreshToken });
    assert.deepEqual(ended, { ok: true, value: undefined });
    const dead = await refresh(harness.deps, { refreshToken: first.value.refreshToken });
    assert.equal(dead.ok, false);
    const live = await refresh(harness.deps, { refreshToken: second.value.refreshToken });
    assert.equal(live.ok, true);
  });

  it("leaves the successor in place when logout presents an already rotated token", async () => {
    const { harness, password } = await owner();
    const first = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.13",
    });
    assert.equal(first.ok, true);
    if (!first.ok) {
      return;
    }
    const rotated = await refresh(harness.deps, { refreshToken: first.value.refreshToken });
    assert.equal(rotated.ok, true);
    if (!rotated.ok) {
      return;
    }
    const left = await logout(harness.deps, { refreshToken: first.value.refreshToken });
    assert.equal(left.ok, true);
    const still = await refresh(harness.deps, { refreshToken: rotated.value.refreshToken });
    assert.equal(still.ok, true);
  });
});

describe("password reset", () => {
  it("sends one link and revokes every session when the reset completes", async () => {
    const { harness, password } = await owner();
    const signedIn = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.14",
    });
    assert.equal(signedIn.ok, true);
    const requested = await requestPasswordReset(harness.deps, {
      email: "alice@example.com",
      address: "203.0.113.14",
    });
    assert.deepEqual(requested, { ok: true, value: undefined });
    assert.equal(harness.sent.links.length, 1);
    const link = harness.sent.links[0] ?? "";
    assert.equal(link.startsWith("https://example.test/reset?token="), true);
    const resetToken = link.slice("https://example.test/reset?token=".length);
    const weak = await completePasswordReset(harness.deps, {
      resetToken,
      password: "password",
    });
    assert.deepEqual(weak, { ok: false, error: { code: "validation_failed" } });
    const completed = await completePasswordReset(harness.deps, {
      resetToken,
      password: "a-new-secret-phrase",
    });
    assert.equal(completed.ok, true);
    if (!signedIn.ok) {
      return;
    }
    const dead = await refresh(harness.deps, { refreshToken: signedIn.value.refreshToken });
    assert.equal(dead.ok, false);
    const again = await completePasswordReset(harness.deps, {
      resetToken,
      password: "another-secret-phrase",
    });
    assert.deepEqual(again, { ok: false, error: { code: "resource_not_found" } });
  });

  it("hides unknown and deactivated emails and waits before answering", async () => {
    const { harness } = await owner();
    const unknown = await requestPasswordReset(harness.deps, {
      email: "missing@example.com",
      address: "203.0.113.15",
    });
    harness.owners.add({
      ownerId: uuidv7(),
      username: "idle",
      email: "idle@example.com",
      passwordHash: await harness.passwords.hash("correct-horse"),
      active: false,
    });
    const deactivated = await requestPasswordReset(harness.deps, {
      email: "idle@example.com",
      address: "203.0.113.16",
    });
    assert.deepEqual(unknown, deactivated);
    assert.deepEqual(harness.delays, [1000, 1000]);
    assert.equal(harness.sent.links.length, 0);
  });

  it("does not change the password when the link is already unusable", async () => {
    const { harness } = await owner();
    const requested = await requestPasswordReset(harness.deps, {
      email: "Alice@Example.com",
      address: "203.0.113.93",
    });
    assert.equal(requested.ok, true);
    let updates = 0;
    const setPassword = harness.deps.owners.setPassword.bind(harness.deps.owners);
    harness.deps.owners.setPassword = async (ownerId, password) => {
      updates += 1;
      return setPassword(ownerId, password);
    };
    harness.clock.current = new Date(harness.clock.current.getTime() + 21 * 60 * 1000);
    const link = harness.sent.links[0] ?? "";
    const resetToken = link.slice("https://example.test/reset?token=".length);
    const expired = await completePasswordReset(harness.deps, {
      resetToken,
      password: "a-new-secret-phrase",
    });
    assert.deepEqual(expired, { ok: false, error: { code: "resource_not_found" } });
    assert.equal(updates, 0);
  });

  it("lets only one of two concurrent completions change the password", async () => {
    const { harness } = await owner();
    const requested = await requestPasswordReset(harness.deps, {
      email: "Alice@Example.com",
      address: "203.0.113.94",
    });
    assert.equal(requested.ok, true);
    let updates = 0;
    const setPassword = harness.deps.owners.setPassword.bind(harness.deps.owners);
    harness.deps.owners.setPassword = async (ownerId, password) => {
      updates += 1;
      return setPassword(ownerId, password);
    };
    const link = harness.sent.links[0] ?? "";
    const resetToken = link.slice("https://example.test/reset?token=".length);
    const [left, right] = await Promise.all([
      completePasswordReset(harness.deps, {
        resetToken,
        password: "first-new-secret",
      }),
      completePasswordReset(harness.deps, {
        resetToken,
        password: "second-new-secret",
      }),
    ]);
    const successes = [left, right].filter((result) => result.ok);
    assert.equal(successes.length, 1);
    assert.equal(updates, 1);
  });

  it("keeps the hourly cap when no reset is sent", async () => {
    const { harness } = await owner();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const hidden = await requestPasswordReset(harness.deps, {
        email: "missing@example.com",
        address: `203.0.113.${80 + attempt}`,
      });
      assert.equal(hidden.ok, false);
      if (!hidden.ok) {
        assert.equal(hidden.error.code, "resource_not_found");
      }
    }
    const limited = await requestPasswordReset(harness.deps, {
      email: "missing@example.com",
      address: "203.0.113.90",
    });
    assert.deepEqual(limited, { ok: false, error: { code: "try_again_later" } });
  });

  it("does not leave a usable reset when the message cannot be sent", async () => {
    const { harness } = await owner();
    harness.sent.fail = true;
    const failed = await requestPasswordReset(harness.deps, {
      email: "Alice@Example.com",
      address: "203.0.113.17",
    });
    assert.deepEqual(failed, { ok: false, error: { code: "mail_delivery_failed" } });
    harness.sent.fail = false;
    const retried = await requestPasswordReset(harness.deps, {
      email: "Alice@Example.com",
      address: "203.0.113.17",
    });
    assert.equal(retried.ok, true);
  });
});

describe("platform clients", () => {
  it("issues a platform token only for an active client", async () => {
    const harness = await createHarness();
    const ensured = await ensurePlatformClient(harness.deps, {
      serviceId: "pet-health-service",
      secret: "pet-secret",
      active: true,
      setupSecret: "setup-secret",
    });
    assert.equal(ensured.ok, true);
    const granted = await clientCredentials(harness.deps, {
      serviceId: "pet-health-service",
      secret: "pet-secret",
      address: "203.0.113.18",
    });
    assert.equal(granted.ok, true);
    if (!granted.ok) {
      return;
    }
    assert.equal(granted.value.expiresIn, 3600);
    assert.equal("refreshToken" in granted.value, false);
    const { payload } = await jwtVerify(granted.value.accessToken, harness.publicKey, {
      issuer: ISSUER,
      audience: PLATFORM_AUDIENCE,
      currentDate: harness.clock.current,
    });
    assert.equal(payload.service, "pet-health-service");
    assert.equal(payload.ownerId, undefined);
    const unknown = await clientCredentials(harness.deps, {
      serviceId: "not-a-service",
      secret: "pet-secret",
      address: "203.0.113.19",
    });
    const wrong = await clientCredentials(harness.deps, {
      serviceId: "pet-health-service",
      secret: "wrong",
      address: "203.0.113.20",
    });
    assert.deepEqual(unknown, wrong);
  });

  it("does not rehash a client whose secret and active flag already match", async () => {
    const harness = await createHarness();
    const input = {
      serviceId: "community",
      secret: "community-secret",
      active: true,
      setupSecret: "setup-secret",
    };
    assert.equal((await ensurePlatformClient(harness.deps, input)).ok, true);
    let hashes = 0;
    const hash = harness.deps.passwords.hash.bind(harness.deps.passwords);
    harness.deps.passwords.hash = async (secret) => {
      hashes += 1;
      return hash(secret);
    };
    assert.equal((await ensurePlatformClient(harness.deps, input)).ok, true);
    assert.equal(hashes, 0);
  });

  it("rejects a disabled client the same way as a wrong secret", async () => {
    const harness = await createHarness();
    await ensurePlatformClient(harness.deps, {
      serviceId: "community",
      secret: "community-secret",
      active: false,
      setupSecret: "setup-secret",
    });
    const disabled = await clientCredentials(harness.deps, {
      serviceId: "community",
      secret: "community-secret",
      address: "203.0.113.70",
    });
    const wrong = await clientCredentials(harness.deps, {
      serviceId: "community",
      secret: "other-secret",
      address: "203.0.113.71",
    });
    assert.deepEqual(disabled, wrong);
    assert.equal(disabled.ok, false);
  });

  it("rejects a missing setup secret before it looks at the other fields", async () => {
    const harness = await createHarness();
    const missing = await ensurePlatformClient(harness.deps, {
      serviceId: "nope",
      secret: undefined,
      active: undefined,
      setupSecret: undefined,
    });
    const wrong = await ensurePlatformClient(harness.deps, {
      serviceId: "owner-pet-manager",
      secret: "secret",
      active: true,
      setupSecret: "nope",
    });
    assert.deepEqual(missing, wrong);
    assert.deepEqual(missing, { ok: false, error: { code: "unauthorized" } });
  });
});

describe("revocation and sweep", () => {
  it("revokes every session for an Owner when Owner & Pet Manager asks", async () => {
    const { harness, ownerId, password } = await owner();
    const signedIn = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.21",
    });
    assert.equal(signedIn.ok, true);
    const denied = await revokeOwnerSessions(
      harness.deps,
      { kind: "platform", service: "activity-manager" },
      ownerId,
    );
    assert.deepEqual(denied, { ok: false, error: { code: "forbidden" } });
    const revoked = await revokeOwnerSessions(
      harness.deps,
      { kind: "platform", service: "owner-pet-manager" },
      ownerId,
    );
    assert.equal(revoked.ok, true);
    const repeated = await revokeOwnerSessions(
      harness.deps,
      { kind: "platform", service: "owner-pet-manager" },
      ownerId,
    );
    assert.equal(repeated.ok, true);
    if (!signedIn.ok) {
      return;
    }
    const dead = await refresh(harness.deps, { refreshToken: signedIn.value.refreshToken });
    assert.equal(dead.ok, false);
  });

  it("deletes sessions and password resets that are past their absolute expiry", async () => {
    const { harness, password } = await owner();
    const signedIn = await login(harness.deps, {
      identifier: "Alice",
      password,
      address: "203.0.113.22",
    });
    const requested = await requestPasswordReset(harness.deps, {
      email: "Alice@Example.com",
      address: "203.0.113.22",
    });
    assert.equal(signedIn.ok, true);
    assert.equal(requested.ok, true);
    harness.clock.current = new Date("2026-02-01T00:00:00.000Z");
    await sweep(harness.deps);
    if (!signedIn.ok) {
      return;
    }
    const dead = await refresh(harness.deps, { refreshToken: signedIn.value.refreshToken });
    assert.equal(dead.ok, false);
    const link = harness.sent.links[0] ?? "";
    const resetToken = link.slice("https://example.test/reset?token=".length);
    const expired = await completePasswordReset(harness.deps, {
      resetToken,
      password: "a-new-secret-phrase",
    });
    assert.deepEqual(expired, { ok: false, error: { code: "resource_not_found" } });
  });
});
