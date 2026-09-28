import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";
import { createDrizzleStore } from "../src/infrastructure/drizzle-store.ts";
import * as schema from "../src/schema.ts";

const databaseUrl = process.env.DATABASE_URL;

describe("Postgres persistence", { skip: databaseUrl === undefined || databaseUrl.length === 0 }, () => {
  it("enforces username case-sensitive and email case-insensitive uniqueness", async () => {
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
