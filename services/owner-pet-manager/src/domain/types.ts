export type Species = "dog" | "cat";
export type Sex = "male" | "female" | "unknown";
export type PetListVisibility = "public" | "private";

export type Owner = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  photo: string | null;
  active: boolean;
  petListVisibility: PetListVisibility;
};

export type Pet = {
  id: string;
  ownerId: string;
  name: string;
  species: Species;
  sex: Sex;
  breed: string | null;
  dateOfBirth: string | null;
  photo: string | null;
  active: boolean;
};

export type OwnerPublic = {
  id: string;
  username: string;
  email?: string;
  active: boolean;
  petListVisibility: PetListVisibility;
  photo?: string;
};

export type PetSummary = {
  id: string;
  name: string;
  species: Species;
  sex: Sex;
  breed?: string;
  dateOfBirth?: string;
  photo?: string;
};

export type OwnerCredentials = {
  ownerId: string;
  passwordHash: string;
  active: boolean;
};

export function toOwnerPublic(
  owner: Owner,
  includeEmail: boolean,
): OwnerPublic {
  const result: OwnerPublic = {
    id: owner.id,
    username: owner.username,
    active: owner.active,
    petListVisibility: owner.petListVisibility,
  };
  if (includeEmail) {
    result.email = owner.email;
  }
  if (owner.photo !== null) {
    result.photo = owner.photo;
  }
  return result;
}

export function toPetSummary(pet: Pet): PetSummary {
  const summary: PetSummary = {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    sex: pet.sex,
  };
  if (pet.breed !== null) {
    summary.breed = pet.breed;
  }
  if (pet.dateOfBirth !== null) {
    summary.dateOfBirth = pet.dateOfBirth;
  }
  if (pet.photo !== null) {
    summary.photo = pet.photo;
  }
  return summary;
}

