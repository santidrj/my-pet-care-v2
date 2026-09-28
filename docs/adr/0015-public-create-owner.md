---
status: accepted
---

# Public Create Owner without a Bearer JWT

`POST /owners` on **Owner & Pet Manager** is the one Owner-facing call that does not require a Bearer JWT. An Owner must exist before the Authentication Service can issue a token (ADR-0016), so registration cannot demand a token the caller does not have yet. Every other Owner & Pet Manager route still requires a verified Bearer JWT; a missing or invalid token fails those calls.

We considered requiring a platform-service token to create Owners, and moving signup into the Authentication Service. A platform token would only move the bootstrap problem (something must still mint the first credential before any Owner exists), and Creating an Owner stays with Owner & Pet Manager (ADR-0001). Auth’s requirements keep signup out of scope. Platform-service tokens are issued by Authentication Service for service-to-service calls (ADR-0016), not for public registration.

**Consequences.** Rate limiting and abuse controls for public registration are a separate concern from token verification. Password strength and uniqueness rules on create are unchanged (ADR-0012). The HTTP mapping is in `docs/requirements/owner-pet-manager-api.md`.
