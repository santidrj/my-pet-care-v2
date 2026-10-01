# Owner & Pet Manager — HTTP API

This document maps **Owner & Pet Manager** functional requirements to resource-oriented REST endpoints (ADR-0004). Behavioral acceptance criteria live in [`owner-pet-manager.md`](./owner-pet-manager.md). Request and response field schemas are deferred to the OpenAPI / Postman work that follows.

## Conventions

- **Base style:** JSON over HTTP. Success bodies are ordinary JSON resources. Errors are RFC 9457 Problem Details as `application/problem+json` (ADR-0010, ADR-0014).
- **Auth:** Every route requires a Bearer JWT (ADR-0016) except `POST /owners` (Create Owner), which is public so an Owner can register before login (ADR-0015).
- **Actors in the token:** An Owner call carries claim `ownerId`. A platform call carries claim `service` naming the calling service (`pet-health-service`, `activity-manager`, `authentication-service`, or `community`). The service applies authorization from the claim and the route rules below. Tokens are verified via the platform-service authenticator (ADR-0016).
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

## Failure status codes

Details are fixed sentences. They carry no id, path, or upstream message. Types already in `packages/contracts` keep the detail defined there.

| Failure | Status | `type` | Detail |
| ------- | ------ | ------ | ------ |
| No route | `404` | `urn:my-pet-care:not-found` | `No route matches this request.` |
| Missing, invalid, or expired JWT | `401` | `urn:my-pet-care:unauthorized` | `Authentication is required to access this resource.` |
| Validation (missing or invalid fields, unknown JSON properties on a request body) | `400` | `urn:my-pet-care:validation-failed` | `The request is invalid.` |
| Caller is not allowed for the operation | `403` | `urn:my-pet-care:forbidden` | `You are not allowed to perform this operation.` |
| Missing Owner or Pet; Pet summary unavailable; ownership check when either id is missing | `404` | `urn:my-pet-care:resource-not-found` | `The requested resource was not found.` |
| Username already used (including concurrent create/update races) | `409` | `urn:my-pet-care:username-taken` | `Username is already in use.` |
| Email already used (including concurrent create/update races) | `409` | `urn:my-pet-care:email-taken` | `Email is already in use.` |
| Owner Deactivation while already deactivated | `409` | `urn:my-pet-care:owner-already-deactivated` | `The Owner is already deactivated.` |
| Update or visibility change on a deactivated Owner | `409` | `urn:my-pet-care:owner-deactivated` | `This Owner is deactivated.` |
| Owner Deactivation while still Community owner | `409` | `urn:my-pet-care:community-owner` | `This Owner cannot be deactivated while they are a Community owner.` |
| Community-owner check could not be completed | `409` | `urn:my-pet-care:community-check-unavailable` | `Owner deactivation could not be completed.` |
| Update on a deactivated Pet | `409` | `urn:my-pet-care:pet-deactivated` | `This Pet is deactivated.` |
| Pet Deactivation while already deactivated | `409` | `urn:my-pet-care:pet-already-deactivated` | `The Pet is already deactivated.` |
| Unexpected failure | `500` | `urn:my-pet-care:internal-error` | `The service failed to handle this request.` |

## Endpoints

### Owners

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/owners` | Public | [OPM-FR-001](./owner-pet-manager.md#opm-fr-001--create-owner) | `201` | Body: username, email, password; optional photo. |
| `GET` | `/owners/{ownerId}` | Owner or platform | [OPM-FR-002](./owner-pet-manager.md#opm-fr-002--get-owner) | `200` | Another Owner does not receive **email**. Includes **Pet list visibility**. Password and hash never returned. |
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
| `POST` | `/owners/{ownerId}/pets` | Owning Owner | [OPM-FR-005](./owner-pet-manager.md#opm-fr-005--create-pet) | `201` | name, species (`dog`\|`cat`), sex required; breed, date of birth, photo optional. |
| `GET` | `/owners/{ownerId}/pets` | Owner or platform | [OPM-FR-009](./owner-pet-manager.md#opm-fr-009--list-pets-for-owner) | `200` | Query: `status=active\|all` (omit = `active`). Another Owner only when Pet list visibility is **public**, and then only active **Pet summaries** — `status=all` does not reveal deactivated Pets to them. Owner and platform services receive full Pet records; with `status=all` they may include deactivated Pets. |

### Pets (flat resource)

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `GET` | `/pets/{petId}` | Pet’s Owner or platform | [OPM-FR-006](./owner-pet-manager.md#opm-fr-006--get-pet) | `200` | Other Owners use Get Pet Summary. |
| `PATCH` | `/pets/{petId}` | Pet’s Owner | [OPM-FR-007](./owner-pet-manager.md#opm-fr-007--update-pet) | `200` | |
| `DELETE` | `/pets/{petId}` | Pet’s Owner | [OPM-FR-008](./owner-pet-manager.md#opm-fr-008--deactivate-pet) | `204` | Deactivation. |
| `GET` | `/pets/{petId}/summary` | Other Owner only | [OPM-FR-012](./owner-pet-manager.md#opm-fr-012--get-pet-summary) | `200` | Active Pet + Owner’s Pet list visibility **public**. Missing, deactivated, and private fail the same way. Pet’s Owner and platform services must not use this route. |
| `GET` | `/pets/{petId}/owners/{ownerId}` | Platform | [OPM-FR-010](./owner-pet-manager.md#opm-fr-010--check-pet-ownership) | `200` | `{ "isOwner": true \| false }` when both exist; not-found when either id is missing. Answerable for deactivated Owners and Pets. |

## Contract artifacts

- OpenAPI 3.1: [`postman/specs/owner-pet-manager/openapi.yaml`](../../postman/specs/owner-pet-manager/openapi.yaml)
- Postman collection (v3): [`postman/collections/Owner & Pet Manager/`](../../postman/collections/Owner%20&%20Pet%20Manager/)
- Local environment: [`postman/environments/Owner & Pet Manager Local.environment.yaml`](../../postman/environments/Owner%20&%20Pet%20Manager%20Local.environment.yaml) (`baseUrl` defaults to `http://localhost:3001`)

Import or open the local Postman project from this repo. Use the **Owner & Pet Manager Local** environment. Set `ownerAccessToken` / `platformAccessToken` when exercising authenticated routes. Do not push to a Postman cloud workspace unless explicitly requested.

## Out of scope for this API doc

- TLS termination and token verification library details.
