import type { Actor } from "@my-pet-care/platform-service-authenticator";
import type { Owner, Pet, PetListVisibility } from "../domain/types.js";

export type NewOwner = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  photo: string | null;
};

export type NewPet = {
  id: string;
  ownerId: string;
  name: string;
  species: Pet["species"];
  sex: Pet["sex"];
  breed: string | null;
  dateOfBirth: string | null;
  photo: string | null;
};

export type OwnerUpdates = {
  username?: string;
  email?: string;
  passwordHash?: string;
  photo?: string | null;
};

export type PetUpdates = {
  name?: string;
  species?: Pet["species"];
  sex?: Pet["sex"];
  breed?: string | null;
  dateOfBirth?: string | null;
  photo?: string | null;
};

export type OwnerRepository = {
  findById(id: string): Promise<Owner | null>;
  findByUsername(username: string): Promise<Owner | null>;
  findByEmailIgnoreCase(email: string): Promise<Owner | null>;
  insert(owner: NewOwner): Promise<Owner>;
  update(id: string, updates: OwnerUpdates): Promise<Owner | null>;
  setPetListVisibility(
    id: string,
    visibility: PetListVisibility,
  ): Promise<Owner | null>;
  deactivate(id: string): Promise<Owner | null>;
};

export type PetRepository = {
  findById(id: string): Promise<Pet | null>;
  listByOwnerId(
    ownerId: string,
    options: { includeDeactivated: boolean },
  ): Promise<Pet[]>;
  insert(pet: NewPet): Promise<Pet>;
  update(id: string, updates: PetUpdates): Promise<Pet | null>;
  deactivate(id: string): Promise<Pet | null>;
  deactivateActiveByOwnerId(ownerId: string): Promise<number>;
};

export type UnitOfWork = {
  owners: OwnerRepository;
  pets: PetRepository;
};

/** Combined store: separate Owner/Pet repos plus one local transaction. */
export type Store = UnitOfWork & {
  withTransaction<T>(fn: (tx: UnitOfWork) => Promise<T>): Promise<T>;
};

export type PasswordHasher = {
  hash(password: string): Promise<string>;
};

export type PasswordPolicy = {
  /** Returns an error message when invalid; undefined when ok. */
  validate(password: string): string | undefined;
};

export type CommunityCollaborator = {
  isCommunityOwner(ownerId: string): Promise<boolean>;
  endBelonging(ownerId: string): Promise<void>;
};

export type AuthRevocationReason = "deactivation" | "passwordChange";

export type AuthRevocationClient = {
  revoke(ownerId: string, reason: AuthRevocationReason): Promise<void>;
};

export type IdGenerator = {
  next(): string;
};

export type UseCaseDeps = {
  store: Store;
  passwordHasher: PasswordHasher;
  passwordPolicy: PasswordPolicy;
  community: CommunityCollaborator;
  authRevocation: AuthRevocationClient;
  ids: IdGenerator;
};

export type { Actor };
