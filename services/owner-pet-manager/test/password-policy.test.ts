import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDenylistPasswordPolicy } from "../src/infrastructure/denylist-policy.ts";

describe("password policy length", () => {
  const policy = createDenylistPasswordPolicy(new Set());

  it("accepts 8 and 128 characters and rejects 7 and 129", () => {
    assert.equal(policy.validate("a".repeat(8)), undefined);
    assert.equal(policy.validate("a".repeat(128)), undefined);
    assert.notEqual(policy.validate("a".repeat(7)), undefined);
    assert.notEqual(policy.validate("a".repeat(129)), undefined);
  });

  it("counts Unicode code points, not UTF-16 code units", () => {
    // Each emoji is one code point but two UTF-16 code units.
    assert.equal(policy.validate("🐶".repeat(128)), undefined);
    assert.notEqual(policy.validate("🐶".repeat(129)), undefined);
    assert.notEqual(policy.validate("🐶".repeat(7)), undefined);
  });
});
