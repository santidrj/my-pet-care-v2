---
status: accepted
---

# PostgreSQL, one database per service

**Owner & Pet Manager**, **Pet Health Service**, **Activity Manager**, and **Authentication Service** each use their own PostgreSQL database. There are no shared tables. ADR-0001 already gives each service its own store; this decision picks the engine.

We considered MongoDB, SQLite, and MySQL. The data is relational: username and email stay unique across deactivated Owners, a Pet has one Owner, and a Meal and its calories-consumed Health metric are written in one local operation. Those rules belong in database constraints. A JSON column holds a bounded GPS route and an opaque photo reference. MongoDB would push uniqueness and foreign keys into application code. SQLite is a weak fit for four processes doing concurrent writes and synchronous calls. MySQL can express the constraints; PostgreSQL is the engine we standardize on for JSON columns and for those identity rules.

**Consequences.** A local transaction stays inside one service’s database. Cross-service work stays synchronous HTTP, as in ADR-0002, and is not a distributed transaction. TypeScript queries PostgreSQL through Drizzle (ADR-0006). Local development runs PostgreSQL 18 in Docker Compose: one server, four databases. PostgreSQL 18 is the current stable major; PostgreSQL 19 was still in beta.
