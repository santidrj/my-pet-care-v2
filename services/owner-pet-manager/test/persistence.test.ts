import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";
import { createDrizzleStore } from "../src/infrastructure/drizzle-store.ts";
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

describe("Postgres persistence", {
  skip: databaseUrl === undefined || databaseUrl.length === 0,
}, () => {
  it("enforces username case-sensitive and email case-insensitive uniqueness", async () => {
    assert.ok(databaseUrl);
    assertNotProtectedDatabase(databaseUrl);
    await ensureDatabaseExists(databaseUrl);

    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzle({ client: pool, schema });

    await db.execute(sql`drop table if exists pets cascade`);
    await db.execute(sql`drop table if exists owners cascade`);
    await db.execute(sql`
      create table owners (
        id uuid primary key,
        username text not null,
        email text not null,
        password_hash text not null,
        photo text,
        active boolean not null default true,
        pet_list_visibility text not null default 'private'
      )
    `);
    await db.execute(sql`create unique index owners_username_uidx on owners (username)`);
    await db.execute(sql`create unique index owners_email_lower_uidx on owners (lower(email))`);
    await db.execute(sql`
      create table pets (
        id uuid primary key,
        owner_id uuid not null references owners(id),
        name text not null,
        species text not null,
        sex text not null,
        breed text,
        date_of_birth text,
        photo text,
        active boolean not null default true
      )
    `);

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
