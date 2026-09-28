import {
  boolean,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    photo: text("photo"),
    active: boolean("active").notNull().default(true),
    petListVisibility: text("pet_list_visibility").notNull().default("private"),
  },
  (table) => [
    uniqueIndex("owners_username_uidx").on(table.username),
    uniqueIndex("owners_email_lower_uidx").on(sql`lower(${table.email})`),
  ],
);

export const pets = pgTable("pets", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id),
  name: text("name").notNull(),
  species: text("species").notNull(),
  sex: text("sex").notNull(),
  breed: text("breed"),
  dateOfBirth: text("date_of_birth"),
  photo: text("photo"),
  active: boolean("active").notNull().default(true),
});
