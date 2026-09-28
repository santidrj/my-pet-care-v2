---
status: accepted
---

# Problem Details type URNs

Every Problem Details `type` from **Owner & Pet Manager**, **Pet Health Service**, **Activity Manager**, and **Authentication Service** is a stable URN. ADR-0013 copies that value into `problemType`, so two failures of different kinds must not share a type. The skeleton has three:

- `urn:my-pet-care:not-found` — HTTP `404`, title `Not Found`, detail `No route matches this request.`
- `urn:my-pet-care:unauthorized` — HTTP `401`, title `Unauthorized`, detail `Authentication is required to access this resource.`
- `urn:my-pet-care:internal-error` — HTTP `500`, title `Internal Server Error`, detail `The service failed to handle this request.`

All three details are fixed sentences. They carry no path, id, or message from the failure. Unauthorized is the uniform inbound denial from the **platform-service authenticator** when a Bearer JWT is missing, invalid, or expired (or fails claim/`aud`/`iss` checks); the body must not reveal which check failed. A later domain error gets its own URN beside these three. The Zod schema in `packages/contracts` still checks only the shape from ADR-0010.

We considered RFC 9457’s default `about:blank`. It avoids inventing identifiers, and it makes every failure identical in `problemType`. An `https` URL would need a documentation host this platform does not have. A URN needs no host and stays stable across the four services. We considered distinct unauthorized types per failure reason (missing vs expired vs bad signature); that would help attackers and contradict the authenticator’s non-leaky contract.

**Consequences.** Callers and service logs distinguish a missing route, an auth failure, and an unexpected failure by `type`. Success responses stay ordinary JSON, including liveness `{ "status": "ok" }`.
