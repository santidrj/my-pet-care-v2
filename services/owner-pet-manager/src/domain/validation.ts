import type { Sex, Species } from "./types.js";

const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function isValidUsername(value: string): boolean {
  return value.length > 0 && USERNAME_PATTERN.test(value);
}

export function isValidEmail(value: string): boolean {
  if (value.includes(" ") || value.split("@").length !== 2) {
    return false;
  }
  return EMAIL_PATTERN.test(value);
}

/** Same identifier rules as Authentication Service: email if it looks like email, else username. */
export function classifyIdentifier(
  identifier: string,
): { kind: "email"; value: string } | { kind: "username"; value: string } | null {
  if (identifier.length === 0) {
    return null;
  }
  if (identifier.includes("@")) {
    if (!isValidEmail(identifier)) {
      return null;
    }
    return { kind: "email", value: identifier };
  }
  if (!isValidUsername(identifier)) {
    return null;
  }
  return { kind: "username", value: identifier };
}

export function isValidSpecies(value: string): value is Species {
  return value === "dog" || value === "cat";
}

export function isValidSex(value: string): value is Sex {
  return value === "male" || value === "female" || value === "unknown";
}

export function isValidDateOfBirth(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase();
}
