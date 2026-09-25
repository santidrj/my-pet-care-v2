---
status: accepted
---

# Drizzle ORM for PostgreSQL access

Each service queries its own PostgreSQL database with Drizzle ORM. Schema changes ship as drizzle-kit migrations owned by that service. There is no shared table schema across **Owner & Pet Manager**, **Pet Health Service**, and **Activity Manager**.

We considered Prisma and raw `node-postgres`. Prisma’s generated client is quicker to start and hides more of the SQL. Handwritten SQL keeps full control and drops query-level types. Drizzle keeps the schema in TypeScript and the queries close to SQL, so uniqueness and foreign keys stay visible next to the glossary rules they enforce (for example username and email uniqueness across deactivated Owners, and a Meal with its calories-consumed Health metric in one local transaction).

**Consequences.** Migrations are per database. A query that spans services does not exist; that work is HTTP, per ADR-0002 and ADR-0004. The HTTP framework is a separate decision.
