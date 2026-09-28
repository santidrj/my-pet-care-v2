# Platform-service authenticator — HTTP contract

This document maps **platform-service authenticator** functional requirements to the cross-cutting HTTP contract the module imposes and consumes (ADR-0004). The authenticator is a shared library: it owns no resource routes. Behavioral acceptance criteria live in [`platform-service-authenticator.md`](./platform-service-authenticator.md). Route ownership and OpenAPI / Postman artifacts live with each service.

## Conventions

- **Base style:** JSON over HTTP (ADR-0004). Inbound auth failures use RFC 9457 Problem Details as `application/problem+json` (ADR-0010, ADR-0014).
- **Role:** Each platform service wires this module for inbound Bearer JWT verification and outbound platform credential presentation (ADR-0016). Per-route authorization stays in each service’s functional requirements ([PSA-FR-005](./platform-service-authenticator.md#psa-fr-005--actor-only-no-authorization-policy)).
- **Inbound header:** Protected routes expect `Authorization: Bearer <jwt>`. Missing, malformed, or failed verification yields the uniform unauthorized Problem Details below.
- **Public routes:** Paths on the [public allowlist](#public-allowlist-catalog) skip verification entirely. A present Bearer token is **ignored** (not verified); handlers see no trusted actor from this module.
- **Token claims:** Owner JWTs carry `ownerId`, `iss` = `my-pet-care:authentication-service`, `aud` = `my-pet-care`. Platform JWTs carry `service` (exactly one allowed id), the same `iss`, and `aud` = `my-pet-care:platform`. The two actor shapes are mutually exclusive ([PSA-FR-001](./platform-service-authenticator.md#psa-fr-001--verify-inbound-bearer-jwt)).
- **Outbound grant:** Platform tokens are obtained from Authentication Service `POST /oauth/token` (owned by [`authentication-service-api.md`](./authentication-service-api.md); ADR-0017). This doc does not re-own that route.
- **No contract artifacts here:** There is no authenticator OpenAPI or Postman collection; the library exposes no HTTP server surface.

## Inbound verification

Applies to every non-allowlisted route on services that use the authenticator ([PSA-FR-001](./platform-service-authenticator.md#psa-fr-001--verify-inbound-bearer-jwt)).

| Outcome | Wire / process result | Requirement |
| ------- | --------------------- | ----------- |
| Valid Owner JWT | Trusted actor `{ kind: "owner", ownerId }` for the handler | [PSA-FR-001](./platform-service-authenticator.md#psa-fr-001--verify-inbound-bearer-jwt), [PSA-FR-005](./platform-service-authenticator.md#psa-fr-005--actor-only-no-authorization-policy) |
| Valid platform-service JWT | Trusted actor `{ kind: "platform", service }` (`service` one of `owner-pet-manager`, `pet-health-service`, `activity-manager`, `authentication-service`, `community`) | same |
| Missing, invalid, forged, expired, wrong `aud`/`iss`, both or neither actor claim | `401` unauthorized Problem Details (uniform; non-leaky) | [PSA-FR-001](./platform-service-authenticator.md#psa-fr-001--verify-inbound-bearer-jwt), [PSA-NFR-003](./platform-service-authenticator.md#psa-nfr-003--uniform-unauthorized-failures) |

Verification is local (`jose` + Authentication Service trust material). It does not call Authentication Service per request. Clock skew leeway for `exp` / `nbf` is ±60 seconds ([PSA-NFR-004](./platform-service-authenticator.md#psa-nfr-004--clock-skew-leeway)).

### Trusted actor (in-process)

On success the authenticator does **not** return an HTTP body and does **not** set a custom identity header. It exposes a discriminated union to the handler:

```ts
type TrustedActor =
  | { kind: "owner"; ownerId: string }
  | {
      kind: "platform";
      service:
        | "owner-pet-manager"
        | "pet-health-service"
        | "activity-manager"
        | "authentication-service"
        | "community";
    };
```

Establishing the actor is not authorizing the operation.

### Unauthorized Problem Details

| Field | Value |
| ----- | ----- |
| Status | `401` |
| `Content-Type` | `application/problem+json` |
| `type` | `urn:my-pet-care:unauthorized` |
| `title` | `Unauthorized` |
| `detail` | `Authentication is required to access this resource.` |

Missing, invalid, and expired tokens (and related claim/`aud`/`iss` failures) share this shape. The body must not reveal which check failed (ADR-0014).

## Public allowlist catalog

Platform-wide source of truth for routes that skip JWT verification ([PSA-FR-003](./platform-service-authenticator.md#psa-fr-003--public-route-bypass-allowlist)). Each owning service’s `*-api.md` still marks `Auth: Public` locally. Runtime wiring is per-service (only that process’s paths).

| Method | Path | Owning service | Requirement / notes |
| ------ | ---- | -------------- | ------------------- |
| `POST` | `/auth/login` | Authentication Service | [AUTH-FR-001](./authentication-service.md#auth-fr-001--login) — [`authentication-service-api.md`](./authentication-service-api.md) |
| `POST` | `/auth/refresh` | Authentication Service | [AUTH-FR-002](./authentication-service.md#auth-fr-002--refresh) |
| `POST` | `/auth/logout` | Authentication Service | [AUTH-FR-003](./authentication-service.md#auth-fr-003--logout) |
| `POST` | `/auth/password-reset/request` | Authentication Service | [AUTH-FR-004](./authentication-service.md#auth-fr-004--request-password-reset) |
| `POST` | `/auth/password-reset/complete` | Authentication Service | [AUTH-FR-005](./authentication-service.md#auth-fr-005--complete-password-reset) |
| `POST` | `/oauth/token` | Authentication Service | [AUTH-FR-007](./authentication-service.md#auth-fr-007--platform-client-credentials-grant) |
| `POST` | `/owners` | Owner & Pet Manager | [OPM-FR-001](./owner-pet-manager.md#opm-fr-001--create-owner) — Create Owner (ADR-0015) |
| `GET` | `/shares/external/{token}` | Activity Manager | [AM-FR-012](./activity-manager.md#am-fr-012--create-external-share-and-resolve-shares) — provisional path until `activity-manager-api.md` exists; capability URL, no JWT |
| `GET` | `/health` | Authentication Service | Liveness `{ "status": "ok" }` (ADR-0014) |
| `GET` | `/health` | Owner & Pet Manager | same |
| `GET` | `/health` | Pet Health Service | same |
| `GET` | `/health` | Activity Manager | same |

### Explicitly not allowlisted

| Method | Path | Owning service | Auth |
| ------ | ---- | -------------- | ---- |
| `POST` | `/owners/{ownerId}/token-revocations` | Authentication Service | Platform JWT with `service` = `owner-pet-manager` only ([AUTH-FR-006](./authentication-service.md#auth-fr-006--revoke-on-deactivation-or-password-change)) |

All other routes fail closed without a valid Bearer JWT.

## Outbound platform credential

When a platform service makes a synchronous call to another platform service ([PSA-FR-002](./platform-service-authenticator.md#psa-fr-002--present-outbound-platform-credential), [PSA-FR-006](./platform-service-authenticator.md#psa-fr-006--platform-service-token-issuance-contract)):

| Rule | Detail |
| ---- | ------ |
| Attach | `Authorization: Bearer` with a platform-service JWT whose `service` claim is **this** service only |
| Obtain | Client-credentials against Authentication Service [`POST /oauth/token`](./authentication-service-api.md#platform-clients) (JSON body per ADR-0017); no platform refresh token |
| Cache | Reuse a usable cached token until the refresh-before-expiry margin |
| Refresh margin | Re-fetch when remaining lifetime ≤ **5 minutes (300 seconds)** |
| Peer `401` | Invalidate cache → client-credentials re-fetch once → retry the outbound call **once**. Any peer `401` on a call that used a platform Bearer triggers this path (do not parse Problem Details for “expiry”). A second `401` or a failed grant fails closed |
| Fail closed | If Authentication Service is unreachable and no usable cached token exists, do **not** send the outbound call without a Bearer ([PSA-FR-004](./platform-service-authenticator.md#psa-fr-004--fail-closed-when-platform-token-unavailable)). Failure is in-process; the calling service maps it to its own Problem Details (typically dependency unavailable) |
| Logging | Tokens and secrets never appear in service logs (ADR-0013) |

## Out of scope for this contract doc

- Per-route authorization policy (each service’s FRs).
- Owner login, refresh, logout, and password reset (Authentication Service).
- Request/response schemas for service-owned resources (each service’s OpenAPI / Postman).
- Signing-key distribution mechanics beyond “local verification with Auth trust material.”
- Instant revoke / access-token denylist.
