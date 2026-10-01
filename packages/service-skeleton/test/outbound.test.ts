import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { describe, it } from "node:test";
import pino, { type Logger } from "pino";
import { createOutboundCredentialProvider } from "@my-pet-care/platform-service-authenticator";
import { unauthorizedProblem } from "@my-pet-care/contracts";
import {
  clientCredentialsGrantFetch,
  loggedFetch,
  runWithCorrelationId,
} from "../src/index.ts";

const CORRELATION_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN_ENDPOINT = "https://auth.example/oauth/token";
const SECRET = "grant-secret-value";

function captureLogger(): { logger: Logger; read: () => Record<string, unknown>[] } {
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
  return {
    logger,
    read() {
      return chunks
        .join("")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

function clientLine(logs: Record<string, unknown>[]): Record<string, unknown> {
  const line = logs.find((entry) => entry.event === "http.client.completed");
  assert.ok(line, "expected http.client.completed");
  return line;
}

describe("loggedFetch", () => {
  it("adds problemType on a Problem Details failure and sends request-id", async () => {
    const captured = captureLogger();
    let seenRequestId: string | null = null;
    const fetchMock: typeof fetch = async (_input, init) => {
      seenRequestId = new Headers(init?.headers).get("request-id");
      return new Response(JSON.stringify(unauthorizedProblem), {
        status: 401,
        headers: { "content-type": "application/problem+json" },
      });
    };

    const response = await runWithCorrelationId(CORRELATION_ID, () =>
      loggedFetch(
        {
          logger: captured.logger,
          service: "owner-pet-manager",
          target: "community",
          method: "GET",
          route: "/owners/{ownerId}/community-ownership",
        },
        fetchMock,
        "https://community.example/owners/owner-1/community-ownership",
        { method: "GET" },
      ),
    );

    assert.equal(response.status, 401);
    assert.equal(seenRequestId, CORRELATION_ID);
    const line = clientLine(captured.read());
    assert.equal(line.problemType, unauthorizedProblem.type);
    assert.equal(line.outcome, "failure");
    assert.equal(line.statusCode, 401);
    assert.equal(line.level, "warn");
    assert.equal(line.correlationId, CORRELATION_ID);
    assert.equal(line.target, "community");
    assert.equal(line.route, "/owners/{ownerId}/community-ownership");
    assert.equal("detail" in line, false);
  });

  it("omits problemType when a failure body is not Problem Details", async () => {
    const captured = captureLogger();
    const fetchMock: typeof fetch = async () =>
      new Response("down", { status: 503 });

    await loggedFetch(
      {
        logger: captured.logger,
        service: "pet-health-service",
        target: "owner-pet-manager",
        method: "GET",
        route: "/pets/{petId}",
      },
      fetchMock,
      "https://opm.example/pets/pet-1",
    );

    const line = clientLine(captured.read());
    assert.equal(line.statusCode, 503);
    assert.equal(line.outcome, "failure");
    assert.equal(line.level, "error");
    assert.equal("problemType" in line, false);
  });

  it("logs a call that receives no response without statusCode or problemType", async () => {
    const captured = captureLogger();
    const fetchMock: typeof fetch = async () => {
      throw new Error("connect ECONNREFUSED");
    };

    await assert.rejects(() =>
      loggedFetch(
        {
          logger: captured.logger,
          service: "activity-manager",
          target: "pet-health-service",
          method: "POST",
          route: "/activity-durations",
        },
        fetchMock,
        "https://health.example/activity-durations",
      ),
    );

    const line = clientLine(captured.read());
    assert.equal(line.outcome, "failure");
    assert.equal(line.level, "error");
    assert.equal("statusCode" in line, false);
    assert.equal("problemType" in line, false);
    assert.equal(JSON.stringify(line).includes("ECONNREFUSED"), false);
  });
});

describe("client-credentials grant", () => {
  it("is logged as http.client.completed and sends request-id", async () => {
    const captured = captureLogger();
    let grantRequestId: string | null = null;
    const fetchMock: typeof fetch = async (input, init) => {
      if (String(input) === TOKEN_ENDPOINT) {
        grantRequestId = new Headers(init?.headers).get("request-id");
        return new Response(JSON.stringify(unauthorizedProblem), {
          status: 401,
          headers: { "content-type": "application/problem+json" },
        });
      }
      return new Response("should-not-reach", { status: 200 });
    };

    const provider = createOutboundCredentialProvider({
      tokenEndpoint: TOKEN_ENDPOINT,
      serviceId: "owner-pet-manager",
      secret: SECRET,
      fetch: fetchMock,
      grantFetch: clientCredentialsGrantFetch({
        logger: captured.logger,
        service: "owner-pet-manager",
        fetch: fetchMock,
      }),
    });

    await runWithCorrelationId(CORRELATION_ID, async () => {
      await assert.rejects(() => provider.getAccessToken());
    });

    assert.equal(grantRequestId, CORRELATION_ID);
    const line = clientLine(captured.read());
    assert.equal(line.event, "http.client.completed");
    assert.equal(line.target, "authentication-service");
    assert.equal(line.method, "POST");
    assert.equal(line.route, "/oauth/token");
    assert.equal(line.statusCode, 401);
    assert.equal(line.outcome, "failure");
    assert.equal(line.problemType, unauthorizedProblem.type);
    assert.equal(line.correlationId, CORRELATION_ID);
    assert.equal(line.service, "owner-pet-manager");
    assert.equal(JSON.stringify(line).includes(SECRET), false);
  });
});
