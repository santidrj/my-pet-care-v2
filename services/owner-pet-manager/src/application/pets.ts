import { Failures, type DomainFailure } from "../domain/failures.js";
import {
  toPetSummary,
  type Pet,
  type PetSummary,
} from "../domain/types.js";
import {
  isValidDateOfBirth,
  isValidSex,
  isValidSpecies,
} from "../domain/validation.js";
import {
  isAnyOwner,
  isOtherOwner,
  isOwningOwner,
  isOwnerOrPlatform,
  isPlatformService,
} from "./authz.js";
import type { Actor, UseCaseDeps } from "./ports.js";
import { err, ok, type Result } from "./result.js";

export type CreatePetInput = {
  name: string;
  species: string;
  sex: string;
  breed?: string | null;
  dateOfBirth?: string | null;
  photo?: string | null;
};

export type UpdatePetInput = {
  name?: string;
  species?: string;
  sex?: string;
  breed?: string | null;
  dateOfBirth?: string | null;
  photo?: string | null;
};

function petWire(pet: Pet): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: pet.id,
    ownerId: pet.ownerId,
    name: pet.name,
    species: pet.species,
    sex: pet.sex,
    active: pet.active,
  };
  if (pet.breed !== null) {
    body.breed = pet.breed;
  }
  if (pet.dateOfBirth !== null) {
    body.dateOfBirth = pet.dateOfBirth;
  }
  if (pet.photo !== null) {
    body.photo = pet.photo;
  }
  return body;
}

export async function createPet(
  deps: UseCaseDeps,
  actor: Actor | null,
  ownerId: string,
  input: CreatePetInput,
): Promise<Result<Record<string, unknown>, DomainFailure>> {
  if (!isOwningOwner(actor, ownerId)) {
    return err(Failures.forbidden());
  }
  if (input.name.length === 0) {
    return err(Failures.validation("Name is required."));
  }
  if (!isValidSpecies(input.species)) {
    return err(Failures.validation("Species must be dog or cat."));
  }
  if (!isValidSex(input.sex)) {
    return err(Failures.validation("Sex is invalid."));
  }
  if (
    input.dateOfBirth !== undefined &&
    input.dateOfBirth !== null &&
    !isValidDateOfBirth(input.dateOfBirth)
  ) {
    return err(Failures.validation("Date of birth is invalid."));
  }

  const owner = await deps.store.owners.findById(ownerId);
  if (owner === null || !owner.active) {
    return err(Failures.notFound("Owner was not found or is deactivated."));
  }

  const pet = await deps.store.pets.insert({
    id: deps.ids.next(),
    ownerId,
    name: input.name,
    species: input.species,
    sex: input.sex,
    breed: input.breed ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    photo: input.photo ?? null,
  });

  return ok(petWire(pet));
}

export async function getPet(
  deps: UseCaseDeps,
  actor: Actor | null,
  petId: string,
): Promise<Result<Record<string, unknown>, DomainFailure>> {
  const pet = await deps.store.pets.findById(petId);
  if (pet === null) {
    return err(Failures.notFound());
  }

  const allowed =
    isOwningOwner(actor, pet.ownerId) || isPlatformService(actor);
  if (!allowed) {
    return err(Failures.forbidden());
  }

  return ok(petWire(pet));
}

