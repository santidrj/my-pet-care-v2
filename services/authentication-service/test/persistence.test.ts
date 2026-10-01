import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { login } from "../src/application/login.ts";
import { refresh } from "../src/application/refresh.ts";
import { sweep } from "../src/application/sweep.ts";
import { createDrizzleStore } from "../src/infrastructure/drizzle-store.ts";
import * as schema from "../src/schema.ts";
import { createHarness } from "./harness.ts";

const databaseUrl = process.env.DATABASE_URL;

describe(
  "Postgres persistence",
  { skip: databaseUrl === undefined || databaseUrl.length === 0 },
  () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzle({ client: pool, schema });
    const store = createDrizzleStore(db);

    before(async () => {
      await db.execute(sql`drop table if exists refresh_verifiers cascade`);
      await db.execute(sql`drop table if exists owner_sessions cascade`);
      await db.execute(sql`drop table if exists password_resets cascade`);
      await db.execute(sql`drop table if exists platform_clients cascade`);
      await db.execute(sql`drop table if exists rate_slots cascade`);
      await db.execute(sql`
        create table owner_sessions (
          id uuid primary key,
          owner_id uuid not null,
          password_fingerprint text not null,
          created_at timestamptz not null,
          absolute_expires_at timestamptz not null
        )
      `);
      await db.execute(sql`
        create table refresh_verifiers (
          session_id uuid not null references owner_sessions(id) on delete cascade,
          verifier text not null,
          current boolean not null,
          primary key (session_id, verifier)
        )
      `);
      await db.execute(
        sql`create unique index refresh_verifiers_verifier_uidx on refresh_verifiers (verifier)`,
      );
      await db.execute(sql`
        create table password_resets (
          id uuid primary key,
          owner_id uuid not null,
          verifier text not null unique,
          expires_at timestamptz not null,
          used boolean not null
        )
      `);
      await db.execute(sql`
        create table platform_clients (
          service_id text primary key,
          secret_hash text not null,
          active boolean not null
        )
      `);
      await db.execute(sql`
        create table rate_slots (
          id uuid primary key,
          kind text not null,
          subject text not null,
          address text not null,
          created_at timestamptz not null
        )
      `);
    });

    beforeEach(async () => {
      await db.execute(
        sql`truncate table refresh_verifiers, owner_sessions, password_resets, platform_clients, rate_slots cascade`,
      );
    });

    after(async () => {
      await pool.end();
    });

    it("revokes the session when a rotated refresh token is presented again", async () => {
      const harness = await createHarness(store);
      const passwordHash = await harness.passwords.hash("correct-horse");
      harness.owners.add({
        ownerId: "01990000-0000-7000-8000-000000000001",
        username: "Alice",
        email: "alice@example.com",
        passwordHash,
        active: true,
      });
      const first = await login(harness.deps, {
        identifier: "Alice",
        password: "correct-horse",
        address: "203.0.113.30",
      });
      assert.equal(first.ok, true);
      if (!first.ok) {
        return;
      }
      const second = await refresh(harness.deps, { refreshToken: first.value.refreshToken });
      assert.equal(second.ok, true);
      if (!second.ok) {
        return;
      }
      const reused = await refresh(harness.deps, { refreshToken: first.value.refreshToken });
      assert.equal(reused.ok, false);
      const killed = await refresh(harness.deps, { refreshToken: second.value.refreshToken });
      assert.equal(killed.ok, false);
    });

    it("lets only one of two concurrent presentations of the same refresh token survive", async () => {
      const harness = await createHarness(store);
      const passwordHash = await harness.passwords.hash("correct-horse");
      harness.owners.add({
        ownerId: "01990000-0000-7000-8000-000000000002",
        username: "Alice",
        email: "alice@example.com",
        passwordHash,
        active: true,
      });
      const first = await login(harness.deps, {
        identifier: "Alice",
        password: "correct-horse",
        address: "203.0.113.31",
      });
      assert.equal(first.ok, true);
      if (!first.ok) {
        return;
      }
      const [left, right] = await Promise.all([
        refresh(harness.deps, { refreshToken: first.value.refreshToken }),
        refresh(harness.deps, { refreshToken: first.value.refreshToken }),
      ]);
      const winners = [left, right].filter((result) => result.ok);
      assert.equal(winners.length, 1);
      const winner = winners[0];
      if (winner === undefined || !winner.ok) {
        return;
      }
      const after = await refresh(harness.deps, { refreshToken: winner.value.refreshToken });
      assert.equal(after.ok, false);
    });

    it("stops counting login failures after the window slides", async () => {
      const harness = await createHarness(store);
      const passwordHash = await harness.passwords.hash("correct-horse");
      harness.owners.add({
        ownerId: "01990000-0000-7000-8000-000000000003",
        username: "Alice",
        email: "alice@example.com",
        passwordHash,
        active: true,
      });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const failed = await login(harness.deps, {
          identifier: "Alice",
          password: "nope",
          address: `203.0.113.${40 + attempt}`,
        });
        assert.equal(failed.ok, false);
      }
      const limited = await login(harness.deps, {
        identifier: "Alice",
        password: "correct-horse",
        address: "203.0.113.49",
      });
      assert.equal(limited.ok, false);
      if (!limited.ok) {
        assert.equal(limited.error.code, "try_again_later");
      }
      harness.clock.current = new Date(harness.clock.current.getTime() + 16 * 60 * 1000);
      const later = await login(harness.deps, {
        identifier: "Alice",
        password: "correct-horse",
        address: "203.0.113.49",
      });
      assert.equal(later.ok, true);
    });

    it("drops sessions and password resets that have reached absolute expiry", async () => {
      const harness = await createHarness(store);
      const passwordHash = await harness.passwords.hash("correct-horse");
      harness.owners.add({
        ownerId: "01990000-0000-7000-8000-000000000004",
        username: "Alice",
        email: "alice@example.com",
        passwordHash,
        active: true,
      });
      const signedIn = await login(harness.deps, {
        identifier: "Alice",
        password: "correct-horse",
        address: "203.0.113.50",
      });
      assert.equal(signedIn.ok, true);
      harness.clock.current = new Date("2026-02-01T00:00:00.000Z");
      await sweep(harness.deps);
      if (!signedIn.ok) {
        return;
      }
      const dead = await refresh(harness.deps, { refreshToken: signedIn.value.refreshToken });
      assert.equal(dead.ok, false);
    });
  },
);
