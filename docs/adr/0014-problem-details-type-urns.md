---
status: accepted
---

# Problem Details type URNs

Every Problem Details `type` from **Owner & Pet Manager**, **Pet Health Service**, **Activity Manager**, and **Authentication Service** is a stable URN. ADR-0013 copies that value into `problemType`, so two failures of different kinds must not share a type. The skeleton has two:

- `urn:my-pet-care:not-found` — HTTP `404`, title `Not Found`, detail `No route matches this request.`
- `urn:my-pet-care:internal-error` — HTTP `500`, title `Internal Server Error`, detail `The service failed to handle this request.`

Both details are fixed sentences. They carry no path, id, or message from the failure. A later domain error gets its own URN beside these two. The Zod schema in `packages/contracts` still checks only the shape from ADR-0010.

We considered RFC 9457’s default `about:blank`. It avoids inventing identifiers, and it makes every failure identical in `problemType`. An `https` URL would need a documentation host this platform does not have. A URN needs no host and stays stable across the four services.

**Consequences.** Callers and service logs distinguish a missing route from an unexpected failure by `type`. Success responses stay ordinary JSON, including liveness `{ "status": "ok" }`.
