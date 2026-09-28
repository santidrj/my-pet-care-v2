# Platform-service authenticator — Requirements

## Purpose

This document defines the requirements for the **platform-service authenticator**: the shared module platform services use to verify inbound Bearer JWTs and to obtain and present platform-service credentials on outbound calls. It states what the module must do so developers and agents can implement and verify behavior. Owner login stays in Authentication Service; per-route authorization stays in each service’s functional requirements.

## Goals

- Every platform service tells an Owner call apart from a trusted platform-service call the same way.
- A service can call another with a credential that proves which platform service is calling.
- Handlers see a trusted actor (Owner id or calling service) without each service inventing its own JWT or crypto wiring.

## Actors

| Actor | Description |
| ----- | ----------- |
| **Owner** | Calls platform APIs with an Owner Bearer JWT; the authenticator verifies it and exposes that Owner’s id. |
| **Platform service** | A backend service (Owner & Pet Manager, Pet Health Service, Activity Manager, Authentication Service, or Community collaborator) that verifies inbound tokens and presents its own platform credential on outbound calls. |
| **Authentication Service** | Signs Owner access tokens and issues platform-service access tokens (client-credentials). It is both the central issuer and a consumer of this authenticator when it calls other services. |
| **External link holder** | Unaffected for capability-URL Share resolution (no JWT). Public routes (for example Create Owner) bypass this module. |

## Scope

### In scope

- Verifying inbound Auth-signed Bearer JWTs (Owner or platform-service claim shape)
- Obtaining and caching a platform-service access token from Authentication Service (client-credentials) and attaching it on outbound synchronous calls
- An explicit bypass allowlist for public routes
- Failing closed when a token is missing, invalid, or expired, or when a platform token cannot be obtained
- Exposing a trusted actor to handlers without enforcing service authorization policy

### Out of scope

- Owner login, refresh, logout, and password reset (Authentication Service functional requirements)
- Per-route authorization or an RBAC policy engine (each service’s functional requirements)
- An access-token denylist or instant revoke of already-issued access tokens
- mTLS, SPIFFE/SPIRE, or mesh identity as the service-to-service mechanism
- Where Owner-facing clients store tokens
- Secret-rotation UX or automated rotation orchestration (deploy-time config reload of new secrets is enough for v1)
- Impersonation tokens (a platform service acting as an Owner)
- Expanding the Community collaborator beyond reserving its claim id in the vocabulary

## Business / domain rules

- Inbound verification uses Authentication Service signing keys locally (`jose`). The authenticator does not call Authentication Service on every inbound request.
- Only Authentication Service may issue Owner and platform-service access tokens.
- A platform client may receive a token only for its own configured service id. It must not obtain a token that names another platform service.
- Platform client secrets are known only to that service and Authentication Service. They are never exposed to Owners or public clients.
- Owner id (`ownerId`) and platform-service (`service`) claims are mutually exclusive on one JWT. An accepted token has exactly one actor shape.
- Owner JWTs must carry `ownerId`, `aud` = `my-pet-care`, and `iss` = `my-pet-care:authentication-service`. Platform-service JWTs must carry `service` (exactly one of `owner-pet-manager`, `pet-health-service`, `activity-manager`, `authentication-service`, `community`), `aud` = `my-pet-care:platform`, and the same `iss`.
- Platform-service JWT claim `service` names exactly one calling service among the allowed ids above.
- There is no refresh token for platform credentials. The authenticator re-requests from Authentication Service when the cached token is expired or near expiry.
- Cached outbound platform tokens are refreshed before expiry (with a skew margin). A peer 401 attributable to expiry triggers one re-fetch and one retry.
- Public allowlisted routes never require a JWT. All other routes fail closed.
- Establishing the actor is not authorizing the operation. Each service’s functional requirements still decide allow or deny.

## Constraints

- The authenticator is a shared library used by Owner & Pet Manager, Pet Health Service, Activity Manager, and Authentication Service (and by the Community collaborator when it exists).
- Access tokens are Bearer JWTs signed only by Authentication Service and verified with `jose` (ADR-0016, which supersedes ADR-0011).
- Outbound cross-service calls stay synchronous (ADR-0002). The authenticator attaches the platform Bearer token on those calls.
- Platform-token obtainment is OAuth2-style client credentials against Authentication Service (`POST /oauth/token` as JSON; ADR-0017). No mTLS in v1.
- Auth failures use Problem Details (ADR-0010 / ADR-0014). Tokens and secrets never appear in service logs (ADR-0013).

## Assumptions

- Authentication Service can expose a client-credentials endpoint and will sign platform JWTs with trust material other services use to verify Owner JWTs (or a documented sibling key set).
- Each platform service can be given a unique service id and secret at deploy time.
- Clock skew between services is small enough that a verification leeway on the order of tens of seconds is enough.
- The Community collaborator will use the same authenticator and service-id scheme when it lands; until then its id is reserved in the claim vocabulary.
- A private network path between platform services is not a substitute for token auth. Tokens are still required.

## Functional requirements

### PSA-FR-001 — Verify inbound Bearer JWT

**Description:** The authenticator verifies an Auth-signed Bearer JWT on inbound requests that are not on the public allowlist and exposes a trusted actor to the handler.

**Acceptance criteria:**

