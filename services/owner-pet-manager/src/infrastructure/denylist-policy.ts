import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../domain/validation.js";
import type { PasswordPolicy } from "../application/ports.js";

/** Local common-password denylist (exact match, case-sensitive as stored). */
export const COMMON_PASSWORDS = new Set([
  "password",
  "Password1",
  "Password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "qwerty123",
  "abc12345",
  "letmein1",
  "welcome1",
  "monkey12",
  "dragon12",
  "master12",
  "login123",
  "admin123",
  "passw0rd",
  "Passw0rd",
  "iloveyou",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "trustno1",
  "whatever",
  "1q2w3e4r",
  "qwerty12",
  "asdfghjk",
  "zxcvbnm1",
  "password1",
  "password12",
  "Password!",
  "P@ssw0rd",
  "Aa123456",
  "changeme",
  "letmein!",
  "welcome!",
  "hello123",
  "test1234",
  "testing1",
  "secret12",
  "shadow12",
  "michael1",
  "jennifer",
  "computer",
  "internet",
  "starwars",
  "pokemon1",
  "minecraft",
]);

export function createDenylistPasswordPolicy(
  denylist: ReadonlySet<string> = COMMON_PASSWORDS,
): PasswordPolicy {
  return {
    validate(password: string): string | undefined {
      if (password.length < PASSWORD_MIN_LENGTH) {
        return "Password must be at least 8 characters.";
      }
      if (password.length > PASSWORD_MAX_LENGTH) {
        return "Password must be at most 128 characters.";
      }
      if (denylist.has(password)) {
        return "Password is too common.";
      }
      return undefined;
    },
  };
}
