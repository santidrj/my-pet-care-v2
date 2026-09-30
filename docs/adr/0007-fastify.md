---
status: accepted
---

# Fastify for all backend services

**Owner & Pet Manager**, **Pet Health Service**, **Activity Manager**, and **Authentication Service** each expose their REST API with Fastify. Routes map onto the resources in the requirements. A synchronous call, such as an ownership check, an activity-duration sync, or a password-hash read, stays visible in the handler.

We considered NestJS, Express, and Hono. NestJS provides dependency injection and modules that mirror each service’s glossary, with more boilerplate than these four processes need. Express is widely known and has a weaker TypeScript story. Hono is lighter and has a smaller plugin ecosystem for PostgreSQL-backed services. Fastify keeps the REST surface from ADR-0004 explicit without that machinery.

**Consequences.** Each service is a Fastify process. Request and response bodies are validated with Zod schemas in the shared contract package (`@fastify/type-provider-zod`). Fastify does not remove the need to validate at the process boundary (ADR-0003, ADR-0004).

**Re-reviewed 2026-09-30.** Fastify is reaffirmed against Hono, NestJS 12, Express 5, Elysia, and AdonisJS (`docs/research/backend-stack-review-2026-09.md`). Hono came closest. It fell behind on ecosystem (pino logging, rate limiting, and Problem Details are third-party or hand-built) and on its security-advisory record. NestJS 12 now supports Zod natively but still brings the DI/module layer rejected above. Two follow-ups: use the official `@fastify/type-provider-zod` instead of the community `fastify-type-provider-zod`, and upgrade to Fastify 6 once it is stable. OpenAPI generated with `@fastify/swagger` is checked against the committed specs (ADR-0021).
