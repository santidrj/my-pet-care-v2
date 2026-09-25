---
status: accepted
---

# REST with JSON over HTTP

Client calls and service-to-service calls use resource-oriented REST with JSON over HTTP. That covers **Owner & Pet Manager**, **Pet Health Service**, **Activity Manager**, and calls to the Community collaborator. The same style applies on both sides of a call.

We considered gRPC, tRPC, and GraphQL. gRPC gives a stricter contract and less latency than the v1 budgets require (p95 reads under 500 ms, writes under 2 s), and it adds a code-generation toolchain beside TypeScript. It stays a candidate for internal calls only if a measured p95 breaks those budgets. tRPC shares types inside this monorepo, then does not serve external Share links or the Community collaborator, which live outside the repo. GraphQL fits a client query that composes a Pet, its Health profile, and its Activities; v1 has no such read, and ownership checks and activity-duration sync are commands. ADR-0002 already requires those calls to finish before the caller is told the write succeeded; REST does that with ordinary HTTP. Events remain out of v1 for the same reason.

Request and response shapes live in a shared TypeScript package. Each service validates them at the process boundary, because TypeScript types are erased at runtime (ADR-0003).

**Consequences.** Synchronous cross-service work is an HTTP request and response. A failed call fails the operation that needed it, as ADR-0002 describes. Each service exposes that API with Fastify (ADR-0007). Error bodies are Problem Details (ADR-0010).
