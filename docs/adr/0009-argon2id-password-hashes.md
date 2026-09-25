---
status: accepted
---

# Argon2id for Owner password hashes

**Owner & Pet Manager** stores Owner passwords as Argon2id hashes. Each password gets its own salt, and the parameters travel in the hash string. The configuration is the OWASP minimum: 19 MiB of memory, 2 iterations, and parallelism 1. That cost sits inside the 2-second write budget for creating or updating an Owner.

Login and credential checks stay outside this service. The authentication service that will verify these hashes is a separate discussion. Owner & Pet Manager only hashes on create and update, never returns the password, and never stores it in plaintext.

We considered bcrypt, scrypt, and PBKDF2. bcrypt is the legacy choice and truncates at 72 bytes. scrypt is the fallback when Argon2id is unavailable; it is available on Node.js. PBKDF2 is for FIPS-140, which these requirements do not require. Guidance: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

**Consequences.** Existing hashes cannot be swapped to another algorithm without a rehash path. The authentication service must understand this hash string when it is defined. Password complexity and encryption at rest stay out of scope, as in the Owner & Pet Manager requirements.