export async function updatePet(
  deps: UseCaseDeps,
  actor: Actor | null,
  petId: string,
  input: UpdatePetInput,
): Promise<Result<Record<string, unknown>, DomainFailure>> {
  const pet = await deps.store.pets.findById(petId);
  if (pet === null) {
    return err(Failures.notFound());
  }
  if (!isOwningOwner(actor, pet.ownerId)) {
    return err(Failures.forbidden());
  }
  if (!pet.active) {
    return err(Failures.conflict("A deactivated Pet cannot be updated."));
  }

  if (input.name !== undefined && input.name.length === 0) {
    return err(Failures.validation("Name is invalid."));
  }
  if (input.species !== undefined && !isValidSpecies(input.species)) {
    return err(Failures.validation("Species must be dog or cat."));
  }
  if (input.sex !== undefined && !isValidSex(input.sex)) {
    return err(Failures.validation("Sex is invalid."));
  }
  if (
    input.dateOfBirth !== undefined &&
    input.dateOfBirth !== null &&
    !isValidDateOfBirth(input.dateOfBirth)
  ) {
    return err(Failures.validation("Date of birth is invalid."));
  }

  const updated = await deps.store.pets.update(petId, {
    name: input.name,
    species:
      input.species !== undefined && isValidSpecies(input.species)
        ? input.species
        : undefined,
    sex:
      input.sex !== undefined && isValidSex(input.sex) ? input.sex : undefined,
    breed: input.breed,
    dateOfBirth: input.dateOfBirth,
    photo: input.photo,
  });
  if (updated === null) {
    return err(Failures.notFound());
  }

  return ok(petWire(updated));
}

export async function deactivatePet(
  deps: UseCaseDeps,
  actor: Actor | null,
  petId: string,
): Promise<Result<void, DomainFailure>> {
  const pet = await deps.store.pets.findById(petId);
  if (pet === null) {
    return err(Failures.notFound());
  }
  if (!isOwningOwner(actor, pet.ownerId)) {
    return err(Failures.forbidden());
  }
  if (!pet.active) {
    return err(Failures.alreadyDeactivated());
  }

  await deps.store.pets.deactivate(petId);
  return ok(undefined);
}

export async function listPetsForOwner(
  deps: UseCaseDeps,
  actor: Actor | null,
  ownerId: string,
  status: "active" | "all" = "active",
): Promise<
  Result<{ items: Array<Record<string, unknown> | PetSummary> }, DomainFailure>
> {
  if (!isOwnerOrPlatform(actor)) {
    return err(Failures.forbidden());
  }

  const owner = await deps.store.owners.findById(ownerId);
  if (owner === null) {
    return err(Failures.notFound());
  }

  const selfOrPlatform =
    isOwningOwner(actor, ownerId) || isPlatformService(actor);

  if (!selfOrPlatform) {
    if (owner.petListVisibility !== "public") {
      return err(Failures.forbidden());
    }
    const pets = await deps.store.pets.listByOwnerId(ownerId, {
      includeDeactivated: false,
    });
    return ok({ items: pets.filter((p) => p.active).map(toPetSummary) });
  }

  const pets = await deps.store.pets.listByOwnerId(ownerId, {
    includeDeactivated: status === "all",
  });
  return ok({
    items: pets.map((pet) => petWire(pet)),
  });
}

export async function getPetSummary(
  deps: UseCaseDeps,
  actor: Actor | null,
  petId: string,
): Promise<Result<PetSummary, DomainFailure>> {
  // Pet's Owner and platform services must not use this route.
  if (!isAnyOwner(actor) || isPlatformService(actor)) {
    return err(Failures.petSummaryUnavailable());
  }

  const pet = await deps.store.pets.findById(petId);
  if (pet === null || !pet.active) {
    return err(Failures.petSummaryUnavailable());
  }

  if (isOwningOwner(actor, pet.ownerId)) {
    return err(Failures.petSummaryUnavailable());
  }

  if (!isOtherOwner(actor, pet.ownerId)) {
    return err(Failures.petSummaryUnavailable());
  }

  const owner = await deps.store.owners.findById(pet.ownerId);
  if (owner === null || owner.petListVisibility !== "public") {
    return err(Failures.petSummaryUnavailable());
  }

  return ok(toPetSummary(pet));
}

export async function checkPetOwnership(
  deps: UseCaseDeps,
  actor: Actor | null,
  petId: string,
  ownerId: string,
): Promise<Result<{ isOwner: boolean }, DomainFailure>> {
  if (!isPlatformService(actor)) {
    return err(Failures.forbidden());
  }

  const owner = await deps.store.owners.findById(ownerId);
  const pet = await deps.store.pets.findById(petId);
  if (owner === null || pet === null) {
    return err(Failures.notFound());
  }

  return ok({ isOwner: pet.ownerId === ownerId });
}
