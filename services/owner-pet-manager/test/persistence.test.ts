import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";
import { createDrizzleStore } from "../src/infrastructure/drizzle-store.ts";
import { applyMigrations } from "../src/migrate.ts";
import * as schema from "../src/schema.ts";

/** Default URL used by `pnpm test:opm:persistence` / `test:persistence`. */
const DEFAULT_OPM_TEST_DATABASE_URL =
  "postgresql://my_pet_care:my_pet_care@localhost:5432/owner_pet_manager_test";

/** Dev (and other service) databases that persistence tests must never wipe. */
const PROTECTED_DATABASE_NAMES = new Set([
  "owner_pet_manager",
  "pet_health_service",
  "activity_manager",
  "authentication_service",
  "postgres",
]);

const databaseUrl = process.env.OPM_TEST_DATABASE_URL;

function databaseNameFromUrl(connectionString: string): string {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (name.length === 0) {
    throw new Error("OPM_TEST_DATABASE_URL must include a database name.");
  }
  return name;
}

function quoteIdent(ident: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
    throw new Error(`Refusing unsafe database name: ${ident}`);
  }
  return `"${ident}"`;
}

function assertNotProtectedDatabase(connectionString: string): void {
  const name = databaseNameFromUrl(connectionString);
  if (PROTECTED_DATABASE_NAMES.has(name)) {
    throw new Error(
      `Refusing to run persistence tests against the "${name}" database. ` +
        `Use a dedicated test database such as owner_pet_manager_test ` +
        `(OPM_TEST_DATABASE_URL=${DEFAULT_OPM_TEST_DATABASE_URL}).`,
    );
  }
}

/** Create the test database if this Postgres volume predates the init script entry. */
async function ensureDatabaseExists(connectionString: string): Promise<void> {
  const databaseName = databaseNameFromUrl(connectionString);
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  try {
    const existing = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      databaseName,
    ]);
    if (existing.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE ${quoteIdent(databaseName)}`);
    }
  } finally {
    await adminPool.end();
  }
}

/** Drop app tables and the drizzle migration journal so `applyMigrations` is a clean replay. */
async function resetSchema(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool });
  try {
    await db.execute(sql`drop table if exists pets cascade`);
    await db.execute(sql`drop table if exists owners cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
  } finally {
    await pool.end();
  }
}

describe("Postgres persistence", {
  skip: databaseUrl === undefined || databaseUrl.length === 0,
}, () => {
  it("enforces username case-sensitive and email case-insensitive uniqueness", async () => {
    assert.ok(databaseUrl);
    assertNotProtectedDatabase(databaseUrl);
    await ensureDatabaseExists(databaseUrl);
    await resetSchema(databaseUrl);
    await applyMigrations(databaseUrl);

    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzle({ client: pool, schema });

    const store = createDrizzleStore(db);
    const ownerA = await store.owners.insert({
      id: uuidv7(),
      username: "Alice",
      email: "Alice@Example.com",
      passwordHash: "hash",
      photo: null,
    });

    await assert.rejects(async () => {
      await store.owners.insert({
        id: uuidv7(),
        username: "Alice",
        email: "other@example.com",
        passwordHash: "hash",
        photo: null,
      });
    });

    await assert.rejects(async () => {
      await store.owners.insert({
        id: uuidv7(),
        username: "Bob",
        email: "alice@example.com",
        passwordHash: "hash",
        photo: null,
      });
    });

    const found = await store.owners.findByEmailIgnoreCase("ALICE@example.com");
    assert.equal(found?.id, ownerA.id);

    const petId = uuidv7();
    await store.pets.insert({
      id: petId,
      ownerId: ownerA.id,
      name: "Rex",
      species: "dog",
      sex: "male",
      breed: null,
      dateOfBirth: null,
      photo: null,
    });

    await store.withTransaction(async (tx) => {
      await tx.pets.deactivateActiveByOwnerId(ownerA.id);
      await tx.owners.deactivate(ownerA.id);
    });

    assert.equal((await store.owners.findById(ownerA.id))?.active, false);
    assert.equal((await store.pets.findById(petId))?.active, false);

    await pool.end();
  });
});
