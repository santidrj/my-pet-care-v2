---
status: accepted
---

# Platform clients are ensured at startup

Each platform service publishes its own **Platform client** to **Authentication Service** when it starts. The call is `PUT /platform-clients/{serviceId}` with that client’s secret, an active flag, and a setup secret. A missing or wrong setup secret does not change a row. There is no list, get, or delete. This replaces deploy-time seeding and a public CRUD API.

Authentication Service writes its own client in-process before it listens. Every other platform service retries the call for up to 30 seconds and then exits. The setup secret is a shared provisioning credential in the environment of Authentication Service and of every platform service. It is not a Platform client secret, it is compared in constant time to that environment value, and it is not stored in Postgres. Whoever holds it can ensure any of the five service ids. A restart sends the service’s current secret and active flag, which is how a disabled client stays disabled and how a replaced secret takes effect. Already-issued platform JWTs remain valid until they expire. When the stored hash already matches the secret and the active flag already matches, the call does not rehash. The call is not rate limited, and a rejected setup secret does not consume a client-credentials failure slot.

The route is not an anonymous write. The authenticator allowlist skips Bearer JWT verification for this route only so the use case can require the setup secret; that package has no second credential scheme. `POST /oauth/token` stays the public grant.

We considered a public CRUD registry, an unauthenticated create-if-absent, and treating a private network path as sufficient. CRUD adds read and delete that startup does not need. An unauthenticated create lets any reachable caller take a service id. A private network is not a substitute for a credential. mTLS stays out of scope. A platform JWT cannot protect the first ensure, because the client row is what makes the token grant succeed.

**Consequences.** AUTH-FR-008. The platform-service authenticator performs the HTTP ensure for every service except Authentication Service’s own row. Service id is unique. Diagram: `docs/architecture/authentication-service.mmd`.
