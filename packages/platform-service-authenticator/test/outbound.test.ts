import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createOutboundCredentialProvider,
  type PlatformServiceId,
} from "../src/index.ts";

const SERVICE_ID = "pet-health-service" as const satisfies PlatformServiceId;
const SECRET = "test-secret";
const TOKEN_ENDPOINT = "https://auth.example/oauth/token";

function authorizationHeader(init?: RequestInit): string {
  if (init?.headers instanceof Headers) {
    return init.headers.get("authorization") ?? "";
  }
  return new Headers(init?.headers as HeadersInit).get("authorization") ?? "";
}

describe("outbound credential provider", () => {
  it("obtains a token via client-credentials and attaches Bearer on fetch", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === TOKEN_ENDPOINT) {
        return Response.json({
          accessToken: "token-1",
          tokenType: "Bearer",
          expiresIn: 3600,
        });
      }
      return new Response("ok", { status: 200 });
    };

    const provider = createOutboundCredentialProvider({
      tokenEndpoint: TOKEN_ENDPOINT,
      serviceId: SERVICE_ID,
      secret: SECRET,
      fetch: fetchMock,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await provider.fetch("https://opm.example/pets", {
      method: "GET",
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.url, TOKEN_ENDPOINT);
    const tokenBody = JSON.parse(String(calls[0]?.init?.body));
    assert.deepEqual(tokenBody, {
      grantType: "client_credentials",
      serviceId: SERVICE_ID,
      secret: SECRET,
    });
    assert.equal(authorizationHeader(calls[1]?.init), "Bearer token-1");
  });

  it("reuses a cached token until near expiry", async () => {
    let tokenFetches = 0;
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url === TOKEN_ENDPOINT) {
        tokenFetches += 1;
        return Response.json({
          accessToken: `token-${tokenFetches}`,
          tokenType: "Bearer",
          expiresIn: 3600,
        });
      }
      return new Response("ok", { status: 200 });
    };

    const provider = createOutboundCredentialProvider({
      tokenEndpoint: TOKEN_ENDPOINT,
      serviceId: SERVICE_ID,
      secret: SECRET,
      fetch: fetchMock,
      skewMarginSeconds: 120,
      now: () => new Date(nowMs),
    });

    await provider.fetch("https://opm.example/a");
    nowMs += 60_000;
    await provider.fetch("https://opm.example/b");

    assert.equal(tokenFetches, 1);
  });

  it("re-fetches when the cached token is within the skew margin", async () => {
    let tokenFetches = 0;
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const auths: string[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url === TOKEN_ENDPOINT) {
        tokenFetches += 1;
        return Response.json({
          accessToken: `token-${tokenFetches}`,
          tokenType: "Bearer",
          expiresIn: 3600,
        });
      }
      auths.push(authorizationHeader(init));
      return new Response("ok", { status: 200 });
    };

    const provider = createOutboundCredentialProvider({
      tokenEndpoint: TOKEN_ENDPOINT,
      serviceId: SERVICE_ID,
      secret: SECRET,
      fetch: fetchMock,
      skewMarginSeconds: 120,
      now: () => new Date(nowMs),
    });

    await provider.fetch("https://opm.example/a");
    // expires at T+3600s; with 120s margin, refresh at or after T+3480s
    nowMs += 3_480_000;
    await provider.fetch("https://opm.example/b");

    assert.equal(tokenFetches, 2);
    assert.deepEqual(auths, ["Bearer token-1", "Bearer token-2"]);
  });

  it("fails closed when a platform token cannot be obtained", async () => {
    const fetchMock: typeof fetch = async (input) => {
      if (String(input) === TOKEN_ENDPOINT) {
        return new Response("down", { status: 503 });
      }
      return new Response("should-not-reach", { status: 200 });
    };

    const provider = createOutboundCredentialProvider({
      tokenEndpoint: TOKEN_ENDPOINT,
      serviceId: SERVICE_ID,
      secret: SECRET,
      fetch: fetchMock,
    });

    await assert.rejects(() => provider.fetch("https://opm.example/pets"));
  });

  it("on peer 401, re-fetches once and retries the outbound call once", async () => {
    let tokenFetches = 0;
    let peerHits = 0;
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url === TOKEN_ENDPOINT) {
        tokenFetches += 1;
        return Response.json({
          accessToken: `token-${tokenFetches}`,
          tokenType: "Bearer",
          expiresIn: 3600,
        });
      }
      peerHits += 1;
      if (peerHits === 1) {
        return new Response("unauthorized", { status: 401 });
      }
      return new Response("ok", { status: 200 });
    };

    const provider = createOutboundCredentialProvider({
      tokenEndpoint: TOKEN_ENDPOINT,
      serviceId: SERVICE_ID,
      secret: SECRET,
      fetch: fetchMock,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await provider.fetch("https://opm.example/pets");

    assert.equal(response.status, 200);
    assert.equal(tokenFetches, 2);
    assert.equal(peerHits, 2);
  });

  it("does not retry more than once after a second peer 401", async () => {
    let tokenFetches = 0;
    let peerHits = 0;
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url === TOKEN_ENDPOINT) {
        tokenFetches += 1;
        return Response.json({
          accessToken: `token-${tokenFetches}`,
          tokenType: "Bearer",
          expiresIn: 3600,
        });
      }
      peerHits += 1;
      return new Response("unauthorized", { status: 401 });
    };

    const provider = createOutboundCredentialProvider({
      tokenEndpoint: TOKEN_ENDPOINT,
      serviceId: SERVICE_ID,
      secret: SECRET,
      fetch: fetchMock,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await provider.fetch("https://opm.example/pets");

    assert.equal(response.status, 401);
    assert.equal(tokenFetches, 2);
    assert.equal(peerHits, 2);
  });
});
