import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import Fastify from "fastify";
import { generateKeyPair, SignJWT } from "jose";
import { unauthorizedProblem } from "@my-pet-care/contracts";
import {
  registerPlatformServiceAuthenticator,
  isPublicRoute,
} from "../src/index.ts";

const ALG = "EdDSA";
const ISSUER = "my-pet-care:authentication-service";
const OWNER_AUD = "my-pet-care";
const PLATFORM_AUD = "my-pet-care:platform";

describe("isPublicRoute", () => {
  it("matches exact method and path", () => {
    assert.equal(
      isPublicRoute([{ method: "POST", path: "/owners" }], "POST", "/owners"),
      true,
    );
    assert.equal(
      isPublicRoute([{ method: "POST", path: "/owners" }], "GET", "/owners"),
      false,
    );
  });

  it("ignores query strings when matching path", () => {
    assert.equal(
      isPublicRoute([{ method: "GET", path: "/health" }], "GET", "/health?ready=1"),
      true,
    );
  });
});

describe("platform-service authenticator plugin", () => {
  let publicKey: CryptoKey;
  let privateKey: CryptoKey;

  before(async () => {
    const pair = await generateKeyPair(ALG);
    publicKey = pair.publicKey;
    privateKey = pair.privateKey;
  });

  async function signOwner(ownerId: string, exp: string | number = "1h"): Promise<string> {
    return new SignJWT({ ownerId })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(OWNER_AUD)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey);
  }

  async function signPlatform(
    service: string,
    exp: string | number = "1h",
  ): Promise<string> {
    return new SignJWT({ service })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(PLATFORM_AUD)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey);
  }

  async function signOwnerWithoutExp(ownerId: string): Promise<string> {
    return new SignJWT({ ownerId })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(OWNER_AUD)
      .setIssuedAt()
      .sign(privateKey);
  }

  async function buildApp() {
    const app = Fastify();
    await registerPlatformServiceAuthenticator(app, {
      publicKey,
      publicRoutes: [
        { method: "GET", path: "/health" },
        { method: "POST", path: "/owners" },
      ],
    });
    app.get("/health", async () => ({ status: "ok" }));
    app.post("/owners", async () => ({ created: true }));
    app.get("/owners/:ownerId", async (request) => ({
      actor: request.actor,
    }));
    await app.ready();
    return app;
  }

  it("allows an allowlisted route without a JWT", async () => {
    const app = await buildApp();
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { status: "ok" });
    } finally {
      await app.close();
    }
  });

  it("ignores a Bearer token on an allowlisted route", async () => {
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/owners",
        headers: { authorization: "Bearer not-even-a-jwt" },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { created: true });
    } finally {
      await app.close();
    }
  });

  it("rejects a protected route without a JWT with uniform unauthorized Problem Details", async () => {
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/owners/owner-1",
      });
      assert.equal(response.statusCode, 401);
      assert.match(
        String(response.headers["content-type"]),
        /^application\/problem\+json/,
      );
      assert.deepEqual(response.json(), unauthorizedProblem);
    } finally {
      await app.close();
    }
  });

  it("rejects a protected route with an invalid JWT using the same unauthorized shape", async () => {
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/owners/owner-1",
        headers: { authorization: "Bearer not-a-valid-token" },
      });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), unauthorizedProblem);
    } finally {
      await app.close();
    }
  });

  it("rejects a malformed Authorization header with the uniform unauthorized shape", async () => {
    const app = await buildApp();
    try {
      const cases = ["Basic abc", "Bearer", "Bearer ", "Token abc"];
      for (const authorization of cases) {
        const response = await app.inject({
          method: "GET",
          url: "/owners/owner-1",
          headers: { authorization },
        });
        assert.equal(response.statusCode, 401);
        assert.deepEqual(response.json(), unauthorizedProblem);
      }
    } finally {
      await app.close();
    }
  });

  it("exposes a trusted actor on a protected route with a valid Owner JWT", async () => {
    const app = await buildApp();
    try {
      const token = await signOwner("owner-123");
      const response = await app.inject({
        method: "GET",
        url: "/owners/owner-123",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        actor: { kind: "owner", ownerId: "owner-123" },
      });
    } finally {
      await app.close();
    }
  });

  it("exposes a trusted platform actor on a protected route with a valid platform JWT", async () => {
    const app = await buildApp();
    try {
      const token = await signPlatform("pet-health-service");
      const response = await app.inject({
        method: "GET",
        url: "/owners/owner-123",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        actor: { kind: "platform", service: "pet-health-service" },
      });
    } finally {
      await app.close();
    }
  });

  it("rejects an expired token with the uniform unauthorized shape", async () => {
    const app = await buildApp();
    try {
      const token = await signOwner(
        "owner-123",
        Math.floor(Date.now() / 1000) - 120,
      );
      const response = await app.inject({
        method: "GET",
        url: "/owners/owner-123",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), unauthorizedProblem);
    } finally {
      await app.close();
    }
  });

  it("rejects a token without exp with the uniform unauthorized shape", async () => {
    const app = await buildApp();
    try {
      const token = await signOwnerWithoutExp("owner-123");
      const response = await app.inject({
        method: "GET",
        url: "/owners/owner-123",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), unauthorizedProblem);
    } finally {
      await app.close();
    }
  });

  it("rejects empty ownerId alongside service with the uniform unauthorized shape", async () => {
    const app = await buildApp();
    try {
      const token = await new SignJWT({
        ownerId: "",
        service: "owner-pet-manager",
      })
        .setProtectedHeader({ alg: ALG })
        .setIssuer(ISSUER)
        .setAudience(PLATFORM_AUD)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);
      const response = await app.inject({
        method: "GET",
        url: "/owners/owner-123",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), unauthorizedProblem);
    } finally {
      await app.close();
    }
  });
});
