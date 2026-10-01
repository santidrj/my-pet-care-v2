const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidUsername(value: string): boolean {
  return value.length > 0 && USERNAME_PATTERN.test(value);
}

export function isValidEmail(value: string): boolean {
  if (value.includes(" ") || value.split("@").length !== 2) {
    return false;
  }
  return EMAIL_PATTERN.test(value);
}

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

export function rateLimitSubject(identifier: string): string | null {
  const classified = classifyIdentifier(identifier);
  if (classified === null) {
    return null;
  }
  if (classified.kind === "email") {
    return classified.value.toLowerCase();
  }
  return classified.value;
}
