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
import { normalizeEmail } from "../domain/validation.js";
import type { Owner, Pet, PetListVisibility } from "../domain/types.js";

type MutableStores = {
  owners: Map<string, Owner>;
  pets: Map<string, Pet>;
};

function createOwnerRepo(data: MutableStores): OwnerRepository {
  return {
    async findById(id) {
      return data.owners.get(id) ?? null;
    },
    async findByUsername(username) {
      for (const owner of data.owners.values()) {
        if (owner.username === username) {
          return owner;
        }
      }
      return null;
    },
    async findByEmailIgnoreCase(email) {
      const needle = normalizeEmail(email);
      for (const owner of data.owners.values()) {
        if (normalizeEmail(owner.email) === needle) {
          return owner;
        }
      }
      return null;
    },
    async insert(owner: NewOwner) {
      const record: Owner = {
        ...owner,
        active: true,
        petListVisibility: "private",
      };
      data.owners.set(record.id, record);
      return { ...record };
    },
    async update(id, updates: OwnerUpdates) {
      const existing = data.owners.get(id);
      if (existing === undefined) {
        return null;
      }
      const next: Owner = {
        ...existing,
        username: updates.username ?? existing.username,
        email: updates.email ?? existing.email,
        passwordHash: updates.passwordHash ?? existing.passwordHash,
        photo: updates.photo !== undefined ? updates.photo : existing.photo,
      };
      data.owners.set(id, next);
      return { ...next };
    },
    async setPetListVisibility(id, visibility: PetListVisibility) {
      const existing = data.owners.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, petListVisibility: visibility };
      data.owners.set(id, next);
      return { ...next };
    },
    async deactivate(id) {
      const existing = data.owners.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, active: false };
      data.owners.set(id, next);
      return { ...next };
    },
  };
}

function createPetRepo(data: MutableStores): PetRepository {
  return {
    async findById(id) {
      return data.pets.get(id) ?? null;
    },
    async listByOwnerId(ownerId, options) {
      const pets = [...data.pets.values()].filter((pet) => {
        if (pet.ownerId !== ownerId) {
          return false;
        }
        if (!options.includeDeactivated && !pet.active) {
          return false;
        }
        return true;
      });
      return pets.map((pet) => ({ ...pet }));
    },
    async insert(pet: NewPet) {
      const record: Pet = {
        ...pet,
        active: true,
      };
      data.pets.set(record.id, record);
      return { ...record };
    },
    async update(id, updates: PetUpdates) {
      const existing = data.pets.get(id);
      if (existing === undefined) {
        return null;
      }
      const next: Pet = {
        ...existing,
        name: updates.name ?? existing.name,
        species: updates.species ?? existing.species,
        sex: updates.sex ?? existing.sex,
        breed: updates.breed !== undefined ? updates.breed : existing.breed,
        dateOfBirth:
          updates.dateOfBirth !== undefined
            ? updates.dateOfBirth
            : existing.dateOfBirth,
        photo: updates.photo !== undefined ? updates.photo : existing.photo,
      };
      data.pets.set(id, next);
      return { ...next };
    },
    async deactivate(id) {
      const existing = data.pets.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, active: false };
      data.pets.set(id, next);
      return { ...next };
    },
    async deactivateActiveByOwnerId(ownerId) {
      let count = 0;
      for (const [id, pet] of data.pets) {
        if (pet.ownerId === ownerId && pet.active) {
          data.pets.set(id, { ...pet, active: false });
          count += 1;
        }
      }
      return count;
    },
  };
}

function unitOfWork(data: MutableStores): UnitOfWork {
  return {
    owners: createOwnerRepo(data),
    pets: createPetRepo(data),
  };
}

export function createInMemoryStore(): Store {
  const data: MutableStores = {
    owners: new Map(),
    pets: new Map(),
  };

  const uow = unitOfWork(data);

  return {
    ...uow,
    async withTransaction(fn) {
      const ownerSnap = new Map(
        [...data.owners.entries()].map(([k, v]) => [k, { ...v }]),
      );
      const petSnap = new Map(
        [...data.pets.entries()].map(([k, v]) => [k, { ...v }]),
      );
      try {
        return await fn(unitOfWork(data));
      } catch (error) {
        data.owners.clear();
        for (const [k, v] of ownerSnap) {
          data.owners.set(k, v);
        }
        data.pets.clear();
        for (const [k, v] of petSnap) {
          data.pets.set(k, v);
        }
        throw error;
      }
    },
  };
}
