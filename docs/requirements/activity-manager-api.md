# Activity Manager — HTTP API

This document maps **Activity Manager** functional requirements to resource-oriented REST endpoints (ADR-0004). Behavioral acceptance criteria live in [`activity-manager.md`](./activity-manager.md). Field schemas are in the OpenAPI spec linked below. The GPS route size limit stays in the test plan; an oversized route is `400` as below.

## Conventions

- **Base style:** JSON over HTTP. Success bodies are ordinary JSON resources. Errors are RFC 9457 Problem Details as `application/problem+json` (ADR-0010, ADR-0014). JSON object fields use camelCase.
- **Auth:** Every route requires an Owner Bearer JWT (ADR-0016) except `GET /health` and `GET /shares/external/{token}` (ADR-0019). The Owner id comes from claim `ownerId`. There is no `{ownerId}` path segment.
- **Resources:** Activity type, Activity, and Share. A GPS Activity is an Activity whose route is present because the Activity type is GPS-capable. Calories burned override is the **Calorie override** sub-resource, not a field on Activity update.
- **Activity types:** `GET /activity-types` is the pickable catalog: platform defaults plus this Owner’s active custom types. Soft-retired types are omitted there and remain available on `GET /activity-types/{activityTypeId}`. Another Owner’s custom types are never addressable.
- **Activities:** Create and list are nested under the Pet. Get, update, and hard-delete are by Activity id. List requires `from` and `to` (ISO-8601 instants, inclusive on the Activity timestamp) and returns timestamp descending. No pagination.
- **Shares:** One `POST` names the audience. Each success creates a new Share, including a second Share to the same audience. Resolve returns the Share snapshot frozen at share-create time, not the live Activity. There is no Share list and no recipient inbox. Revoking one Share leaves any other Share of that Activity in place.
- **Fields:** An Activity type’s display text is `label` (1–80 characters). Duration is `durationMinutes`, an integer number of minutes, at least 1. `calorieOverride` is true while a Calorie override is set; `caloriesBurned` is the effective value either way. A route is `{ "points": [ { "latitude", "longitude" } ] }` with at least two points. Optional `recordedAt` may appear on a point.
- **Deactivation:** Reads of existing Activities, and hard-delete of an Activity, stay allowed when the Pet is deactivated. Activity create and update, Calorie override set and clear, and Share create and revoke do not.

## Success status codes

| Kind | Status |
| ---- | ------ |
| Create (`POST`) | `201` + body |
| Read, update, Calorie override set, Calorie override clear | `200` + body |
| Activity hard-delete, Share revoke | `204` empty body |
| Activity type hard-delete | `204` empty body |
| Activity type soft-retire | `200` + the retired Activity type |

`GET /health` returns `200` `{ "status": "ok" }` (ADR-0014).

## Failure status codes

Details are fixed sentences. They carry no id, path, or upstream message. Types already in `packages/contracts` keep the detail defined there.

