import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { generateKeyPair, SignJWT, exportSPKI, importSPKI } from "jose";
import { verifyToken } from "../src/index.ts";

const ALG = "EdDSA";
const ISSUER = "my-pet-care:authentication-service";
const OWNER_AUD = "my-pet-care";
const PLATFORM_AUD = "my-pet-care:platform";

describe("verifyToken", () => {
  let publicKey: CryptoKey;
  let privateKey: CryptoKey;

  before(async () => {
    const pair = await generateKeyPair(ALG);
    publicKey = pair.publicKey;
    privateKey = pair.privateKey;
  });

  async function sign(claims: Record<string, unknown>, options: {
    aud: string;
    exp?: string | number;
    nbf?: string | number;
  }) {
    let jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(options.aud)
      .setIssuedAt();
    if (options.exp !== undefined) {
      jwt = jwt.setExpirationTime(options.exp);
    } else {
      jwt = jwt.setExpirationTime("1h");
    }
    if (options.nbf !== undefined) {
      jwt = jwt.setNotBefore(options.nbf);
    }
    return jwt.sign(privateKey);
  }

  it("returns an owner actor for a valid Owner JWT", async () => {
    const token = await sign(
      { ownerId: "owner-123" },
      { aud: OWNER_AUD },
    );

    const actor = await verifyToken(token, { publicKey });

    assert.deepEqual(actor, { kind: "owner", ownerId: "owner-123" });
  });

  it("returns a service actor for a valid platform-service JWT", async () => {
    const token = await sign(
      { service: "owner-pet-manager" },
      { aud: PLATFORM_AUD },
    );

    const actor = await verifyToken(token, { publicKey });

    assert.deepEqual(actor, {
      kind: "service",
      service: "owner-pet-manager",
    });
  });

  it("rejects a JWT that carries both ownerId and service", async () => {
    const token = await sign(
      { ownerId: "owner-123", service: "owner-pet-manager" },
      { aud: OWNER_AUD },
    );

    await assert.rejects(() => verifyToken(token, { publicKey }));
  });

  it("rejects a JWT that carries neither ownerId nor service", async () => {
    const token = await sign({}, { aud: OWNER_AUD });

    await assert.rejects(() => verifyToken(token, { publicKey }));
  });

  it("rejects a JWT with wrong audience for an Owner claim shape", async () => {
    const token = await sign(
      { ownerId: "owner-123" },
      { aud: PLATFORM_AUD },
    );

    await assert.rejects(() => verifyToken(token, { publicKey }));
  });

  it("rejects a JWT with wrong audience for a platform claim shape", async () => {
    const token = await sign(
      { service: "pet-health-service" },
      { aud: OWNER_AUD },
    );

    await assert.rejects(() => verifyToken(token, { publicKey }));
  });

  it("rejects a JWT with an unknown service id", async () => {
    const token = await sign(
      { service: "not-a-real-service" },
      { aud: PLATFORM_AUD },
    );

    await assert.rejects(() => verifyToken(token, { publicKey }));
  });

  it("rejects a JWT signed by a different key", async () => {
    const other = await generateKeyPair(ALG);
    const token = await new SignJWT({ ownerId: "owner-123" })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(OWNER_AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(other.privateKey);

    await assert.rejects(() => verifyToken(token, { publicKey }));
  });

  it("rejects a JWT with the wrong issuer", async () => {
    const token = await new SignJWT({ ownerId: "owner-123" })
      .setProtectedHeader({ alg: ALG })
      .setIssuer("someone-else")
      .setAudience(OWNER_AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

    await assert.rejects(() => verifyToken(token, { publicKey }));
  });

  it("rejects an expired JWT beyond the clock skew window", async () => {
    const token = await sign(
      { ownerId: "owner-123" },
      { aud: OWNER_AUD, exp: Math.floor(Date.now() / 1000) - 120 },
    );

    await assert.rejects(() => verifyToken(token, { publicKey }));
  });

  it("accepts a JWT expired within the ±60s clock skew", async () => {
    const token = await sign(
      { ownerId: "owner-123" },
      { aud: OWNER_AUD, exp: Math.floor(Date.now() / 1000) - 30 },
    );

    const actor = await verifyToken(token, { publicKey });

    assert.deepEqual(actor, { kind: "owner", ownerId: "owner-123" });
  });

  it("accepts a JWT with nbf in the near future within ±60s skew", async () => {
    const token = await sign(
      { ownerId: "owner-123" },
      { aud: OWNER_AUD, nbf: Math.floor(Date.now() / 1000) + 30 },
    );

    const actor = await verifyToken(token, { publicKey });

    assert.deepEqual(actor, { kind: "owner", ownerId: "owner-123" });
  });

  it("accepts a public key imported from SPKI", async () => {
    const spki = await exportSPKI(publicKey);
    const imported = await importSPKI(spki, ALG);
    const token = await sign(
      { ownerId: "owner-123" },
      { aud: OWNER_AUD },
    );

    const actor = await verifyToken(token, { publicKey: imported });

    assert.deepEqual(actor, { kind: "owner", ownerId: "owner-123" });
  });
});
