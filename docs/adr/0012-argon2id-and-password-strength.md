---
status: accepted
---

# Argon2id hashes and password strength

**Owner & Pet Manager** stores Owner passwords as Argon2id hashes. Each password gets its own salt, and the parameters travel in the hash string. The configuration is the OWASP minimum: 19 MiB of memory, 2 iterations, and parallelism 1. That cost sits inside the 2-second write budget for creating or updating an Owner. This supersedes ADR-0009, which left password strength out of scope.

The **Authentication Service** verifies these hashes on login. Owner & Pet Manager hashes on create and on password change, never returns the password, and never stores it in plaintext. The hash is readable by the Authentication Service only.

On create and on password change, Owner & Pet Manager rejects a password shorter than 8 characters, accepts at least 64 characters, allows any character including spaces, and rejects commonly used or known-breached passwords. It does not require a mix of letters, digits, or symbols. [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html) and the OWASP guidance below treat required character classes as a source of predictable passwords. Encryption at rest stays out of scope.

We considered bcrypt, scrypt, and PBKDF2. bcrypt is the legacy choice and truncates at 72 bytes. scrypt is the fallback when Argon2id is unavailable; it is available on Node.js. PBKDF2 is for FIPS-140, which these requirements do not require. Guidance: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

**Consequences.** Existing hashes cannot be swapped to another algorithm without a rehash path. The Authentication Service must understand this hash string. Login does not re-check strength. A password that fails the strength rules is rejected when Owner & Pet Manager creates an Owner or changes a password.
