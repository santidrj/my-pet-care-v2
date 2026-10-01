import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const ownerSessions = pgTable("owner_sessions", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  passwordFingerprint: text("password_fingerprint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const refreshVerifiers = pgTable(
  "refresh_verifiers",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => ownerSessions.id, { onDelete: "cascade" }),
    verifier: text("verifier").notNull(),
    current: boolean("current").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.verifier] }),
    uniqueIndex("refresh_verifiers_verifier_uidx").on(table.verifier),
  ],
);

export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  verifier: text("verifier").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  used: boolean("used").notNull(),
});

export const platformClients = pgTable("platform_clients", {
  serviceId: text("service_id").primaryKey(),
  secretHash: text("secret_hash").notNull(),
  active: boolean("active").notNull(),
});

export const rateSlots = pgTable("rate_slots", {
  id: uuid("id").primaryKey(),
  kind: text("kind").notNull(),
  subject: text("subject").notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
});
