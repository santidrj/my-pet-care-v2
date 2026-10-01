import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadMergedConfig } from "../src/load.js";

const shared = {
  ownerPetManager: {
    port: 3001,
    logLevel: "info",
    authBaseUrl: "http://127.0.0.1:3004",
    communityBaseUrl: "http://127.0.0.1:3005",
    platformClientActive: true,
  },
  petHealthService: {
    port: 3002,
    logLevel: "info",
    authBaseUrl: "http://127.0.0.1:3004",
    platformClientActive: true,
  },
  activityManager: {
    port: 3003,
    logLevel: "info",
    authBaseUrl: "http://127.0.0.1:3004",
    platformClientActive: true,
  },
  authenticationService: {
    port: 3004,
    logLevel: "info",
    ownerPetManagerBaseUrl: "http://127.0.0.1:3001",
    resetNoSendFloorMs: 1000,
    platformClientActive: true,
  },
  communityCollaborator: {
    port: 3005,
    logLevel: "info",
    authBaseUrl: "http://127.0.0.1:3004",
    communityOwnerIds: [],
    platformClientActive: true,
  },
};

const instance = {
  platform: {
    serviceSecret: "secret",
    setupSecret: "setup",
    jwtPublicKeyPath: "/tmp/public.pem",
  },
  ownerPetManager: {
    databaseUrl: "postgresql://localhost/owner_pet_manager",
  },
  petHealthService: {
    databaseUrl: "postgresql://localhost/pet_health_service",
  },
  activityManager: {
    databaseUrl: "postgresql://localhost/activity_manager",
  },
  authenticationService: {
    databaseUrl: "postgresql://localhost/authentication_service",
    jwtPrivateKeyPath: "/tmp/private.pem",
    resetLinkTemplate: "https://example.test/reset?token={token}",
  },
};

test("loadMergedConfig merges shared and instance", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "mpc-config-"));
  await writeFile(path.join(dir, "shared.json"), JSON.stringify(shared));
  await writeFile(path.join(dir, "instance.json"), JSON.stringify(instance));
  const config = await loadMergedConfig({ MPC_CONFIG_DIR: dir });
  assert.equal(config.ownerPetManager.port, 3001);
  assert.equal(config.ownerPetManager.databaseUrl, "postgresql://localhost/owner_pet_manager");
  assert.equal(config.platform.serviceSecret, "secret");
});
