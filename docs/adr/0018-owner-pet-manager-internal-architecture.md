---
status: accepted
---

# Owner & Pet Manager internal architecture

**Owner & Pet Manager** is implemented as a thin ports-and-adapters process: Fastify HTTP adapters validate and map; application use cases authorize and orchestrate; Owner and Pet are separate domain aggregates; Drizzle/PostgreSQL and outbound HTTP clients sit behind ports. We chose this over putting rules in route handlers (hard to test the authz and indistinguishability matrix) and over Nest-style modules (rejected for these services in ADR-0007). The shared **platform-service authenticator** (ADR-0016) establishes the inbound actor and obtains outbound platform JWTs; it does not authorize routes. Per-route authorization lives in use cases. Use cases return typed success or domain-failure results; the HTTP adapter maps them to RFC 9457 Problem Details, collapsing distinct domain codes to one wire shape where requirements demand indistinguishability (for example Get Pet Summary).

Owner and Pet stay separate write aggregates (Pet carries `ownerId`). Cascade Deactivation is use-case orchestration in one local transaction after a fail-closed Community-owner check: deactivate that Owner’s active Pets, then the Owner. After commit, refresh-token revoke (Authentication Service) and Community end-belonging/admin notify are best-effort and must not undo Deactivation (ADR-0002). The same revoke-after-commit pattern applies on password change. Until the real Community collaborator exists, local and CI use a stub that implements check and notify; application code never skips the check. Sibling deliverables: the authenticator package and that Community stub; OPM does not issue JWTs or implement Auth client-credentials.

Passwords: Argon2id as in ADR-0012; reject via a local common-password denylist before hashing; maximum length 128 characters; no network breach-lookup on the write path. Owner and Pet ids are application-generated UUID v7 values stored as Postgres `uuid`.

**Considered options.** Nested Pets under one Owner write aggregate—rejected because Pet is a flat resource and other services look Pets up by id. Static or per-service platform JWT signing in OPM—rejected by ADR-0016. Skipping the Community-owner check until Community exists—rejected; fail-closed with a stub preserves the FR. Have I Been Pwned on create/update—rejected for v1 write latency and failure modes. Throwing Problem Details from use cases—rejected so domain tests stay HTTP-free.

**Consequences.** OPM depends on the authenticator package and on Community (stub or real) and Authentication Service for outbound calls. Diagram: `docs/architecture/owner-pet-manager.mmd`. Testing: domain/use-case tests with fakes, Postgres constraint/TX tests, HTTP contract tests with test keys—not a multi-service E2E gate for OPM alone.
