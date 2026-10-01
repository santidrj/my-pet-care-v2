import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEnvOverrides } from "../src/env-overrides.js";
import { mergeDocuments } from "../src/merge.js";

test("mergeDocuments replaces scalars and deep-merges objects", () => {
  const base = {
    ownerPetManager: { port: 3001, logLevel: "info" },
    tags: ["a"],
  };
  const overlay = {
    ownerPetManager: { port: 4001 },
    tags: ["b"],
  };
  const merged = mergeDocuments(base, overlay);
  assert.equal(merged.ownerPetManager.port, 4001);
  assert.equal((merged.ownerPetManager as { logLevel: string }).logLevel, "info");
  assert.deepEqual(merged.tags, ["b"]);
});

test("applyEnvOverrides sets a leaf from MPC_*", () => {
  const doc = { ownerPetManager: { port: 3001 } };
  applyEnvOverrides(doc, { MPC_OWNER_PET_MANAGER_PORT: "3002" });
  assert.equal((doc.ownerPetManager as { port: number }).port, 3002);
});
