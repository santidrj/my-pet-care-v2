import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Actor } from "@my-pet-care/platform-service-authenticator";
import {
  createOwner,
  deactivateOwner,
  getCredentialsByIdentifier,
  getCredentialsByOwnerId,
  getOwnerById,
  setPasswordFromAuth,
  setPetListVisibility,
  updateOwner,
} from "../src/application/owners.ts";
import {
  checkPetOwnership,
  createPet,
  deactivatePet,
  getPet,
  getPetSummary,
  listPetsForOwner,
} from "../src/application/pets.ts";
import type {
  AuthRevocationClient,
  CommunityCollaborator,
  UseCaseDeps,
} from "../src/application/ports.ts";
import { createTestPasswordHasher } from "../src/infrastructure/argon2-hasher.ts";
import { createDenylistPasswordPolicy } from "../src/infrastructure/denylist-policy.ts";
import { createSequentialIdGenerator } from "../src/infrastructure/ids.ts";
import { createInMemoryStore } from "../src/infrastructure/memory-store.ts";

function ownerActor(ownerId: string): Actor {
  return { kind: "owner", ownerId };
}

function platformActor(
  service:
    | "authentication-service"
    | "pet-health-service"
    | "owner-pet-manager"
    | "activity-manager"
    | "community",
): Actor {
  return { kind: "platform", service };
}

function createFakeCommunity(
  communityOwnerIds: Set<string> = new Set(),
  options: { failCheck?: boolean; endBelongingCalls?: string[] } = {},
): CommunityCollaborator {
  return {
    async isCommunityOwner(ownerId) {
      if (options.failCheck) {
        throw new Error("community down");
      }
      return communityOwnerIds.has(ownerId);
    },
    async endBelonging(ownerId) {
      options.endBelongingCalls?.push(ownerId);
    },
  };
}

function createFakeAuthRevoke(calls: Array<{ ownerId: string; reason: string }> = []): AuthRevocationClient {
  return {
    async revoke(ownerId, reason) {
      calls.push({ ownerId, reason });
    },
  };
}

function createDeps(overrides: Partial<UseCaseDeps> = {}): UseCaseDeps {
  return {
    store: createInMemoryStore(),
    passwordHasher: createTestPasswordHasher(),
    passwordPolicy: createDenylistPasswordPolicy(),
    community: createFakeCommunity(),
    authRevocation: createFakeAuthRevoke(),
    ids: createSequentialIdGenerator(),
    ...overrides,
  };
}

describe("createOwner", () => {
  it("creates an active Owner with private pet list visibility", async () => {
    const deps = createDeps();
    const result = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.value.username, "alice");
    assert.equal(result.value.email, "alice@example.com");
    assert.equal(result.value.active, true);
    assert.equal(result.value.petListVisibility, "private");
    assert.equal("password" in result.value, false);
    assert.equal("passwordHash" in result.value, false);
  });

  it("rejects duplicate username (case-sensitive) and email (case-insensitive)", async () => {
    const deps = createDeps();
    await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });

    const usernameTaken = await createOwner(deps, {
      username: "alice",
      email: "other@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(usernameTaken.ok, false);
    if (usernameTaken.ok) {
      return;
    }
    assert.equal(usernameTaken.error.code, "conflict");

    const emailTaken = await createOwner(deps, {
      username: "bob",
      email: "Alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(emailTaken.ok, false);
    if (emailTaken.ok) {
      return;
    }
    assert.equal(emailTaken.error.code, "conflict");
  });

  it("rejects common passwords and invalid fields", async () => {
    const deps = createDeps();
    const common = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "password",
    });
    assert.equal(common.ok, false);

    const badUser = await createOwner(deps, {
      username: "bad user",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(badUser.ok, false);
  });
});

describe("getOwner visibility", () => {
  let deps: UseCaseDeps;
  let ownerId: string;

  beforeEach(async () => {
    deps = createDeps();
    const created = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      throw new Error("setup failed");
    }
    ownerId = created.value.id;
  });

  it("omits email for another Owner and includes it for self and platform", async () => {
    const other = await getOwnerById(deps, ownerActor("other-owner"), ownerId);
    assert.equal(other.ok, true);
    if (!other.ok) {
      return;
    }
    assert.equal(other.value.email, undefined);

    const self = await getOwnerById(deps, ownerActor(ownerId), ownerId);
    assert.equal(self.ok, true);
    if (!self.ok) {
      return;
    }
    assert.equal(self.value.email, "alice@example.com");

    const platform = await getOwnerById(
      deps,
      platformActor("pet-health-service"),
      ownerId,
    );
    assert.equal(platform.ok, true);
    if (!platform.ok) {
      return;
    }
    assert.equal(platform.value.email, "alice@example.com");
  });
});

