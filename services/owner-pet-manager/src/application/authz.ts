import type { Actor } from "./ports.js";

export function requireActor(actor: Actor | null | undefined): Actor | null {
  return actor ?? null;
}

export function isOwningOwner(actor: Actor | null, ownerId: string): boolean {
  return actor?.kind === "owner" && actor.ownerId === ownerId;
}

export function isOtherOwner(actor: Actor | null, ownerId: string): boolean {
  return actor?.kind === "owner" && actor.ownerId !== ownerId;
}

export function isAnyOwner(actor: Actor | null): boolean {
  return actor?.kind === "owner";
}

export function isPlatformService(actor: Actor | null): boolean {
  return actor?.kind === "service";
}

export function isAuthService(actor: Actor | null): boolean {
  return actor?.kind === "service" && actor.service === "authentication-service";
}

export function isOwnerOrPlatform(actor: Actor | null): boolean {
  return isAnyOwner(actor) || isPlatformService(actor);
}
