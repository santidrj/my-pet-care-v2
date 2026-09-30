---
status: accepted
---

# OpenAPI specs are the source of truth for cross-service contracts

The OpenAPI 3.1 documents in `postman/specs/<service>/openapi.yaml` are the authoritative REST contract for **Owner & Pet Manager**, **Pet Health Service**, **Activity Manager**, and **Authentication Service**. Service code must match them. Each service keeps hand-written Zod schemas for request and response validation (ADR-0007). `@fastify/swagger` generates that service's OpenAPI document from those schemas, and CI fails when `oasdiff` finds a difference from the committed spec. A service gets its spec before its routes are implemented. This replaces the argument in ADR-0003 that a shared TypeScript contracts package keeps the synchronous contracts from ADR-0002 aligned.

We made this decision during the 2026-09 stack review (`docs/research/backend-stack-review-2026-09.md`). At that point the shared `packages/contracts` package was 108 lines, mostly Problem Details constants, and specs already existed for three of the four services. Keeping the contract in a language-neutral document means a later change of language or framework does not have to re-create it.

**Considered options.** Keep the shared TypeScript package as the source of truth and generate specs from it: this ties the contract to one language, and the specs were already ahead of the package. Generate Zod schemas from the specs: this makes the spec the literal source, but we have not verified that codegen tools handle Zod 4 with the specs' OpenAPI 3.1 `oneOf`/`discriminator` usage. We will reconsider if drift keeps happening. Consumer-driven contract tests (Pact): more machinery than four services in one repo need once specs are diffed in CI.

**Consequences.** A contract change starts in the spec, and code and spec change in the same commit. `packages/contracts` stays as shared runtime code (Problem Details shapes and `urn:my-pet-care:*` type constants) rather than the contract of record. Pet Health Service needs a spec before implementation work. The Postman collections keep testing the running services against the same specs.