| Failure | Status | `type` | Detail |
| ------- | ------ | ------ | ------ |
| No route | `404` | `urn:my-pet-care:not-found` | `No route matches this request.` |
| Missing, invalid, or expired JWT | `401` | `urn:my-pet-care:unauthorized` | `Authentication is required to access this resource.` |
| Validation (missing or invalid fields, reversed `from`/`to`, GPS flag or calorie factor on rename, route on a non-GPS type, missing or oversized route on a GPS type) | `400` | `urn:my-pet-care:validation-failed` | `The request is invalid.` |
| Caller is not allowed to see or change the resource; missing Pet, Activity, Activity type, or share id; Activity type not visible to this Owner; Forum or Group activity missing; Owner is not the Share audience (including no Belonging) | `404` | `urn:my-pet-care:resource-not-found` | `The requested resource was not found.` |
| Platform-default Activity type rename or delete | `403` | `urn:my-pet-care:forbidden` | `You are not allowed to perform this operation.` |
| Soft-retired Activity type rename, or that type used on Activity create or update | `409` | `urn:my-pet-care:conflict` | `The request conflicts with the current state of the resource.` |
| Pet is deactivated, after ownership is confirmed, on a write that requires an active Pet | `409` | `urn:my-pet-care:pet-deactivated` | `This Pet is deactivated.` |
| Pet Health responded and the latest weight is empty | `409` | `urn:my-pet-care:latest-weight-missing` | `This Pet has no latest weight.` |
| Authenticated resolve or revoke of a Share that was revoked, or whose Activity was hard-deleted | `410` | `urn:my-pet-care:share-unavailable` | `This share is no longer available.` |
| External resolve: unknown token, revoked Share, or hard-deleted Activity | `410` | `urn:my-pet-care:share-unavailable` | `This share is no longer available.` |
| Owner & Pet Manager cannot be reached | `503` | `urn:my-pet-care:owner-pet-manager-unavailable` | `Owner & Pet Manager could not be reached.` |
| Pet Health cannot be reached for latest weight or activity-duration sync | `503` | `urn:my-pet-care:pet-health-unavailable` | `Pet Health Service could not be reached.` |
| Community collaborator cannot be reached, including while it does not exist | `503` | `urn:my-pet-care:community-collaborator-unavailable` | `The Community collaborator could not be reached.` |
| Unexpected failure | `500` | `urn:my-pet-care:internal-error` | `The service failed to handle this request.` |

A caller who does not own the Pet receives `404` `resource-not-found` even when that Pet is deactivated. `409` `pet-deactivated` is returned only after Owner & Pet Manager confirms ownership. An empty latest weight is not a `503`: Pet Health answered.

## Endpoints

### Health

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `GET` | `/health` | Public | Liveness (ADR-0014) | `200` | `{ "status": "ok" }`. |

