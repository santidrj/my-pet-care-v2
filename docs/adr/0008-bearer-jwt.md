---
status: superseded by ADR-0011
---

# Bearer JWTs verified in each service

Every call to **Owner & Pet Manager**, **Pet Health Service**, and **Activity Manager** carries a Bearer JWT, except resolution of an external Share link. Each Fastify service verifies the signature with `jose`. Login and token issuing stay outside this repo. The service reads the claims and applies its own authorization rules.

The claims name the actor. An Owner call carries that Owner’s id. A platform call carries which service is calling: Owner & Pet Manager, Pet Health Service, Activity Manager, or the Community collaborator. That is how a service tells an Owner-facing call apart from a trusted service call, as the requirements require. An external Share link stays a capability URL and does not use a JWT.

We considered a raw owner-id header and mTLS. A header is spoofable by any client that can reach the port, which breaks Owner data isolation. mTLS authenticates processes and is more machinery than v1 needs once the token signature is checked.

**Consequences.** A missing or invalid token fails the call. The services do not implement login. The identity provider that signs tokens is not part of this repo. Password storage for Owner creation stays in Owner & Pet Manager and is a separate decision.
