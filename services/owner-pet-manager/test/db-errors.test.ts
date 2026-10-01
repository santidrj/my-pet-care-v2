import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapOwnerUniqueViolation } from "../src/infrastructure/db-errors.ts";

describe("mapOwnerUniqueViolation", () => {
  it("maps username and email unique indexes", () => {
    const usernameError = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "owners_username_uidx",
    });
    const emailError = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "owners_email_lower_uidx",
    });

    assert.equal(mapOwnerUniqueViolation(usernameError)?.code, "username_taken");
    assert.equal(mapOwnerUniqueViolation(emailError)?.code, "email_taken");
    assert.equal(mapOwnerUniqueViolation(new Error("other")), null);
  });
});
