# Pet Health Service — HTTP API

This document maps **Pet Health Service** functional requirements to resource-oriented REST endpoints (ADR-0004). Behavioral acceptance criteria live in [`pet-health-service.md`](./pet-health-service.md). Field schemas are in the OpenAPI spec linked below.

## Conventions

- **Base style:** JSON over HTTP. Success bodies are ordinary JSON resources. Errors are RFC 9457 Problem Details as `application/problem+json` (ADR-0010, ADR-0014). JSON object fields use camelCase.
- **Auth:** Every route requires a Bearer JWT (ADR-0016) except `GET /health`. An Owner call carries claim `ownerId`. There is no `{ownerId}` path segment. A platform call carries claim `service`; only `activity-manager` is accepted, and only on `GET /pets/{petId}/health-profile` and the activity-duration `PUT` and `DELETE`.
- **Resources:** Health profile, weight, calories-consumed, and activity-duration Health metrics, Meal, Wash, Wash schedule, Vet visit, and Medication. Each Health metric dimension is its own collection, so each exposes only the writes its dimension allows. The Medical record is a read-only view. The recommended daily kilocalories override is its own sub-resource of the Health profile, like Activity Manager's Calorie override.
- **Nesting:** Create and list are nested under the Pet. Get, update, and hard-delete are by the item's own id. The Health profile, Wash schedule, next due, kilocalories eaten, and Medical record stay under the Pet.
- **Derived metric ids:** A calories-consumed Health metric's id is its Meal's id. An activity-duration Health metric's id is its Activity's id in Activity Manager (ADR-0024).
- **Lists:** `from` and `to` are optional ISO-8601 instants, inclusive on the item's timestamp (`visitedAt` for Vet visits). Results are timestamp descending. No pagination. `GET /pets/{petId}/kilocalories-eaten` requires both `from` and `to`.
- **Fields:** Weight is `weightKg`, a decimal greater than 0. Kilocalories are integers: Meal `kilocalories` at least 0, the override at least 1. Health profile `latestWeightKg` and `recommendedDailyKilocalories` are always present and `null` when empty. `recommendedDailyKilocaloriesOverridden` is true while an override is in effect. Wash schedule `startDate`, next due, and Medication `startDate` and `endDate` are calendar dates. Wash, Meal, and weight timestamps and Vet visit `visitedAt` are instants. Other optional fields are omitted when unset.
- **Dates:** The current date, for the Wash schedule start date rule and next due, is the UTC date.
- **Partial update:** `PATCH` bodies need at least one field. An omitted field is unchanged. `null` clears an optional field (`brand`, `notes`, `endDate`, `vetVisitId`); `[]` clears Meal `labels`. `null` on a required field is `400`.
- **Recommended daily kilocalories:** Without an override, it is derived from latest weight and species every time a weight metric is recorded, corrected, or deleted, and is `null` when latest weight is empty. There is no recalculate route; clearing the override derives the value again.
- **Deactivation:** Reads stay allowed when the Pet is deactivated, and so does the activity-duration hard-delete. Every other write fails when the Pet is deactivated.

## Success status codes

| Kind | Status |
| ---- | ------ |
| Create (`POST`), Wash schedule set (`PUT`) | `201` + body |
| Read, update, override set, override clear | `200` + body |
| Activity-duration sync (`PUT`) | `201` + body on create, `200` + body on correct |
| Hard delete (`DELETE`), including Wash schedule delete | `204` empty body |

`GET /health` returns `200` `{ "status": "ok" }` (ADR-0014).

## Failure status codes

Details are fixed sentences. They carry no id, path, or upstream message. Types already in `packages/contracts` keep the detail defined there.

| Failure | Status | `type` | Detail |
| ------- | ------ | ------ | ------ |
| No route | `404` | `urn:my-pet-care:not-found` | `No route matches this request.` |
| Missing, invalid, or expired JWT | `401` | `urn:my-pet-care:unauthorized` | `Authentication is required to access this resource.` |
| Validation (missing or invalid fields, empty `PATCH`, reversed `from`/`to`, weight not above 0, negative kilocalories, Wash schedule start date before the current UTC date, Medication `endDate` before `startDate`) | `400` | `urn:my-pet-care:validation-failed` | `The request is invalid.` |
| The kind of caller can never perform the operation: a platform service on an Owner route, a platform service other than Activity Manager, or an Owner on the activity-duration `PUT` or `DELETE` | `403` | `urn:my-pet-care:forbidden` | `You are not allowed to perform this operation.` |
| Caller does not own the Pet; missing Pet, Health metric, Meal, Wash, Wash schedule, Vet visit, or Medication; Medication `vetVisitId` missing or belonging to another Pet | `404` | `urn:my-pet-care:resource-not-found` | `The requested resource was not found.` |
| Wash schedule set while one exists; activity-duration sync naming a different Pet than the stored metric | `409` | `urn:my-pet-care:conflict` | `The request conflicts with the current state of the resource.` |
| Pet is deactivated, after ownership is confirmed, on a write that requires an active Pet | `409` | `urn:my-pet-care:pet-deactivated` | `This Pet is deactivated.` |
| Owner & Pet Manager cannot be reached | `503` | `urn:my-pet-care:owner-pet-manager-unavailable` | `Owner & Pet Manager could not be reached.` |
| Unexpected failure, including a species other than `dog` or `cat` from Owner & Pet Manager | `500` | `urn:my-pet-care:internal-error` | `The service failed to handle this request.` |