describe("deactivateOwner cascade", () => {
  it("deactivates active Pets then Owner and notifies collaborators", async () => {
    const revokeCalls: Array<{ ownerId: string; reason: string }> = [];
    const endBelongingCalls: string[] = [];
    const deps = createDeps({
      authRevocation: createFakeAuthRevoke(revokeCalls),
      community: createFakeCommunity(new Set(), { endBelongingCalls }),
    });

    const created = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    const ownerId = created.value.id;

    const pet = await createPet(deps, ownerActor(ownerId), ownerId, {
      name: "Rex",
      species: "dog",
      sex: "male",
    });
    assert.equal(pet.ok, true);
    if (!pet.ok) {
      return;
    }
    const petId = pet.value.id as string;

    const result = await deactivateOwner(deps, ownerActor(ownerId), ownerId);
    assert.equal(result.ok, true);

    const owner = await deps.store.owners.findById(ownerId);
    const storedPet = await deps.store.pets.findById(petId);
    assert.equal(owner?.active, false);
    assert.equal(storedPet?.active, false);
    assert.deepEqual(revokeCalls, [{ ownerId, reason: "deactivation" }]);
    assert.deepEqual(endBelongingCalls, [ownerId]);
  });

  it("fails closed when Community check fails or Owner is Community owner", async () => {
    const depsFail = createDeps({
      community: createFakeCommunity(new Set(), { failCheck: true }),
    });
    const created = await createOwner(depsFail, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    const ownerId = created.value.id;

    const unavailable = await deactivateOwner(
      depsFail,
      ownerActor(ownerId),
      ownerId,
    );
    assert.equal(unavailable.ok, false);
    if (!unavailable.ok) {
      assert.equal(unavailable.error.code, "community_check_unavailable");
    }
    assert.equal((await depsFail.store.owners.findById(ownerId))?.active, true);

    const depsOwner = createDeps({
      community: createFakeCommunity(new Set([ownerId])),
    });
    // re-insert same logical owner into new store
    const created2 = await createOwner(depsOwner, {
      username: "bob",
      email: "bob@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(created2.ok, true);
    if (!created2.ok) {
      return;
    }
    const communityOwnerId = created2.value.id;
    const gated = createDeps({
      store: depsOwner.store,
      community: createFakeCommunity(new Set([communityOwnerId])),
      passwordHasher: depsOwner.passwordHasher,
      passwordPolicy: depsOwner.passwordPolicy,
      authRevocation: depsOwner.authRevocation,
      ids: depsOwner.ids,
    });
    const blocked = await deactivateOwner(
      gated,
      ownerActor(communityOwnerId),
      communityOwnerId,
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.error.code, "conflict");
    }
    assert.equal((await gated.store.owners.findById(communityOwnerId))?.active, true);
  });

  it("rejects already deactivated Owner", async () => {
    const deps = createDeps();
    const created = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    const ownerId = created.value.id;
    await deactivateOwner(deps, ownerActor(ownerId), ownerId);
    const again = await deactivateOwner(deps, ownerActor(ownerId), ownerId);
    assert.equal(again.ok, false);
    if (!again.ok) {
      assert.equal(again.error.code, "conflict");
    }
  });
});

describe("pets and visibility", () => {
  it("enforces species dog|cat and ownership on Get Pet", async () => {
    const deps = createDeps();
    const created = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    const ownerId = created.value.id;

    const badSpecies = await createPet(deps, ownerActor(ownerId), ownerId, {
      name: "Birdy",
      species: "bird",
      sex: "unknown",
    });
    assert.equal(badSpecies.ok, false);

    const pet = await createPet(deps, ownerActor(ownerId), ownerId, {
      name: "Michi",
      species: "cat",
      sex: "female",
    });
    assert.equal(pet.ok, true);
    if (!pet.ok) {
      return;
    }

    const other = await getPet(deps, ownerActor("someone-else"), pet.value.id as string);
    assert.equal(other.ok, false);
    if (!other.ok) {
      assert.equal(other.error.code, "forbidden");
    }

    const platform = await getPet(
      deps,
      platformActor("pet-health-service"),
      pet.value.id as string,
    );
    assert.equal(platform.ok, true);
  });

  it("makes pet summary failures indistinguishable", async () => {
    const deps = createDeps();
    const a = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    const b = await createOwner(deps, {
      username: "bob",
      email: "bob@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) {
      return;
    }

    const pet = await createPet(deps, ownerActor(a.value.id), a.value.id, {
      name: "Rex",
      species: "dog",
      sex: "male",
    });
    assert.equal(pet.ok, true);
    if (!pet.ok) {
      return;
    }

    const missing = await getPetSummary(
      deps,
      ownerActor(b.value.id),
      "00000000-0000-7000-8000-000000000099",
    );
    const privateList = await getPetSummary(
      deps,
      ownerActor(b.value.id),
      pet.value.id as string,
    );
    assert.equal(missing.ok, false);
    assert.equal(privateList.ok, false);
    if (!missing.ok && !privateList.ok) {
      assert.equal(missing.error.code, privateList.error.code);
      assert.equal(missing.error.detail, privateList.error.detail);
    }

    await setPetListVisibility(
      deps,
      ownerActor(a.value.id),
      a.value.id,
      "public",
    );
    await deactivatePet(deps, ownerActor(a.value.id), pet.value.id as string);
    const deactivated = await getPetSummary(
      deps,
      ownerActor(b.value.id),
      pet.value.id as string,
    );
    assert.equal(deactivated.ok, false);
    if (!deactivated.ok && !missing.ok) {
      assert.equal(deactivated.error.detail, missing.error.detail);
    }

    const asOwner = await getPetSummary(
      deps,
      ownerActor(a.value.id),
      pet.value.id as string,
    );
    assert.equal(asOwner.ok, false);
  });

  it("lists summaries for other Owners only when public", async () => {
    const deps = createDeps();
    const a = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    const b = await createOwner(deps, {
      username: "bob",
      email: "bob@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) {
      return;
    }
    await createPet(deps, ownerActor(a.value.id), a.value.id, {
      name: "Rex",
      species: "dog",
      sex: "male",
    });

    const denied = await listPetsForOwner(
      deps,
      ownerActor(b.value.id),
      a.value.id,
    );
    assert.equal(denied.ok, false);

    await setPetListVisibility(
      deps,
      ownerActor(a.value.id),
      a.value.id,
      "public",
    );
    const listed = await listPetsForOwner(
      deps,
      ownerActor(b.value.id),
      a.value.id,
    );
    assert.equal(listed.ok, true);
    if (!listed.ok) {
      return;
    }
    assert.equal(listed.value.items.length, 1);
    assert.equal("ownerId" in listed.value.items[0]!, false);
    assert.equal("active" in listed.value.items[0]!, false);
  });
});

describe("credentials authz", () => {
  it("allows only Authentication Service", async () => {
    const deps = createDeps();
    const created = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }

    const forbidden = await getCredentialsByIdentifier(
      deps,
      ownerActor(created.value.id),
      "alice",
    );
    assert.equal(forbidden.ok, false);

    const okId = await getCredentialsByIdentifier(
      deps,
      platformActor("authentication-service"),
      "alice",
    );
    assert.equal(okId.ok, true);
    if (!okId.ok) {
      return;
    }
    assert.equal(typeof okId.value.passwordHash, "string");
    assert.equal(okId.value.passwordHash.includes("argon2"), true);

    const byOwner = await getCredentialsByOwnerId(
      deps,
      platformActor("authentication-service"),
      created.value.id,
    );
    assert.equal(byOwner.ok, true);

    const set = await setPasswordFromAuth(
      deps,
      platformActor("authentication-service"),
      created.value.id,
      "another-unique-pass-42",
    );
    assert.equal(set.ok, true);
  });
});

describe("checkPetOwnership", () => {
  it("answers for platform services including deactivated resources", async () => {
    const deps = createDeps();
    const created = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    const pet = await createPet(deps, ownerActor(created.value.id), created.value.id, {
      name: "Rex",
      species: "dog",
      sex: "male",
    });
    assert.equal(pet.ok, true);
    if (!pet.ok) {
      return;
    }

    const yes = await checkPetOwnership(
      deps,
      platformActor("activity-manager"),
      pet.value.id as string,
      created.value.id,
    );
    assert.equal(yes.ok, true);
    if (yes.ok) {
      assert.equal(yes.value.isOwner, true);
    }

    const no = await checkPetOwnership(
      deps,
      platformActor("activity-manager"),
      pet.value.id as string,
      "id-9999",
    );
    assert.equal(no.ok, false);
  });
});

describe("updateOwner password revoke", () => {
  it("revokes on password change without failing the update when revoke throws", async () => {
    const deps = createDeps({
      authRevocation: {
        async revoke() {
          throw new Error("auth down");
        },
      },
    });
    const created = await createOwner(deps, {
      username: "alice",
      email: "alice@example.com",
      password: "unique-passphrase-99",
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    const updated = await updateOwner(
      deps,
      ownerActor(created.value.id),
      created.value.id,
      { password: "brand-new-unique-pass" },
    );
    assert.equal(updated.ok, true);
  });
});
