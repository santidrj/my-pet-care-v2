import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { before, describe, it } from "node:test";
import { generateKeyPair } from "jose";
import pino, { type Logger } from "pino";
import { z } from "zod";
import {
  internalErrorProblem,
  notFoundProblem,
  unauthorizedProblem,
  validationFailedProblem,
} from "@my-pet-care/contracts";
import { buildServiceApp } from "../src/index.ts";

const ALG = "EdDSA";

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

function completed(logs: Record<string, unknown>[]): Record<string, unknown> {
  const line = logs.find((entry) => entry.event === "http.request.completed");
  assert.ok(line, "expected http.request.completed");
  return line;
}

describe("service skeleton", () => {
  let publicKey: CryptoKey;

  before(async () => {
    const pair = await generateKeyPair(ALG);
    publicKey = pair.publicKey;
  });

  it("returns 400 validation-failed when the body fails schema validation", async () => {
    const captured = captureLogger();
    const app = await buildServiceApp({
      service: "pet-health-service",
      logger: captured.logger,
    });
    app.post(
      "/widgets",
      {
        schema: {
          body: z.object({ name: z.string().min(1) }),
        },
      },
      async () => ({ ok: true }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/widgets",
      payload: {},
    });

    assert.equal(response.statusCode, 400);
    assert.match(
      String(response.headers["content-type"]),
      /^application\/problem\+json/,
    );
    assert.deepEqual(response.json(), validationFailedProblem);
    const line = completed(captured.read());
    assert.equal(line.problemType, validationFailedProblem.type);
    assert.equal(line.statusCode, 400);
    assert.equal(line.outcome, "failure");
    assert.equal(line.level, "warn");
    assert.equal(line.route, "/widgets");
    await app.close();
  });

  it("returns 404 not-found for an unknown route", async () => {
    const captured = captureLogger();
    const app = await buildServiceApp({
      service: "activity-manager",
      logger: captured.logger,
    });

    const response = await app.inject({ method: "GET", url: "/missing" });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), notFoundProblem);
    const line = completed(captured.read());
    assert.equal(line.problemType, notFoundProblem.type);
    assert.equal(line.route, "unmatched");
    await app.close();
  });

  it("returns 500 internal-error without copying the thrown message into the log", async () => {
    const captured = captureLogger();
    const app = await buildServiceApp({
      service: "authentication-service",
      logger: captured.logger,
    });
    app.get("/boom", async () => {
      throw new Error("database password=secret");
    });

    const response = await app.inject({ method: "GET", url: "/boom" });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), internalErrorProblem);
    const line = completed(captured.read());
    assert.equal(line.problemType, internalErrorProblem.type);
    assert.equal(line.level, "error");
    assert.equal(JSON.stringify(line).includes("password=secret"), false);
    await app.close();
  });

  it("logs an authenticator 401 with its problemType", async () => {
    const captured = captureLogger();
    const app = await buildServiceApp({
      service: "owner-pet-manager",
      logger: captured.logger,
      authenticator: { publicKey },
    });
    app.get("/pets/:petId", async () => ({ ok: true }));

    const response = await app.inject({
      method: "GET",
      url: "/pets/pet-1",
      headers: { authorization: "Bearer not-a-jwt" },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), unauthorizedProblem);
    const line = completed(captured.read());
    assert.equal(line.problemType, unauthorizedProblem.type);
    assert.equal(line.statusCode, 401);
    assert.equal(line.outcome, "failure");
    assert.equal(line.level, "warn");
    assert.equal(line.method, "GET");
    assert.equal(line.route, "/pets/:petId");
    assert.equal(JSON.stringify(line).includes("not-a-jwt"), false);
    await app.close();
  });

  it("omits path parameters marked sensitive and keeps ordinary path ids", async () => {
    const captured = captureLogger();
    const app = await buildServiceApp({
      service: "activity-manager",
      logger: captured.logger,
    });
    const shareToken = "capability-share-token";
    app.get(
      "/external-shares/:token/pets/:petId",
      {
        config: { sensitiveParams: ["token"] },
        schema: {
          params: z.object({
            token: z.string(),
            petId: z.string(),
          }),
        },
      },
      async () => ({ ok: true }),
    );

    const response = await app.inject({
      method: "GET",
      url: `/external-shares/${shareToken}/pets/pet-42`,
    });

    assert.equal(response.statusCode, 200);
    const line = completed(captured.read());
    assert.equal(line.petId, "pet-42");
    assert.equal("token" in line, false);
    assert.equal(line.route, "/external-shares/:token/pets/:petId");
    assert.equal(JSON.stringify(line).includes(shareToken), false);
    await app.close();
  });

  it("serves health without a JWT when the authenticator is registered", async () => {
    const app = await buildServiceApp({
      service: "pet-health-service",
      logger: pino({ level: "silent" }),
      authenticator: { publicKey },
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok" });
    await app.close();
  });
});
