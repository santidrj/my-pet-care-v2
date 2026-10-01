import { Failures, type DomainFailure } from "../domain/failures.js";
import {
  toOwnerPublic,
  type Owner,
  type OwnerCredentials,
  type OwnerPublic,
  type PetListVisibility,
} from "../domain/types.js";
import {
  classifyIdentifier,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
} from "../domain/validation.js";
import {
  isAuthService,
  isOwningOwner,
  isOwnerOrPlatform,
  isPlatformService,
} from "./authz.js";
import type { Actor, UseCaseDeps } from "./ports.js";
import { mapOwnerUniqueViolation } from "../infrastructure/db-errors.js";
import { err, ok, type Result } from "./result.js";

export type CreateOwnerInput = {
  username: string;
  email: string;
  password: string;
  photo?: string | null;
};

export async function createOwner(
  deps: UseCaseDeps,
  input: CreateOwnerInput,
): Promise<Result<OwnerPublic, DomainFailure>> {
  if (!isValidUsername(input.username)) {
    return err(Failures.validation("Username is invalid."));
  }
  if (!isValidEmail(input.email)) {
    return err(Failures.validation("Email is invalid."));
  }
  const passwordError = deps.passwordPolicy.validate(input.password);
  if (passwordError !== undefined) {
    return err(Failures.validation(passwordError));
  }

  const existingUsername = await deps.store.owners.findByUsername(input.username);
  if (existingUsername !== null) {
    return err(Failures.usernameTaken());
  }
  const existingEmail = await deps.store.owners.findByEmailIgnoreCase(input.email);
  if (existingEmail !== null) {
    return err(Failures.emailTaken());
  }

  const passwordHash = await deps.passwordHasher.hash(input.password);
  try {
    const owner = await deps.store.owners.insert({
      id: deps.ids.next(),
      username: input.username,
      email: input.email,
      passwordHash,
      photo: input.photo ?? null,
    });

    return ok(toOwnerPublic(owner, true));
  } catch (error) {
    const mapped = mapOwnerUniqueViolation(error);
    if (mapped !== null) {
      return err(mapped);
    }
    throw error;
  }
}

export async function getOwnerById(
  deps: UseCaseDeps,
  actor: Actor | null,
  ownerId: string,
): Promise<Result<OwnerPublic, DomainFailure>> {
  if (!isOwnerOrPlatform(actor)) {
    return err(Failures.forbidden());
  }

  const owner = await deps.store.owners.findById(ownerId);
  if (owner === null) {
    return err(Failures.notFound());
  }

  const includeEmail =
    isPlatformService(actor) || isOwningOwner(actor, owner.id);
  return ok(toOwnerPublic(owner, includeEmail));
}

export async function getOwnerByUsername(
  deps: UseCaseDeps,
  actor: Actor | null,
  username: string,
): Promise<Result<OwnerPublic, DomainFailure>> {
  if (!isOwnerOrPlatform(actor)) {
    return err(Failures.forbidden());
  }
  if (!isValidUsername(username)) {
    return err(Failures.validation("Username is invalid."));
  }

  const owner = await deps.store.owners.findByUsername(username);
  if (owner === null) {
    return err(Failures.notFound());
  }

  const includeEmail =
    isPlatformService(actor) || isOwningOwner(actor, owner.id);
  return ok(toOwnerPublic(owner, includeEmail));
}

export type UpdateOwnerInput = {
  username?: string;
  email?: string;
  password?: string;
  photo?: string | null;
};

export async function updateOwner(
  deps: UseCaseDeps,
  actor: Actor | null,
  ownerId: string,
  input: UpdateOwnerInput,
): Promise<Result<OwnerPublic, DomainFailure>> {
  if (!isOwningOwner(actor, ownerId)) {
    return err(Failures.forbidden());
  }

  const owner = await deps.store.owners.findById(ownerId);
  if (owner === null) {
    return err(Failures.notFound());
  }
  if (!owner.active) {
    return err(Failures.ownerDeactivated());
  }

  if (input.username !== undefined && !isValidUsername(input.username)) {
    return err(Failures.validation("Username is invalid."));
  }
  if (input.email !== undefined && !isValidEmail(input.email)) {
    return err(Failures.validation("Email is invalid."));
  }
  if (input.password !== undefined) {
    const passwordError = deps.passwordPolicy.validate(input.password);
    if (passwordError !== undefined) {
      return err(Failures.validation(passwordError));
    }
  }

  if (input.username !== undefined && input.username !== owner.username) {
    const taken = await deps.store.owners.findByUsername(input.username);
    if (taken !== null) {
      return err(Failures.usernameTaken());
    }
  }
  if (input.email !== undefined && normalizeEmail(input.email) !== normalizeEmail(owner.email)) {
    const taken = await deps.store.owners.findByEmailIgnoreCase(input.email);
    if (taken !== null) {
      return err(Failures.emailTaken());
    }
  }

  let passwordHash: string | undefined;
  if (input.password !== undefined) {
    passwordHash = await deps.passwordHasher.hash(input.password);
  }

  let updated;
  try {
    updated = await deps.store.owners.update(ownerId, {
      username: input.username,
      email: input.email,
      passwordHash,
      photo: input.photo,
    });
  } catch (error) {
    const mapped = mapOwnerUniqueViolation(error);
    if (mapped !== null) {
      return err(mapped);
    }
    throw error;
  }
  if (updated === null) {
    return err(Failures.notFound());
  }

  if (passwordHash !== undefined) {
    try {
      await deps.authRevocation.revoke(ownerId, "passwordChange");
    } catch {
      // best-effort
    }
  }

  return ok(toOwnerPublic(updated, true));
}

