---
status: accepted
---

# Authentication Service issues Owner Bearer JWTs

Every call to **Owner & Pet Manager**, **Pet Health Service**, and **Activity Manager** carries a Bearer JWT, except resolution of an external Share link. Each Fastify service verifies the signature with `jose`. The **Authentication Service** in this repo signs Owner tokens. This supersedes ADR-0008, which left login and token issuing outside the repo.

The claims name the actor. An Owner call carries that Owner’s id. A platform call carries which service is calling: Owner & Pet Manager, Pet Health Service, Activity Manager, or the Community collaborator. The Authentication Service issues Owner tokens only. It does not issue platform-service tokens. An external Share link stays a capability URL and does not use a JWT.

We considered keeping the signer outside the repo. The other services already depend on an Owner id in a signed token, and the signer has to verify Argon2id hashes stored by Owner & Pet Manager (ADR-0012). An external identity provider would still need a private channel to those hashes. A raw owner-id header and mTLS stay rejected, as in ADR-0008: a header is spoofable, and mTLS is more machinery than v1 needs once the signature is checked.

**Consequences.** A missing or invalid token fails the call. Owner & Pet Manager, Pet Health Service, and Activity Manager do not implement login. They verify the signature locally and do not ask the Authentication Service on each call, so an access token already issued stays valid until it expires. Password storage for Owner creation stays in Owner & Pet Manager.