A caller who does not own the Pet receives `404` `resource-not-found` even when that Pet is deactivated. `409` `pet-deactivated` is returned only after Owner & Pet Manager confirms ownership. For Activity Manager, a missing Pet is `404` and a deactivated Pet is `409` `pet-deactivated` on the sync `PUT`. Pet Health Service fails closed when Owner & Pet Manager cannot be reached for ownership, Pet status, or species.

## Endpoints

### Health

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `GET` | `/health` | Public | Liveness (ADR-0014) | `200` | `{ "status": "ok" }`. |

### Health profile

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `GET` | `/pets/{petId}/health-profile` | Pet’s Owner or Activity Manager | [PHS-FR-001](./pet-health-service.md#phs-fr-001--get-health-profile) | `200` | Always exists for an existing Pet. Activity Manager reads latest weight here. Allowed when the Pet is deactivated. |
| `PUT` | `/pets/{petId}/health-profile/recommended-daily-kilocalories-override` | Pet’s Owner | [PHS-FR-006](./pet-health-service.md#phs-fr-006--override-recommended-daily-kilocalories) | `200` | Body: `value`. Replaces any earlier override. Response is the Health profile. |
| `DELETE` | `/pets/{petId}/health-profile/recommended-daily-kilocalories-override` | Pet’s Owner | [PHS-FR-005](./pet-health-service.md#phs-fr-005--derive-recommended-daily-kilocalories), [PHS-FR-006](./pet-health-service.md#phs-fr-006--override-recommended-daily-kilocalories) | `200` | Derives the value again, or `null` when latest weight is empty. Succeeds unchanged when no override is in effect. Response is the Health profile. |

### Weight metrics

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/pets/{petId}/weight-metrics` | Pet’s Owner | [PHS-FR-002](./pet-health-service.md#phs-fr-002--record-weight) | `201` | Body: `weightKg`, `timestamp`. Recomputes latest weight and, without an override, recommended daily kilocalories. |
| `GET` | `/pets/{petId}/weight-metrics` | Pet’s Owner | [PHS-FR-003](./pet-health-service.md#phs-fr-003--list--get-weight-health-metrics) | `200` | Optional `from`, `to`. |
| `GET` | `/weight-metrics/{metricId}` | Pet’s Owner | [PHS-FR-003](./pet-health-service.md#phs-fr-003--list--get-weight-health-metrics) | `200` | |
| `PATCH` | `/weight-metrics/{metricId}` | Pet’s Owner | [PHS-FR-004](./pet-health-service.md#phs-fr-004--correct-or-delete-a-weight-health-metric) | `200` | `weightKg`, `timestamp`. Same recompute as record. |
| `DELETE` | `/weight-metrics/{metricId}` | Pet’s Owner | [PHS-FR-004](./pet-health-service.md#phs-fr-004--correct-or-delete-a-weight-health-metric) | `204` | Hard delete. Same recompute as record. |

### Calories-consumed metrics

Read-only. Meals are the only write path ([PHS-FR-017](./pet-health-service.md#phs-fr-017--read-calories-consumed-health-metrics)).

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `GET` | `/pets/{petId}/calories-consumed-metrics` | Pet’s Owner | [PHS-FR-017](./pet-health-service.md#phs-fr-017--read-calories-consumed-health-metrics) | `200` | Optional `from`, `to`. |
| `GET` | `/calories-consumed-metrics/{mealId}` | Pet’s Owner | [PHS-FR-017](./pet-health-service.md#phs-fr-017--read-calories-consumed-health-metrics) | `200` | The metric id is the Meal id. |

### Activity-duration metrics

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `GET` | `/pets/{petId}/activity-duration-metrics` | Pet’s Owner | [PHS-FR-016](./pet-health-service.md#phs-fr-016--sync-activity-duration-health-metric) | `200` | Optional `from`, `to`. |
| `GET` | `/activity-duration-metrics/{activityId}` | Pet’s Owner | [PHS-FR-016](./pet-health-service.md#phs-fr-016--sync-activity-duration-health-metric) | `200` | The metric id is the Activity id. |
| `PUT` | `/activity-duration-metrics/{activityId}` | Activity Manager | [PHS-FR-016](./pet-health-service.md#phs-fr-016--sync-activity-duration-health-metric) | `201` or `200` | Body: `petId`, `durationMinutes`, `timestamp` (the Activity’s). `201` on create, `200` on correct, so a retry is safe. A different `petId` than the stored one is `409` `conflict`. Missing Pet `404`, deactivated Pet `409` `pet-deactivated`. |
| `DELETE` | `/activity-duration-metrics/{activityId}` | Activity Manager | [PHS-FR-016](./pet-health-service.md#phs-fr-016--sync-activity-duration-health-metric) | `204` | Hard delete. Succeeds when the Pet is deactivated. No metric for the Activity is `404`. |

### Meals

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/pets/{petId}/meals` | Pet’s Owner | [PHS-FR-007](./pet-health-service.md#phs-fr-007--create-meal) | `201` | Body: `foodName`, `kilocalories`, `timestamp`; optional `brand`, `labels`, `notes`. Creates the calories-consumed Health metric. |
| `GET` | `/pets/{petId}/meals` | Pet’s Owner | [PHS-FR-008](./pet-health-service.md#phs-fr-008--get--list--update--delete-meal) | `200` | Optional `from`, `to`. |
| `GET` | `/meals/{mealId}` | Pet’s Owner | [PHS-FR-008](./pet-health-service.md#phs-fr-008--get--list--update--delete-meal) | `200` | |
| `PATCH` | `/meals/{mealId}` | Pet’s Owner | [PHS-FR-008](./pet-health-service.md#phs-fr-008--get--list--update--delete-meal) | `200` | Any Meal field. Corrects the calories-consumed Health metric. |
| `DELETE` | `/meals/{mealId}` | Pet’s Owner | [PHS-FR-008](./pet-health-service.md#phs-fr-008--get--list--update--delete-meal) | `204` | Hard delete, with its calories-consumed Health metric. |
| `GET` | `/pets/{petId}/kilocalories-eaten` | Pet’s Owner | [PHS-FR-009](./pet-health-service.md#phs-fr-009--get-kilocalories-eaten) | `200` | `from` and `to` required, both inclusive. `{ "from", "to", "kilocalories" }`; `0` for an empty range. |

### Washes

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/pets/{petId}/washes` | Pet’s Owner | [PHS-FR-011](./pet-health-service.md#phs-fr-011--add--list--update--delete-wash) | `201` | Body: `timestamp`; optional `notes`. Allowed with no Wash schedule. |
| `GET` | `/pets/{petId}/washes` | Pet’s Owner | [PHS-FR-011](./pet-health-service.md#phs-fr-011--add--list--update--delete-wash) | `200` | Optional `from`, `to`. |
| `GET` | `/washes/{washId}` | Pet’s Owner | [PHS-FR-011](./pet-health-service.md#phs-fr-011--add--list--update--delete-wash) | `200` | |
| `PATCH` | `/washes/{washId}` | Pet’s Owner | [PHS-FR-011](./pet-health-service.md#phs-fr-011--add--list--update--delete-wash) | `200` | `timestamp`, `notes`. `null` clears `notes`. |
| `DELETE` | `/washes/{washId}` | Pet’s Owner | [PHS-FR-011](./pet-health-service.md#phs-fr-011--add--list--update--delete-wash) | `204` | Hard delete. |

### Wash schedule

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `PUT` | `/pets/{petId}/wash-schedule` | Pet’s Owner | [PHS-FR-010](./pet-health-service.md#phs-fr-010--set-wash-schedule) | `201` | Body: `startDate`, `intervalDays`. `startDate` on or after the current UTC date. An existing schedule is `409` `conflict`. |
| `GET` | `/pets/{petId}/wash-schedule` | Pet’s Owner | [PHS-FR-010](./pet-health-service.md#phs-fr-010--set-wash-schedule) | `200` | No schedule is `404`. |
| `PATCH` | `/pets/{petId}/wash-schedule` | Pet’s Owner | [PHS-FR-010](./pet-health-service.md#phs-fr-010--set-wash-schedule) | `200` | `startDate`, `intervalDays`. `startDate` is checked only when sent and becomes the new anchor. No schedule is `404`. |
| `DELETE` | `/pets/{petId}/wash-schedule` | Pet’s Owner | [PHS-FR-010](./pet-health-service.md#phs-fr-010--set-wash-schedule) | `204` | Hard delete. Washes remain. No schedule is `404`. |
| `GET` | `/pets/{petId}/wash-schedule/next-due` | Pet’s Owner | [PHS-FR-012](./pet-health-service.md#phs-fr-012--get-next-appointed-wash) | `200` | `{ "status": "scheduled", "nextDue": "YYYY-MM-DD" }` or `{ "status": "not-scheduled" }`. Never `404` for a missing schedule. |

### Medical record

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `GET` | `/pets/{petId}/medical-record` | Pet’s Owner | [PHS-FR-013](./pet-health-service.md#phs-fr-013--get-medical-record) | `200` | `{ "petId", "vetVisits", "medications" }`. Vet visits `visitedAt` descending, Medications `startDate` descending. No filters. No write routes. |

### Vet visits

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/pets/{petId}/vet-visits` | Pet’s Owner | [PHS-FR-014](./pet-health-service.md#phs-fr-014--create--get--list--update--delete-vet-visit) | `201` | Body: `visitedAt`, `clinicName`, `reason`. |
| `GET` | `/pets/{petId}/vet-visits` | Pet’s Owner | [PHS-FR-014](./pet-health-service.md#phs-fr-014--create--get--list--update--delete-vet-visit) | `200` | Optional `from`, `to` on `visitedAt`. |
| `GET` | `/vet-visits/{vetVisitId}` | Pet’s Owner | [PHS-FR-014](./pet-health-service.md#phs-fr-014--create--get--list--update--delete-vet-visit) | `200` | |
| `PATCH` | `/vet-visits/{vetVisitId}` | Pet’s Owner | [PHS-FR-014](./pet-health-service.md#phs-fr-014--create--get--list--update--delete-vet-visit) | `200` | Required fields cannot be cleared. |
| `DELETE` | `/vet-visits/{vetVisitId}` | Pet’s Owner | [PHS-FR-014](./pet-health-service.md#phs-fr-014--create--get--list--update--delete-vet-visit) | `204` | Hard delete. Linked Medications stay and lose `vetVisitId`. |

### Medications

| Method | Path | Auth | Requirement | Success | Notes |
| ------ | ---- | ---- | ----------- | ------- | ----- |
| `POST` | `/pets/{petId}/medications` | Pet’s Owner | [PHS-FR-015](./pet-health-service.md#phs-fr-015--create--get--list--update--delete-medication) | `201` | Body: `drugName`, `dosageInstructions`, `startDate`; optional `endDate`, `vetVisitId`. |
| `GET` | `/pets/{petId}/medications` | Pet’s Owner | [PHS-FR-015](./pet-health-service.md#phs-fr-015--create--get--list--update--delete-medication) | `200` | `startDate` descending. No filters. |
| `GET` | `/medications/{medicationId}` | Pet’s Owner | [PHS-FR-015](./pet-health-service.md#phs-fr-015--create--get--list--update--delete-medication) | `200` | |
| `PATCH` | `/medications/{medicationId}` | Pet’s Owner | [PHS-FR-015](./pet-health-service.md#phs-fr-015--create--get--list--update--delete-medication) | `200` | `null` clears `endDate` or `vetVisitId`. |
| `DELETE` | `/medications/{medicationId}` | Pet’s Owner | [PHS-FR-015](./pet-health-service.md#phs-fr-015--create--get--list--update--delete-medication) | `204` | Hard delete. |

## Contract artifacts

- OpenAPI 3.1: [`postman/specs/pet-health-service/openapi.yaml`](../../postman/specs/pet-health-service/openapi.yaml)
- Postman collection (v3): [`postman/collections/Pet Health Service/`](../../postman/collections/Pet%20Health%20Service/)
- Local environment: [`postman/environments/Pet Health Service Local.environment.yaml`](../../postman/environments/Pet%20Health%20Service%20Local.environment.yaml) (`baseUrl` defaults to `http://localhost:3002`)

Import or open the local Postman project from this repo. Use the **Pet Health Service Local** environment. Set `ownerAccessToken` for Owner routes and `platformAccessToken` (an `activity-manager` platform JWT) for the activity-duration `PUT` and `DELETE`. Do not push to a Postman cloud workspace unless explicitly requested.

## Out of scope for this API doc

- The resting-energy formula and the species multipliers (service configuration).
- Pagination of lists.
