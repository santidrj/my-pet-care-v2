# Authentication Service — HTTP API

This document maps **Authentication Service** functional requirements to resource-oriented REST endpoints (ADR-0004). Behavioral acceptance criteria live in [`authentication-service.md`](./authentication-service.md). Request and response field schemas live in the OpenAPI / Postman contract artifacts below.

## Conventions

- **Base style:** JSON over HTTP (ADR-0004), including `POST /oauth/token` (ADR-0017). Success bodies are ordinary JSON. Errors are RFC 9457 Problem Details as `application/problem+json` (ADR-0010, ADR-0014).
- **Naming:** JSON object fields use **camelCase**, same as Owner & Pet Manager’s HTTP API.
- **Auth:** Login, refresh, logout, password-reset, and client-credentials routes do **not** require a Bearer JWT (platform-service authenticator allowlist). Ensure platform client does not take a Bearer JWT; the JSON body carries `setupSecret`, and a missing or wrong value is unauthorized (ADR-0023). The authenticator allowlist skips JWT verification on that route so the use case can require the setup secret. Revoke notices require an Owner & Pet Manager platform JWT (ADR-0016).
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

Failure kinds are named in [`authentication-service.md`](./authentication-service.md). `type` values are ADR-0022.

| Failure kind | Status | `type` |
| ------------ | ------ | ------ |
| Validation (malformed identifier/email, missing client fields, unsupported or missing `grantType`, weak reset password) | `400` | `urn:my-pet-care:validation-failed` |
| Rejected Owner credentials; rejected client credentials (including an unknown `serviceId`, which is `401`, not `400`); bad or reused refresh on refresh | `401` | `urn:my-pet-care:credentials-rejected` |
| Revoke notice: missing or invalid JWT | `401` | `urn:my-pet-care:unauthorized` |
| Revoke notice: platform JWT whose `service` is not `owner-pet-manager` | `403` | `urn:my-pet-care:forbidden` |
| Reset did not start (unknown email or deactivated Owner); invalid, expired, or already-used reset link | `404` | `urn:my-pet-care:resource-not-found` |
| Try-again-later (login, reset, or client-credentials rate limits) | `429` | `urn:my-pet-care:try-again-later` |
| Owner & Pet Manager unreachable | `503` | `urn:my-pet-care:owner-pet-manager-unavailable` |
| Mail delivery failure on reset request | `503` | `urn:my-pet-care:mail-delivery-failed` |

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
| `PUT` | `/platform-clients/{serviceId}` | Setup secret in the JSON body | [AUTH-FR-008](./authentication-service.md#auth-fr-008--ensure-platform-client) | `204` | Body: `secret`, `active`, `setupSecret`. Upserts that service id only. No list, get, or delete. |
| `POST` | `/oauth/token` | Public (service id + secret) | [AUTH-FR-007](./authentication-service.md#auth-fr-007--platform-client-credentials-grant) | `200` | JSON body: `grantType` (`client_credentials`, required; other values are `400`), `serviceId`, `secret`. Returns `accessToken`, `tokenType` (`Bearer`), `expiresIn`. No refresh token. Errors are Problem Details (ADR-0017). |

### Owner & Pet Manager collaborator

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/owners/{ownerId}/token-revocations` | Platform `owner-pet-manager` only | [AUTH-FR-006](./authentication-service.md#auth-fr-006--revoke-on-deactivation-or-password-change) | `204` | Body: `{ "reason": "deactivation" \| "passwordChange" }`. Idempotent. |

## Contract artifacts

- OpenAPI 3.1: [`postman/specs/authentication-service/openapi.yaml`](../../postman/specs/authentication-service/openapi.yaml)
- Postman collection (v3): [`postman/collections/Authentication Service/`](../../postman/collections/Authentication%20Service/)
- Local environment: [`postman/environments/Authentication Service Local.environment.yaml`](../../postman/environments/Authentication%20Service%20Local.environment.yaml) (`baseUrl` defaults to `http://localhost:3004`)

Import or open the local Postman project from this repo. Use the **Authentication Service Local** environment. Set `platformAccessToken`, `refreshToken`, `resetToken`, `ownerId`, `platformClientSecret`, and `platformSetupSecret` when exercising the corresponding routes. Do not push to a Postman cloud workspace unless explicitly requested.

## Out of scope for this API doc

- TLS termination and signing-key distribution details.
