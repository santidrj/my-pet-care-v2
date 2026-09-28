# Owner & Pet Manager — HTTP API

This document maps **Owner & Pet Manager** functional requirements to resource-oriented REST endpoints (ADR-0004). Behavioral acceptance criteria live in [`owner-pet-manager.md`](./owner-pet-manager.md). Request and response field schemas are deferred to the OpenAPI / Postman work that follows.

## Conventions

- **Base style:** JSON over HTTP. Success bodies are ordinary JSON resources. Errors are RFC 9457 Problem Details as `application/problem+json` (ADR-0010, ADR-0014).
- **Auth:** Every route requires a Bearer JWT (ADR-0011) except `POST /owners` (Create Owner), which is public so an Owner can register before login (ADR-0015).
- **Actors in the token:** An Owner call carries that Owner’s id. A platform call names the calling service (Pet Health Service, Activity Manager, Authentication Service, or Community collaborator). The service applies authorization from the claim and the route rules below.
- **Deactivation:** `DELETE` on an Owner or Pet means **Deactivation** (soft). It is not a Hard delete. See the glossary and OPM-FR-004 / OPM-FR-008.
- **Ids:** `{ownerId}` and `{petId}` are the resource ids returned on create. The path segment `credentials` is reserved and is never an `{ownerId}`.
- **Self vs other:** For Owner-facing writes, the Owner id in the path must be the Owner in the token (or, for Pets, the Pet’s Owner). Platform services use the service-facing rules in each FR.

## Success status codes

| Kind | Status |
| ---- | ------ |
| Create (`POST`) | `201` + body |
| Read / update / visibility / credentials password | `200` + body |
| Deactivation (`DELETE`) | `204` empty body |
| Ownership check | `200` + `{ "isOwner": boolean }` |

## Endpoints

### Owners

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/owners` | Public | [OPM-FR-001](./owner-pet-manager.md#opm-fr-001--create-owner) | `201` | Body: username, email, password; optional photo. |
| `GET` | `/owners/{ownerId}` | Owner or platform | [OPM-FR-002](./owner-pet-manager.md#opm-fr-002--get-owner) | `200` | Another Owner does not receive **email**. Password and hash never returned. |
| `GET` | `/owners?username={username}` | Owner or platform | [OPM-FR-002](./owner-pet-manager.md#opm-fr-002--get-owner) | `200` | Unique username lookup. Unknown username is not-found, distinct from success. |
| `PATCH` | `/owners/{ownerId}` | Owning Owner | [OPM-FR-003](./owner-pet-manager.md#opm-fr-003--update-owner) | `200` | username, email, password, photo. Password change notifies Authentication Service to revoke refresh tokens. |
| `DELETE` | `/owners/{ownerId}` | Owning Owner | [OPM-FR-004](./owner-pet-manager.md#opm-fr-004--deactivate-owner) | `204` | Deactivation (Community-owner gate, cascade to active Pets). |
| `PUT` | `/owners/{ownerId}/pet-list-visibility` | Owning Owner | [OPM-FR-011](./owner-pet-manager.md#opm-fr-011--set-pet-list-visibility) | `200` | Body: `{ "petListVisibility": "public" \| "private" }`. |

### Authentication collaborator (Auth-only)

These routes are callable only with an Authentication Service platform claim. Owners and other platform services must not receive password hashes (OPM-NFR-004).

| Method | Path | Requirement | Success | Notes |
| ------ | ---- | ----------- | ------- | ----- |
| `GET` | `/owners/credentials?identifier={identifier}` | [OPM-FR-013](./owner-pet-manager.md#opm-fr-013--get-credentials-by-identifier) | `200` | Login path. Identifier is username or email (same parsing rules as Auth). Body: `ownerId`, `passwordHash`, `active`. |
| `GET` | `/owners/{ownerId}/credentials` | [OPM-FR-014](./owner-pet-manager.md#opm-fr-014--get-credentials-by-owner-id) | `200` | Refresh path. Same body shape. |
| `PUT` | `/owners/{ownerId}/credentials/password` | [OPM-FR-015](./owner-pet-manager.md#opm-fr-015--set-password-from-authentication-service) | `200` | Completed reset. Body: `{ "password": "…" }`. Strength rules apply. Response does not include password or hash. |

### Pets (Owner-scoped collection)

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/owners/{ownerId}/pets` | Owning Owner | [OPM-FR-005](./owner-pet-manager.md#opm-fr-005--create-pet) | `201` | name, species, sex required; breed, date of birth, photo optional. |
| `GET` | `/owners/{ownerId}/pets` | Owner or platform | [OPM-FR-009](./owner-pet-manager.md#opm-fr-009--list-pets-for-owner) | `200` | Query: `status=active\|all` (omit = `active`). Another Owner only when Pet list visibility is **public**, and then only active **Pet summaries** — `status=all` does not reveal deactivated Pets to them. Owner and platform services receive full Pet records; with `status=all` they may include deactivated Pets. |

### Pets (flat resource)

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `GET` | `/pets/{petId}` | Pet’s Owner or platform | [OPM-FR-006](./owner-pet-manager.md#opm-fr-006--get-pet) | `200` | Other Owners use Get Pet Summary. |
| `PATCH` | `/pets/{petId}` | Pet’s Owner | [OPM-FR-007](./owner-pet-manager.md#opm-fr-007--update-pet) | `200` | |
| `DELETE` | `/pets/{petId}` | Pet’s Owner | [OPM-FR-008](./owner-pet-manager.md#opm-fr-008--deactivate-pet) | `204` | Deactivation. |
| `GET` | `/pets/{petId}/summary` | Other Owner only | [OPM-FR-012](./owner-pet-manager.md#opm-fr-012--get-pet-summary) | `200` | Active Pet + Owner’s Pet list visibility **public**. Missing, deactivated, and private fail the same way. Pet’s Owner and platform services must not use this route. |
| `GET` | `/pets/{petId}/owners/{ownerId}` | Platform | [OPM-FR-010](./owner-pet-manager.md#opm-fr-010--check-pet-ownership) | `200` | `{ "isOwner": true \| false }` when both exist; not-found when either id is missing. Answerable for deactivated Owners and Pets. |

## Out of scope for this API doc

- Field-level JSON schemas, examples, and Problem Details `type` URNs per failure (OpenAPI / Postman next).
- Liveness `GET /health` (process concern, not an OPM-FR).
- TLS termination and token verification library details.
