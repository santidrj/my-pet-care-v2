---
status: accepted
---

# Fastify for all backend services

**Owner & Pet Manager**, **Pet Health Service**, and **Activity Manager** each expose their REST API with Fastify. Routes map onto the resources in the requirements. A synchronous call, such as an ownership check or an activity-duration sync, stays visible in the handler.

We considered NestJS, Express, and Hono. NestJS provides dependency injection and modules that mirror each service’s glossary, with more boilerplate than these three processes need. Express is widely known and has a weaker TypeScript story. Hono is lighter and has a smaller plugin ecosystem for PostgreSQL-backed services. Fastify keeps the REST surface from ADR-0004 explicit without that machinery.

**Consequences.** Each service is a Fastify process. Request and response bodies are validated with Zod schemas in the shared contract package (`fastify-type-provider-zod`). Fastify does not remove the need to validate at the process boundary (ADR-0003, ADR-0004).
