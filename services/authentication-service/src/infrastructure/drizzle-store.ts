import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PlatformServiceId } from "@my-pet-care/platform-service-authenticator";
import type {
  AuthStore,
  PasswordResetRecord,
  PlatformClientRecord,
  RateReservation,
  ReserveRateSlot,
  RotateRefreshResult,
  StoredSession,
} from "../application/ports.js";
import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export function createDrizzleStore(db: Db): AuthStore {
  async function loadSession(
    tx: Db,
    sessionId: string,
  ): Promise<StoredSession | null> {
    const sessions = await tx
      .select()
      .from(schema.ownerSessions)
      .where(eq(schema.ownerSessions.id, sessionId));
    const session = sessions[0];
    if (session === undefined) {
      return null;
    }
    const verifiers = await tx
      .select()
      .from(schema.refreshVerifiers)
      .where(eq(schema.refreshVerifiers.sessionId, sessionId));
    return {
      id: session.id,
      ownerId: session.ownerId,
      passwordFingerprint: session.passwordFingerprint,
      createdAt: session.createdAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      verifiers: verifiers.map((verifier) => ({
        verifier: verifier.verifier,
        current: verifier.current,
      })),
    };
  }

  return {
    async insertSession(session) {
      await db.transaction(async (tx) => {
        await tx.insert(schema.ownerSessions).values({
          id: session.id,
          ownerId: session.ownerId,
          passwordFingerprint: session.passwordFingerprint,
          createdAt: session.createdAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
        });
        if (session.verifiers.length > 0) {
          await tx.insert(schema.refreshVerifiers).values(
            session.verifiers.map((verifier) => ({
              sessionId: session.id,
              verifier: verifier.verifier,
              current: verifier.current,
            })),
          );
        }
      });
    },

    async findSessionByVerifier(verifier) {
      const rows = await db
        .select({ sessionId: schema.refreshVerifiers.sessionId })
        .from(schema.refreshVerifiers)
        .where(eq(schema.refreshVerifiers.verifier, verifier));
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      return loadSession(db, row.sessionId);
    },

    async rotateRefresh(input): Promise<RotateRefreshResult> {
      return db.transaction(async (tx) => {
        const locked = await tx
          .select()
          .from(schema.refreshVerifiers)
          .where(eq(schema.refreshVerifiers.verifier, input.presentedVerifier))
          .for("update");
        const verifier = locked[0];
        if (verifier === undefined) {
          return "missing";
        }
        const sessions = await tx
          .select()
          .from(schema.ownerSessions)
          .where(eq(schema.ownerSessions.id, verifier.sessionId))
          .for("update");
        const session = sessions[0];
        if (session === undefined) {
          return "missing";
        }
        if (!verifier.current) {
          await tx
            .delete(schema.ownerSessions)
            .where(eq(schema.ownerSessions.id, session.id));
          return "reused";
        }
        if (session.absoluteExpiresAt.getTime() <= input.now.getTime()) {
          await tx
            .delete(schema.ownerSessions)
            .where(eq(schema.ownerSessions.id, session.id));
          return "expired";
        }
        await tx
          .update(schema.refreshVerifiers)
          .set({ current: false })
          .where(eq(schema.refreshVerifiers.sessionId, session.id));
        await tx.insert(schema.refreshVerifiers).values({
          sessionId: session.id,
          verifier: input.nextVerifier,
          current: true,
        });
        return "rotated";
      });
    },

    async deleteSession(sessionId) {
      await db.delete(schema.ownerSessions).where(eq(schema.ownerSessions.id, sessionId));
    },

    async deleteSessionsForOwner(ownerId) {
      await db.delete(schema.ownerSessions).where(eq(schema.ownerSessions.ownerId, ownerId));
    },

    async insertPasswordReset(reset) {
      await db.insert(schema.passwordResets).values(reset);
    },

    async findPasswordResetByVerifier(verifier) {
      const rows = await db
        .select()
        .from(schema.passwordResets)
        .where(eq(schema.passwordResets.verifier, verifier));
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      const record: PasswordResetRecord = {
        id: row.id,
        ownerId: row.ownerId,
        verifier: row.verifier,
        expiresAt: row.expiresAt,
        used: row.used,
      };
      return record;
    },

    async decidePasswordReset(input) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(schema.passwordResets)
          .where(eq(schema.passwordResets.verifier, input.verifier))
          .for("update");
        const reset = rows[0];
        if (
          reset === undefined ||
          reset.used ||
          reset.expiresAt.getTime() <= input.now.getTime()
        ) {
          return "unusable";
        }
        const decision = await input.decide({
          id: reset.id,
          ownerId: reset.ownerId,
          verifier: reset.verifier,
          expiresAt: reset.expiresAt,
          used: reset.used,
        });
        if (decision !== "consume") {
          return "left";
        }
        await tx
          .update(schema.passwordResets)
          .set({ used: true })
          .where(eq(schema.passwordResets.id, reset.id));
        await tx
          .delete(schema.ownerSessions)
          .where(eq(schema.ownerSessions.ownerId, reset.ownerId));
        return "consumed";
      });
    },

    async findPlatformClient(serviceId) {
      const rows = await db
        .select()
        .from(schema.platformClients)
        .where(eq(schema.platformClients.serviceId, serviceId));
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      const client: PlatformClientRecord = {
        serviceId: row.serviceId as PlatformServiceId,
        secretHash: row.secretHash,
        active: row.active,
      };
      return client;
    },

    async upsertPlatformClient(client) {
      await db
        .insert(schema.platformClients)
        .values(client)
        .onConflictDoUpdate({
          target: schema.platformClients.serviceId,
          set: { secretHash: client.secretHash, active: client.active },
        });
    },

    async reserveRateSlot(input: ReserveRateSlot): Promise<RateReservation> {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${input.kind}:subject:${input.subject}`}))`,
        );
        if (input.addressLimit !== null) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`${input.kind}:address:${input.address}`}))`,
          );
        }
        const since = new Date(input.now.getTime() - input.windowMs);
        const subjectRows = await tx
          .select({ id: schema.rateSlots.id })
          .from(schema.rateSlots)
          .where(
            and(
              eq(schema.rateSlots.kind, input.kind),
              eq(schema.rateSlots.subject, input.subject),
              gte(schema.rateSlots.createdAt, since),
            ),
          );
        if (subjectRows.length >= input.subjectLimit) {
          return { reserved: false };
        }
        if (input.addressLimit !== null) {
          const addressRows = await tx
            .select({ id: schema.rateSlots.id })
            .from(schema.rateSlots)
            .where(
              and(
                eq(schema.rateSlots.kind, input.kind),
                eq(schema.rateSlots.address, input.address),
                gte(schema.rateSlots.createdAt, since),
              ),
            );
          if (addressRows.length >= input.addressLimit) {
            return { reserved: false };
          }
        }
        await tx.insert(schema.rateSlots).values({
          id: input.id,
          kind: input.kind,
          subject: input.subject,
          address: input.address,
          createdAt: input.now,
        });
        return { reserved: true, id: input.id };
      });
    },

    async releaseRateSlot(id) {
      await db.delete(schema.rateSlots).where(eq(schema.rateSlots.id, id));
    },

    async sweep(now) {
      await db
        .delete(schema.ownerSessions)
        .where(lte(schema.ownerSessions.absoluteExpiresAt, now));
      await db
        .delete(schema.passwordResets)
        .where(lte(schema.passwordResets.expiresAt, now));
    },
  };
}