### Activity types

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `GET` | `/activity-types` | Owner | [AM-FR-001](./activity-manager.md#am-fr-001--list-activity-types) | `200` | Pickable catalog only. Each type includes identity, label, GPS-capable flag, and calorie factor. |
| `POST` | `/activity-types` | Owner | [AM-FR-002](./activity-manager.md#am-fr-002--create-custom-activity-type) | `201` | Custom type. Body: `label`, `gpsCapable`, `calorieFactor`. Platform defaults are not created here. |
| `GET` | `/activity-types/{activityTypeId}` | Owner | [AM-FR-001](./activity-manager.md#am-fr-001--list-activity-types) | `200` | Includes soft-retired types this Owner may resolve. |
| `PATCH` | `/activity-types/{activityTypeId}` | Owner | [AM-FR-003](./activity-manager.md#am-fr-003--rename-custom-activity-type) | `200` | Body: `label` only. `gpsCapable` and `calorieFactor` are immutable. |
| `DELETE` | `/activity-types/{activityTypeId}` | Owner | [AM-FR-004](./activity-manager.md#am-fr-004--delete-custom-activity-type) | `204` or `200` | `204` when no Activity references the type. `200` and the retired type when any Activity does, including when it is already soft-retired. |

### Activities

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/pets/{petId}/activities` | Pet’s Owner | [AM-FR-005](./activity-manager.md#am-fr-005--create-activity) | `201` | Pet id, Activity type, timestamp, duration; optional Activity amount, notes, media references. GPS-capable types require a route. A route on a non-GPS type is `400`. Soft-retired type is `409`. |
| `GET` | `/pets/{petId}/activities` | Pet’s Owner | [AM-FR-006](./activity-manager.md#am-fr-006--get-and-list-activities) | `200` | Query `from` and `to` are both required. Allowed when the Pet is deactivated. |
| `GET` | `/activities/{activityId}` | Pet’s Owner | [AM-FR-006](./activity-manager.md#am-fr-006--get-and-list-activities) | `200` | GPS Activities include the route. Allowed when the Pet is deactivated. |
| `PATCH` | `/activities/{activityId}` | Pet’s Owner | [AM-FR-007](./activity-manager.md#am-fr-007--update-activity) | `200` | Timestamp, duration, Activity amount, notes, media references, route, Activity type. Does not set or clear a Calorie override. |
| `DELETE` | `/activities/{activityId}` | Pet’s Owner | [AM-FR-009](./activity-manager.md#am-fr-009--hard-delete-activity) | `204` | Permanent. Allowed when the Pet is deactivated. Shares of this Activity then resolve as no longer available. |

### Calorie override

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `PUT` | `/activities/{activityId}/calorie-override` | Pet’s Owner | [AM-FR-008](./activity-manager.md#am-fr-008--override-or-clear-calories-burned) | `200` | Sets the Owner’s Calories burned value. Later Activity updates do not replace it. Response is the Activity. |
| `DELETE` | `/activities/{activityId}/calorie-override` | Pet’s Owner | [AM-FR-008](./activity-manager.md#am-fr-008--override-or-clear-calories-burned) | `200` | Clears the override and re-estimates. Response is the Activity. Empty latest weight or unreachable Pet Health fails closed. |

### Shares

Create body is one of:

- `{ "audience": "owner", "recipientOwnerId": "…" }`
- `{ "audience": "forum", "forumId": "…" }`
- `{ "audience": "group-activity", "groupActivityId": "…" }`
- `{ "audience": "external" }`

The Community itself and a Shared location are `400`. An external `201` includes the capability URL (the public resolve path below) and summary text.

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/activities/{activityId}/shares` | Pet’s Owner | [AM-FR-010](./activity-manager.md#am-fr-010--share-activity-to-another-owner), [AM-FR-011](./activity-manager.md#am-fr-011--share-activity-to-a-forum-or-group-activity), [AM-FR-012](./activity-manager.md#am-fr-012--create-external-share-and-resolve-shares) | `201` | Always a new Share. Fails when the Pet is deactivated. Forum or Group activity fails closed: `404` when the Community collaborator reports the target missing, `503` when it cannot be reached. |
| `GET` | `/shares/{shareId}` | Audience Owner | [AM-FR-012](./activity-manager.md#am-fr-012--create-external-share-and-resolve-shares) | `200` | Recipient Owner, or an Owner with Belonging in the Community that contains the Forum or Group activity. Snapshot only. The Pet’s Owner does not use this route. |
| `GET` | `/shares/external/{token}` | Public | [AM-FR-012](./activity-manager.md#am-fr-012--create-external-share-and-resolve-shares) | `200` | `{token}` is the secret, not the share id. No JWT (ADR-0019). Every failure is `410` `share-unavailable`. |
| `DELETE` | `/shares/{shareId}` | Pet’s Owner | [AM-FR-013](./activity-manager.md#am-fr-013--revoke-share) | `204` | Revoke only. The Activity stays. Fails when the Pet is deactivated. |

## Contract artifacts

- OpenAPI 3.1: [`postman/specs/activity-manager/openapi.yaml`](../../postman/specs/activity-manager/openapi.yaml)
- Postman collection (v3): [`postman/collections/Activity Manager/`](../../postman/collections/Activity%20Manager/)
- Local environment: [`postman/environments/Activity Manager Local.environment.yaml`](../../postman/environments/Activity%20Manager%20Local.environment.yaml) (`baseUrl` defaults to `http://localhost:3003`)

Import or open the local Postman project from this repo. Use the **Activity Manager Local** environment. Set `ownerAccessToken` when exercising authenticated routes. Do not push to a Postman cloud workspace unless explicitly requested.

## Out of scope for this API doc

- The numeric GPS route size limit (test plan). Oversized routes are `400` `urn:my-pet-care:validation-failed`.
- Vendor posting to WhatsApp, Telegram, Facebook, or other external apps.
