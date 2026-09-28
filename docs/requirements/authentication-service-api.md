# Authentication Service — HTTP API

This document maps **Authentication Service** functional requirements to resource-oriented REST endpoints (ADR-0004). Behavioral acceptance criteria live in [`authentication-service.md`](./authentication-service.md). Request and response field schemas are deferred to OpenAPI / Postman work that follows.

## Conventions

- **Base style:** JSON over HTTP. Success bodies are ordinary JSON resources. Errors are RFC 9457 Problem Details as `application/problem+json` (ADR-0010, ADR-0014).
- **Auth:** Login, refresh, logout, password-reset, and client-credentials routes do **not** require a Bearer JWT (platform-service authenticator allowlist). Revoke notices require an Owner & Pet Manager platform JWT (ADR-0016).
- **Token claims:** Owner access tokens use `ownerId`, `iss` = `my-pet-care:authentication-service`, `aud` = `my-pet-care`. Platform access tokens use `service`, the same `iss`, and `aud` = `my-pet-care:platform`.
- **Outbound:** Calls to Owner & Pet Manager use a platform Bearer JWT with `service` = `authentication-service`.

## Endpoints

### Owner session

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/auth/login` | Public | [AUTH-FR-001](./authentication-service.md#auth-fr-001--login) | `200` | Body: identifier + password. Returns access token + refresh token. |
| `POST` | `/auth/refresh` | Public (refresh token) | [AUTH-FR-002](./authentication-service.md#auth-fr-002--refresh) | `200` | Body: refresh token. Returns new access + refresh tokens. |
| `POST` | `/auth/logout` | Public (refresh token) | [AUTH-FR-003](./authentication-service.md#auth-fr-003--logout) | `204` | Body: refresh token. |
| `POST` | `/auth/password-reset/request` | Public | [AUTH-FR-004](./authentication-service.md#auth-fr-004--request-password-reset) | `202` | Body: email. |
| `POST` | `/auth/password-reset/complete` | Public | [AUTH-FR-005](./authentication-service.md#auth-fr-005--complete-password-reset) | `204` | Body: reset token + new password. |

### Platform clients

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/oauth/token` | Public (client id + secret) | [AUTH-FR-007](./authentication-service.md#auth-fr-007--platform-client-credentials-grant) | `200` | Client-credentials grant. Body (or equivalent): `grant_type=client_credentials`, service id, secret. Returns access token + `expires_in`. |

### Owner & Pet Manager collaborator

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/owners/{ownerId}/token-revocations` | Platform `owner-pet-manager` only | [AUTH-FR-006](./authentication-service.md#auth-fr-006--revoke-on-deactivation-or-password-change) | `204` | Body distinguishes deactivation vs password-change notice. Idempotent. |

## Out of scope for this API doc

- Per-failure Problem Details `type` URNs beyond ADR-0014 skeleton pairs.
- TLS termination and signing-key distribution details.
- Public CRUD for platform client registry (deploy/ops seeding only).
