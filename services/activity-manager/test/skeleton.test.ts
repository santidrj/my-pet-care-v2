import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pino from "pino";
import { z } from "zod";
import { validationFailedProblem } from "@my-pet-care/contracts";
import { buildApp } from "../src/app.ts";

describe("activity manager skeleton", () => {
  it("returns 400 validation-failed when the body fails schema validation", async () => {
    const app = await buildApp("activity-manager", pino({ level: "silent" }));
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
    await app.close();
  });
});
