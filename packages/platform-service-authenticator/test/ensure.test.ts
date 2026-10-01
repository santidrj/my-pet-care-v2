import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  publishPlatformClient,
  platformClientStartup,
  PlatformClientEnsureError,
} from "../src/ensure.ts";

const options = {
  baseUrl: "http://auth.test",
  serviceId: "owner-pet-manager" as const,
  secret: "service-secret",
  setupSecret: "setup-secret",
};

describe("platform client startup env", () => {
  it("rejects a process that has no setup secret", () => {
    const startup = platformClientStartup("activity-manager", {
      PLATFORM_SERVICE_SECRET: "secret",
      AUTH_BASE_URL: "http://127.0.0.1:3004",
    });
    assert.equal(startup.ok, false);
  });
});

describe("publish platform client", () => {
  it("returns when Authentication Service answers 204", async () => {
    let calls = 0;
    await publishPlatformClient({
      ...options,
      fetch: async () => {
        calls += 1;
        return new Response(null, { status: 204 });
      },
      sleep: async () => {
        throw new Error("should not retry");
      },
      now: () => new Date(0),
    });
    assert.equal(calls, 1);
  });

  it("does not retry a 401", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        publishPlatformClient({
          ...options,
          fetch: async () => {
            calls += 1;
            return new Response(null, { status: 401 });
          },
          sleep: async () => {
            throw new Error("should not retry");
          },
          now: () => new Date(0),
        }),
      (error: unknown) =>
        error instanceof PlatformClientEnsureError && error.status === 401,
    );
    assert.equal(calls, 1);
  });

  it("retries a connection error and then accepts 204", async () => {
    let calls = 0;
    await publishPlatformClient({
      ...options,
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("connect");
        }
        return new Response(null, { status: 204 });
      },
      sleep: async () => undefined,
      now: () => new Date(0),
      deadlineMs: 30_000,
    });
    assert.equal(calls, 2);
  });

  it("stops when the deadline has passed", async () => {
    let ticks = 0;
    await assert.rejects(
      () =>
        publishPlatformClient({
          ...options,
          fetch: async () => {
            throw new Error("down");
          },
          sleep: async () => {
            throw new Error("should not sleep past the deadline");
          },
          now: () => {
            const current = ticks;
            ticks += 30_000;
            return new Date(current);
          },
          deadlineMs: 30_000,
        }),
      (error: unknown) => error instanceof Error && error.message === "down",
    );
  });
});