export async function deactivateOwner(
  deps: UseCaseDeps,
  actor: Actor | null,
  ownerId: string,
): Promise<Result<void, DomainFailure>> {
  if (!isOwningOwner(actor, ownerId)) {
    return err(Failures.forbidden());
  }

  const owner = await deps.store.owners.findById(ownerId);
  if (owner === null) {
    return err(Failures.notFound());
  }
  if (!owner.active) {
    return err(Failures.ownerAlreadyDeactivated());
  }

  let isCommunityOwner: boolean;
  try {
    isCommunityOwner = await deps.community.isCommunityOwner(ownerId);
  } catch {
    return err(Failures.communityCheckUnavailable());
  }
  if (isCommunityOwner) {
    return err(Failures.communityOwner());
  }

  await deps.store.withTransaction(async (tx) => {
    await tx.pets.deactivateActiveByOwnerId(ownerId);
    await tx.owners.deactivate(ownerId);
  });

  try {
    await deps.authRevocation.revoke(ownerId, "deactivation");
  } catch {
    // best-effort
  }
  try {
    await deps.community.endBelonging(ownerId);
  } catch {
    // best-effort
  }

  return ok(undefined);
}

export async function setPetListVisibility(
  deps: UseCaseDeps,
  actor: Actor | null,
  ownerId: string,
  visibility: PetListVisibility,
): Promise<Result<{ ownerId: string; petListVisibility: PetListVisibility }, DomainFailure>> {
  if (!isOwningOwner(actor, ownerId)) {
    return err(Failures.forbidden());
  }
  if (visibility !== "public" && visibility !== "private") {
    return err(Failures.validation("Pet list visibility is invalid."));
  }

  const owner = await deps.store.owners.findById(ownerId);
  if (owner === null) {
    return err(Failures.notFound());
  }
  if (!owner.active) {
    return err(Failures.ownerDeactivated());
  }

  const updated = await deps.store.owners.setPetListVisibility(ownerId, visibility);
  if (updated === null) {
    return err(Failures.notFound());
  }

  return ok({
    ownerId: updated.id,
    petListVisibility: updated.petListVisibility,
  });
}

export async function getCredentialsByIdentifier(
  deps: UseCaseDeps,
  actor: Actor | null,
  identifier: string,
): Promise<Result<OwnerCredentials, DomainFailure>> {
  if (!isAuthService(actor)) {
    return err(Failures.forbidden());
  }

  const classified = classifyIdentifier(identifier);
  if (classified === null) {
    return err(Failures.validation("Identifier is invalid."));
  }

  let owner: Owner | null;
  if (classified.kind === "email") {
    owner = await deps.store.owners.findByEmailIgnoreCase(classified.value);
  } else {
    owner = await deps.store.owners.findByUsername(classified.value);
  }
  if (owner === null) {
    return err(Failures.notFound());
  }

  return ok({
    ownerId: owner.id,
    passwordHash: owner.passwordHash,
    active: owner.active,
  });
}

export async function getCredentialsByOwnerId(
  deps: UseCaseDeps,
  actor: Actor | null,
  ownerId: string,
): Promise<Result<OwnerCredentials, DomainFailure>> {
  if (!isAuthService(actor)) {
    return err(Failures.forbidden());
  }

  const owner = await deps.store.owners.findById(ownerId);
  if (owner === null) {
    return err(Failures.notFound());
  }

  return ok({
    ownerId: owner.id,
    passwordHash: owner.passwordHash,
    active: owner.active,
  });
}

export async function setPasswordFromAuth(
  deps: UseCaseDeps,
  actor: Actor | null,
  ownerId: string,
  password: string,
): Promise<Result<{ ownerId: string }, DomainFailure>> {
  if (!isAuthService(actor)) {
    return err(Failures.forbidden());
  }

  const passwordError = deps.passwordPolicy.validate(password);
  if (passwordError !== undefined) {
    return err(Failures.validation(passwordError));
  }

  const owner = await deps.store.owners.findById(ownerId);
  if (owner === null) {
    return err(Failures.notFound());
  }
  if (!owner.active) {
    return err(Failures.ownerDeactivated());
  }

  const passwordHash = await deps.passwordHasher.hash(password);
  const updated = await deps.store.owners.update(ownerId, { passwordHash });
  if (updated === null) {
    return err(Failures.notFound());
  }

  try {
    await deps.authRevocation.revoke(ownerId, "passwordChange");
  } catch {
    // best-effort
  }

  return ok({ ownerId });
}
