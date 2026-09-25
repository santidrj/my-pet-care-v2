---
status: accepted
---

# Problem Details for error responses

Every error from **Owner & Pet Manager**, **Pet Health Service**, and **Activity Manager** uses [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html) as `application/problem+json`. The body carries `type`, `title`, `status`, and `detail`. One Zod schema in `packages/contracts` defines that shape for client calls and for service-to-service calls.

We considered a custom `{ error, code }` object and JSON:API errors. A private object is shorter and forces every caller to learn a dialect. JSON:API errors assume a document format these services do not use. Problem Details is the shared error contract for the REST APIs in ADR-0004.

**Consequences.** A failed ownership check, weight lookup, or activity-duration sync still fails the operation that needed it (ADR-0002). The caller reads that failure from the Problem Details body. Success responses stay ordinary JSON resources, not Problem Details.
