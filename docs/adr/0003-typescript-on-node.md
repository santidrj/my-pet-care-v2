---
status: accepted
---

# TypeScript on Node.js for all backend services

**Owner & Pet Manager**, **Pet Health Service**, **Activity Manager**, and **Authentication Service** are implemented in TypeScript on Node.js, in this monorepo. One language covers all four services.

We considered Go and Kotlin on the JVM. Go gives smaller processes and a simpler runtime. Kotlin encodes more of the glossary (Share audiences, Activity types, Deactivation versus hard delete) directly in the type system. Both lost for v1 because the hard part of this backend is the synchronous contracts in ADR-0002, and a shared TypeScript package keeps those contracts aligned without generating clients across a language boundary. Read and write latency budgets are I/O-bound (p95 under 500 ms and 2 s), so they do not require Go’s speed or a JVM.

**Consequences.** Each service runs as its own Node.js 24 process. Node.js 24 is Active LTS as of this decision; Node.js 26 was still Current. The four service packages and the shared contracts package are ECMAScript modules (`"type": "module"`, TypeScript `module` and `moduleResolution` set to `nodenext`). Types are erased at runtime, so every process boundary still needs validation. The wire protocol, HTTP framework, and datastore are separate decisions.

**Re-reviewed 2026-09-30.** TypeScript on Node.js 24 is kept, but for a different reason than the one given above. Go, Kotlin (Ktor and Spring Boot), .NET, Python/FastAPI, and Rust/Axum were compared (`docs/research/backend-stack-review-2026-09.md`). Kotlin/Ktor came closest: sealed classes model the glossary well, and the maintainer is fluent in Kotlin. It lost on the cost of a full rewrite, the lack of EdDSA support in Ktor's JWT stack (ADR-0016), and less mature OpenAPI tooling. The shared-contracts argument no longer applies, because cross-service contracts now live in the OpenAPI specs (ADR-0021). TypeScript stays because no alternative beat it by enough to justify a rewrite.
