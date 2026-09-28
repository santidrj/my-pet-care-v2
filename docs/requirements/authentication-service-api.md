# Authentication Service — HTTP API

This document maps **Authentication Service** functional requirements to resource-oriented REST endpoints (ADR-0004). Behavioral acceptance criteria live in [`authentication-service.md`](./authentication-service.md). Request and response field schemas are deferred to OpenAPI / Postman work that follows.

## Conventions

- **Base style:** JSON over HTTP (ADR-0004), including `POST /oauth/token` (ADR-0017). Success bodies are ordinary JSON. Errors are RFC 9457 Problem Details as `application/problem+json` (ADR-0010, ADR-0014).
- **Naming:** JSON object fields use **camelCase**, same as Owner & Pet Manager’s HTTP API.
- **Auth:** Login, refresh, logout, password-reset, and client-credentials routes do **not** require a Bearer JWT (platform-service authenticator allowlist). Revoke notices require an Owner & Pet Manager platform JWT (ADR-0016).
- **Token claims:** Owner access tokens use `ownerId`, `iss` = `my-pet-care:authentication-service`, `aud` = `my-pet-care`. Platform access tokens use `service`, the same `iss`, and `aud` = `my-pet-care:platform`.
- **Outbound:** Calls to Owner & Pet Manager use a platform Bearer JWT with `service` = `authentication-service`.
- **Refresh presentation:** `/auth/refresh` and `/auth/logout` take the refresh token in the JSON body as `refreshToken` (not a cookie, not `Authorization`).

## Success status codes

| Kind | Status |
| ---- | ------ |
| Login / refresh / client-credentials | `200` + body |
| Password-reset request accepted | `202` empty body |
| Logout / password-reset complete / token revocation | `204` empty body |

## Failure status codes

Failure kinds are named in [`authentication-service.md`](./authentication-service.md). Domain Problem Details `type` URNs beyond ADR-0014’s skeleton pair are deferred.

| Failure kind | Status |
| ------------ | ------ |
| Validation (malformed identifier/email, missing client fields, unsupported or missing `grantType`, weak reset password) | `400` |
| Rejected Owner credentials; rejected client credentials; bad or reused refresh on refresh | `401` |
| Revoke notice: missing or invalid JWT | `401` |
| Revoke notice: platform JWT whose `service` is not `owner-pet-manager` | `403` |
| Reset did not start (unknown email or deactivated Owner); invalid, expired, or already-used reset link | `404` |
| Try-again-later (login, reset, or client-credentials rate limits) | `429` |
| Mail delivery failure on reset request; Owner & Pet Manager unreachable | `503` |

Logout with a well-formed body whose `refreshToken` is unknown, expired, or already revoked still returns `204` (idempotent).

## Endpoints

### Owner session

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/auth/login` | Public | [AUTH-FR-001](./authentication-service.md#auth-fr-001--login) | `200` | Body: `identifier`, `password`. Returns `accessToken`, `tokenType` (`Bearer`), `expiresIn`, `refreshToken`. |
| `POST` | `/auth/refresh` | Public (`refreshToken` in body) | [AUTH-FR-002](./authentication-service.md#auth-fr-002--refresh) | `200` | Body: `refreshToken`. Returns new `accessToken`, `tokenType`, `expiresIn`, `refreshToken`. |
| `POST` | `/auth/logout` | Public (`refreshToken` in body) | [AUTH-FR-003](./authentication-service.md#auth-fr-003--logout) | `204` | Body: `refreshToken`. Idempotent when the token is already unusable. |
| `POST` | `/auth/password-reset/request` | Public | [AUTH-FR-004](./authentication-service.md#auth-fr-004--request-password-reset) | `202` | Body: `email`. |
| `POST` | `/auth/password-reset/complete` | Public | [AUTH-FR-005](./authentication-service.md#auth-fr-005--complete-password-reset) | `204` | Body: `resetToken`, `password`. |

### Platform clients

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/oauth/token` | Public (service id + secret) | [AUTH-FR-007](./authentication-service.md#auth-fr-007--platform-client-credentials-grant) | `200` | JSON body: `grantType` (`client_credentials`, required; other values are `400`), `serviceId`, `secret`. Returns `accessToken`, `tokenType` (`Bearer`), `expiresIn`. No refresh token. Errors are Problem Details (ADR-0017). |

### Owner & Pet Manager collaborator

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/owners/{ownerId}/token-revocations` | Platform `owner-pet-manager` only | [AUTH-FR-006](./authentication-service.md#auth-fr-006--revoke-on-deactivation-or-password-change) | `204` | Body: `{ "reason": "deactivation" \| "passwordChange" }`. Idempotent. |

## Out of scope for this API doc

- Per-failure Problem Details `type` URNs beyond ADR-0014 skeleton pairs.
- TLS termination and signing-key distribution details.
- Public CRUD for platform client registry (deploy/ops seeding only).
- Request/response field schemas (OpenAPI / Postman).
