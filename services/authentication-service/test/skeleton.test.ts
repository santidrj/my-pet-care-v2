import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pino from "pino";
import { validationFailedProblem } from "@my-pet-care/contracts";
import { buildApp } from "../src/app.ts";
import { createHarness } from "./harness.ts";

describe("authentication service skeleton", () => {
  it("returns 400 validation-failed when the body fails schema validation", async () => {
    const harness = await createHarness();
    const app = await buildApp({
      service: "authentication-service",
      logger: pino({ level: "silent" }),
      deps: harness.deps,
      publicKey: harness.publicKey,
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {},
    });

    assert.equal(response.statusCode, 400);
    assert.match(
      String(response.headers["content-type"]),
      /^application\/problem\+json/,
    );
    assert.deepEqual(response.json(), validationFailedProblem);
    await app.close();
  });
});