1. A valid Owner JWT (`iss` = `my-pet-care:authentication-service`, `aud` = `my-pet-care`, claim `ownerId`, no `service`) yields a trusted actor that is that Owner’s id.
2. A valid platform-service JWT (`iss` = `my-pet-care:authentication-service`, `aud` = `my-pet-care:platform`, claim `service` set to exactly one allowed service id, no `ownerId`) yields a trusted actor that is that calling service’s id.
3. A missing, invalid, forged, expired, or wrong-`aud`/`iss` JWT fails the request with an unauthorized Problem Details response. The body does not leak which check failed beyond the uniform unauthorized shape.
4. A JWT that carries both `ownerId` and `service`, or neither, is rejected.
5. Verification uses local signature checking with Authentication Service trust material. It does not call Authentication Service per request.

### PSA-FR-002 — Present outbound platform credential

**Description:** When a platform service makes a synchronous call to another platform service, the authenticator obtains (or reuses) a platform-service access token for this service and attaches it as a Bearer token.

**Acceptance criteria:**

1. The outbound call includes `Authorization: Bearer` with a platform-service JWT whose claims name **this** service only.
2. The token is obtained from Authentication Service via client-credentials using this service’s configured id and secret.
3. A usable cached token is reused until the refresh-before-expiry margin; the authenticator does not hit Authentication Service on every outbound call under steady load.
4. Near expiry, or after a peer 401 attributable to expiry, the authenticator re-fetches once and retries the outbound call once.
5. There is no platform refresh token; renewal is a new client-credentials grant.

### PSA-FR-003 — Public route bypass allowlist

**Description:** Explicitly public routes skip JWT verification.

**Acceptance criteria:**

1. Allowlisted public routes succeed without a JWT (including Create Owner, Authentication Service login/refresh/logout/reset, Authentication Service client-credentials `POST /oauth/token`, external Share link resolution, and health/liveness routes). Authentication Service revoke notices are **not** allowlisted — they require an `owner-pet-manager` platform JWT.
2. A non-allowlisted route without a JWT fails closed (unauthorized).

### PSA-FR-004 — Fail closed when platform token unavailable

**Description:** Outbound platform calls do not proceed anonymously when a platform token cannot be obtained.

**Acceptance criteria:**

1. If Authentication Service is unreachable and no usable cached platform token exists, the outbound call fails.
2. There is no fallback that sends the outbound call without a platform Bearer token.

### PSA-FR-005 — Actor only; no authorization policy

**Description:** The authenticator establishes who is calling. It does not enforce whether that actor may perform a given operation.

**Acceptance criteria:**

1. After successful verification, the handler receives the trusted actor (Owner id or platform service id).
2. The authenticator does not decide service-level authorization (for example whether Pet Health Service may call a given Owner & Pet Manager route). That remains each service’s functional requirements.

### PSA-FR-006 — Platform-service token issuance contract

**Description:** Authentication Service issues short-lived platform-service access tokens that this authenticator consumes. (Issuance behavior belongs to Authentication Service; this requirement states the contract the authenticator depends on.)

**Acceptance criteria:**

1. A successful client-credentials grant returns a Bearer JWT access token that expires in **1 hour (3600 seconds)**, with `iss` = `my-pet-care:authentication-service`, `aud` = `my-pet-care:platform`, claim `service` naming exactly one platform service, and `expires_in` in the response.
2. A client may obtain a token only for its own configured service id. Validation errors, rejected credentials, disabled/unknown clients, and try-again-later (AUTH-NFR-005) fail the obtainment path; the authenticator does not present a token from a failed grant.
3. Owner access tokens remain as defined by Authentication Service requirements (15-minute access tokens, `ownerId`, `aud` = `my-pet-care`); platform tokens do not use a refresh token.

## Quality attributes (NFRs)

### PSA-NFR-001 — Local verification cost

**Description:** Inbound verification stays local and cheap.

**Acceptance criteria:**

1. Inbound JWT verification does not call Authentication Service.
2. p95 verification overhead stays under about 5 ms on typical request hardware for a signature check only.

### PSA-NFR-002 — Outbound token cache efficiency

**Description:** Steady-state outbound traffic reuses cached platform tokens.

**Acceptance criteria:**

1. Under steady load with a valid cached token, the authenticator does not obtain a new platform token from Authentication Service on every outbound call.
2. Tokens are refreshed shortly before expiry, with a skew buffer larger than the verification leeway.

### PSA-NFR-003 — Uniform unauthorized failures

**Description:** Auth failures are consistent and non-leaky.

**Acceptance criteria:**

1. Missing, invalid, and expired tokens produce the same unauthorized Problem Details shape for inbound denial.
2. Client secrets and raw tokens never appear in service logs (ADR-0013).

### PSA-NFR-004 — Clock skew leeway

**Description:** JWT time claims tolerate small clock differences.

**Acceptance criteria:**

1. Verification accepts `exp` / `nbf` with a skew window of ±60 seconds.

### PSA-NFR-005 — Platform access-token lifetime

**Description:** Platform-service access tokens are short-lived in line with bearer-token practice and this repo’s research note.

**Acceptance criteria:**

1. Platform-service access tokens expire 1 hour after issue.
2. Lifetime choice is documented relative to `docs/research/platform-service-token-lifetime.md` (≤1 hour short-lived bar; cache until near expiry; no denylist means expiry is the practical revoke window).
