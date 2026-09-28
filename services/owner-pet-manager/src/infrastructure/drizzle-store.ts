import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  NewOwner,
  NewPet,
  OwnerRepository,
  OwnerUpdates,
  PetRepository,
  PetUpdates,
  Store,
  UnitOfWork,
} from "../application/ports.js";
import type { Owner, Pet, PetListVisibility, Sex, Species } from "../domain/types.js";
import { normalizeEmail } from "../domain/validation.js";
import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

function mapOwner(row: typeof schema.owners.$inferSelect): Owner {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.passwordHash,
    photo: row.photo,
    active: row.active,
    petListVisibility: row.petListVisibility as PetListVisibility,
  };
}

function mapPet(row: typeof schema.pets.$inferSelect): Pet {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    species: row.species as Species,
    sex: row.sex as Sex,
    breed: row.breed,
    dateOfBirth: row.dateOfBirth,
    photo: row.photo,
    active: row.active,
  };
}

function createOwnerRepo(db: Db): OwnerRepository {
  return {
    async findById(id) {
      const rows = await db
        .select()
        .from(schema.owners)
        .where(eq(schema.owners.id, id))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : mapOwner(row);
    },
    async findByUsername(username) {
      const rows = await db
        .select()
        .from(schema.owners)
        .where(eq(schema.owners.username, username))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : mapOwner(row);
    },
    async findByEmailIgnoreCase(email) {
      const rows = await db
        .select()
        .from(schema.owners)
        .where(sql`lower(${schema.owners.email}) = ${normalizeEmail(email)}`)
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : mapOwner(row);
    },
    async insert(owner: NewOwner) {
      const rows = await db
        .insert(schema.owners)
        .values({
          id: owner.id,
          username: owner.username,
          email: owner.email,
          passwordHash: owner.passwordHash,
          photo: owner.photo,
          active: true,
          petListVisibility: "private",
        })
        .returning();
      const row = rows[0];
      if (row === undefined) {
        throw new Error("Owner insert returned no row.");
      }
      return mapOwner(row);
    },
    async update(id, updates: OwnerUpdates) {
      const patch: Partial<typeof schema.owners.$inferInsert> = {};
      if (updates.username !== undefined) {
        patch.username = updates.username;
      }
      if (updates.email !== undefined) {
        patch.email = updates.email;
      }
      if (updates.passwordHash !== undefined) {
        patch.passwordHash = updates.passwordHash;
      }
      if (updates.photo !== undefined) {
        patch.photo = updates.photo;
      }
      if (Object.keys(patch).length === 0) {
        return this.findById(id);
      }
      const rows = await db
        .update(schema.owners)
        .set(patch)
        .where(eq(schema.owners.id, id))
        .returning();
      const row = rows[0];
      return row === undefined ? null : mapOwner(row);
    },
    async setPetListVisibility(id, visibility) {
      const rows = await db
        .update(schema.owners)
        .set({ petListVisibility: visibility })
        .where(eq(schema.owners.id, id))
        .returning();
      const row = rows[0];
      return row === undefined ? null : mapOwner(row);
    },
    async deactivate(id) {
      const rows = await db
        .update(schema.owners)
        .set({ active: false })
        .where(eq(schema.owners.id, id))
        .returning();
      const row = rows[0];
      return row === undefined ? null : mapOwner(row);
    },
  };
}

function createPetRepo(db: Db): PetRepository {
  return {
    async findById(id) {
      const rows = await db
        .select()
        .from(schema.pets)
        .where(eq(schema.pets.id, id))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : mapPet(row);
    },
    async listByOwnerId(ownerId, options) {
      const rows = options.includeDeactivated
        ? await db
            .select()
            .from(schema.pets)
            .where(eq(schema.pets.ownerId, ownerId))
        : await db
            .select()
            .from(schema.pets)
            .where(
              and(eq(schema.pets.ownerId, ownerId), eq(schema.pets.active, true)),
            );
      return rows.map(mapPet);
    },
    async insert(pet: NewPet) {
      const rows = await db
        .insert(schema.pets)
        .values({
          id: pet.id,
          ownerId: pet.ownerId,
          name: pet.name,
          species: pet.species,
          sex: pet.sex,
          breed: pet.breed,
          dateOfBirth: pet.dateOfBirth,
          photo: pet.photo,
          active: true,
        })
        .returning();
      const row = rows[0];
      if (row === undefined) {
        throw new Error("Pet insert returned no row.");
      }
      return mapPet(row);
    },
    async update(id, updates: PetUpdates) {
      const patch: Partial<typeof schema.pets.$inferInsert> = {};
      if (updates.name !== undefined) {
        patch.name = updates.name;
      }
      if (updates.species !== undefined) {
        patch.species = updates.species;
      }
      if (updates.sex !== undefined) {
        patch.sex = updates.sex;
      }
      if (updates.breed !== undefined) {
        patch.breed = updates.breed;
      }
      if (updates.dateOfBirth !== undefined) {
        patch.dateOfBirth = updates.dateOfBirth;
      }
      if (updates.photo !== undefined) {
        patch.photo = updates.photo;
      }
      if (Object.keys(patch).length === 0) {
        return this.findById(id);
      }
      const rows = await db
        .update(schema.pets)
        .set(patch)
        .where(eq(schema.pets.id, id))
        .returning();
      const row = rows[0];
      return row === undefined ? null : mapPet(row);
    },
    async deactivate(id) {
      const rows = await db
        .update(schema.pets)
        .set({ active: false })
        .where(eq(schema.pets.id, id))
        .returning();
      const row = rows[0];
      return row === undefined ? null : mapPet(row);
    },
    async deactivateActiveByOwnerId(ownerId) {
      const rows = await db
        .update(schema.pets)
        .set({ active: false })
        .where(
          and(eq(schema.pets.ownerId, ownerId), eq(schema.pets.active, true)),
        )
        .returning();
      return rows.length;
    },
  };
}

function unitOfWork(db: Db): UnitOfWork {
  return {
    owners: createOwnerRepo(db),
    pets: createPetRepo(db),
  };
}

export function createDrizzleStore(db: Db): Store {
  const uow = unitOfWork(db);
  return {
    ...uow,
    async withTransaction(fn) {
      return db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        return fn(unitOfWork(txDb));
      });
    },
  };
}
