# Pet Health Service — Requirements

## Purpose

This document defines the requirements for the **Pet Health Service** of the My Pet Care platform. It states what the service must do so developers and agents can implement and verify behavior.

## Goals

- An Owner can track a Pet’s weight, Meals, Washes, and Medical record.
- An Owner can see recommended daily kilocalories and the kilocalories that Pet has eaten.
- This service keeps Health metric history for weight, calories consumed, and activity duration. Activity Manager writes the activity-duration readings.

## Actors

| Actor | Description |
| ----- | ----------- |
| **Owner** | The person who manages the Pet. Creates and maintains that Pet’s health data in this service. |
| **Owner & Pet Manager** | Platform service that owns Pet and Owner identity and answers ownership, species, and active or deactivated status. |
| **Activity Manager** | Platform service that creates, corrects, and deletes activity-duration Health metrics when an Activity is created, updated, or hard-deleted. |

## Scope

### In scope

- **Health profile** for a Pet: latest weight and recommended daily kilocalories
- **Health metrics** for weight, calories consumed, and activity duration: record, read history, correct, and delete readings
- **Meals** as the only write path for calories-consumed Health metrics, including the kilocalories-eaten sum over a from–to range
- Recommended daily kilocalories: compute a suggestion from weight and species, allow an Owner override, and explicit recalculate
- **Washes** and **Wash schedule**: log washes, set a start date and a recurring interval in days, and read next due and wash history
- **Medical record** as a read-only view of **Vet visits** and **Medications**
- Vet visit and Medication create, read, update, and hard-delete
- Activity-duration Health metrics written by Activity Manager
- Verifying Pet ownership and Pet status via Owner & Pet Manager before Owner-facing writes
- Quality attributes for latency, Owner data isolation, and dependence on Owner & Pet Manager

### Out of scope

- Pet and Owner identity lifecycle (owned by Owner & Pet Manager)
- **Activity type** catalog and **Activity** logs (owned by Activity Manager)
- Dose-by-dose medication administration logging
- Species-based default wash intervals
- Vet visit attachments or clinical coding systems
- Authentication protocols and login flows
- Medical advice liability and veterinary diagnosis
- Offline or client-side operation without a network
- Reactivation of deactivated Pets

## Business / domain rules

- All data in this service is keyed by an existing Pet id from Owner & Pet Manager. This service does not redefine ownership.
- The Health profile’s latest weight equals the latest remaining weight Health metric by timestamp, or is empty when none remain.
- Recommended daily kilocalories and latest weight are always present on the Health profile. Each is empty when it has not been set.
- A weight value must be greater than zero. Meal kilocalories must be zero or greater.
- **Meals** are the only write path for the calories-consumed Health metric. The metric’s value is the Meal’s kilocalories and its timestamp is the Meal’s timestamp.
- Kilocalories eaten over a from–to range includes Meals at both ends. `from` equal to `to` counts Meals at that timestamp.
- Each Activity has one activity-duration Health metric. The value is duration in minutes and the timestamp is the Activity’s timestamp.
- **Medical record** is not a separately authored entity. It is the Pet’s Vet visits and Medications together.
- **Medication** is a treatment course, optionally linked to a Vet visit for the same Pet.
- A **Wash schedule** has a start date and a positive interval in whole days. On create and on a later start-date change, the start date must be on or after the current date.
- Next due is the start date while no Wash has a timestamp on or after that start date. Once such a Wash exists, next due is the latest of those timestamps plus the interval. Washes before the start date do not move next due.
- Deletes of a Meal, Wash, Vet visit, and Medication are hard deletes. Deleting a Meal deletes its calories-consumed Health metric.

## Constraints

- This backend service does not own Owner or Pet identity, Activities, or Community data. Clients are separate.
- Pet existence, species, ownership, and active or deactivated status come from Owner & Pet Manager.
- Activity Manager is the only writer of activity-duration Health metrics. The Owner cannot author those readings here.
- Create and update of an activity-duration metric fail when the Pet is missing or deactivated. Hard-delete of that metric still succeeds when the Pet is deactivated.
- Recommended daily kilocalories use current profile weight and species, with service-configured species multipliers. Breed, age, and neutered status are not inputs.
- Password handling, photo storage, and encryption at rest are outside this service.

## Assumptions

- Login and credential checks happen outside this service. Pet Health Service receives a trusted Owner identity on Owner-facing calls, and it can tell those calls apart from trusted calls by Activity Manager. It does not implement login.

## Functional requirements

### PHS-FR-001 — Get Health profile

**Description:** The service returns the Health profile for a Pet (latest weight and recommended daily kilocalories).

**Acceptance criteria:**

1. The Pet’s Owner can retrieve the Health profile by Pet id.
2. The profile always includes latest weight. The value equals the latest remaining weight Health metric by timestamp, and is empty when none remain.
3. The profile always includes recommended daily kilocalories. The value is the computed or overridden amount, and is empty when neither has been set.
4. Retrieval fails if the caller is not the Pet’s Owner.
5. Retrieval of a non-existent Pet fails in a way distinguishable from success.
6. Retrieval remains allowed when the Pet is deactivated in Owner & Pet Manager.

### PHS-FR-002 — Record weight

**Description:** The Owner records a weight reading for a Pet. The service appends a weight Health metric and updates the Health profile’s latest weight.

**Acceptance criteria:**

1. The Pet’s Owner can record a weight with a **value** and **timestamp**.
2. The value must be greater than zero. A missing or invalid timestamp fails.
3. On success, a weight Health metric is appended and the Health profile’s latest weight equals that value.
4. Record fails if the caller is not the Pet’s Owner.
5. Record fails if the Pet does not exist or is deactivated in Owner & Pet Manager.
6. There is no separate edit-profile-weight path that skips history.

### PHS-FR-003 — List / get weight Health metrics

**Description:** The Owner reads weight Health metric history for a Pet.

**Acceptance criteria:**

1. The Pet’s Owner can list weight Health metrics for a Pet, optionally filtered by a from–to time range.
2. The Pet’s Owner can retrieve a single weight Health metric by id.
3. Reads fail if the caller is not the Pet’s Owner.
4. Reads fail for a non-existent Pet in a way distinguishable from an empty history.
5. Reads remain allowed when the Pet is deactivated.

### PHS-FR-004 — Correct or delete a weight Health metric

**Description:** The Owner corrects or deletes a weight Health metric. The Health profile’s latest weight is recomputed from remaining metrics.

**Acceptance criteria:**

1. The Pet’s Owner can update an existing weight Health metric’s value and timestamp.
2. A corrected value must be greater than zero. A missing or invalid timestamp fails.
3. The Pet’s Owner can delete an existing weight Health metric.
4. After correct or delete, the Health profile’s latest weight equals the latest remaining weight metric by timestamp, or is empty if none remain.
5. Correct or delete fails if the caller is not the Pet’s Owner.
6. Correct or delete fails if the Pet is deactivated.
7. Correct or delete of a non-existent metric fails.

### PHS-FR-005 — Compute or recalculate recommended daily kilocalories

**Description:** The service computes a suggested recommended daily kilocalories from the Pet’s current weight and species, using a simple resting-energy calculation times a service-configured species multiplier.

**Acceptance criteria:**

1. When no Owner override is in effect, the Pet’s Owner can request compute or recalculate. The Health profile’s recommended daily kilocalories is set to the computed suggestion.
2. Computation uses current profile weight and the Pet’s species from Owner & Pet Manager.
3. Computation fails if weight is empty, or if the Pet or species cannot be resolved.
4. Computation fails if the caller is not the Pet’s Owner or the Pet is deactivated.
5. Breed, age, and neutered status are not inputs.
6. Recording a new weight does not by itself overwrite an Owner override (see PHS-FR-006).

### PHS-FR-006 — Override recommended daily kilocalories

**Description:** The Owner sets recommended daily kilocalories manually. The override remains until the Owner explicitly recalculates (PHS-FR-005).

**Acceptance criteria:**

1. The Pet’s Owner can set recommended daily kilocalories to a value greater than zero.
2. After override, get Health profile returns that value.
3. Subsequent weight recordings do not change the overridden recommended daily kilocalories.
4. Explicit recalculate (PHS-FR-005) replaces the override with a freshly computed suggestion.
5. Override fails if the caller is not the Pet’s Owner or the Pet is deactivated.

### PHS-FR-007 — Create Meal

**Description:** The Owner logs a Meal for a Pet. The Meal is the write path for a calories-consumed Health metric.

**Acceptance criteria:**

1. The Pet’s Owner can create a Meal with required **food name**, **kilocalories**, and **timestamp**.
2. Kilocalories must be zero or greater. A missing or invalid timestamp fails.
3. **Brand**, **labels** (a list of short free-text tags), and **notes** may be omitted.
4. Create fails if the caller is not the Pet’s Owner or the Pet is deactivated.
5. On success, the Meal can be retrieved by id, a calories-consumed Health metric exists with that kilocalories value and timestamp, and the Meal is included in kilocalories-eaten aggregates for ranges covering its timestamp.

### PHS-FR-008 — Get / list / update / delete Meal

**Description:** The Owner reads, updates, or hard-deletes Meals for a Pet. Updating or deleting a Meal corrects or deletes its calories-consumed Health metric.

**Acceptance criteria:**

1. The Pet’s Owner can get a Meal by id and list Meals for a Pet, optionally filtered by a from–to time range.
2. The Pet’s Owner can update a Meal’s food name, kilocalories, timestamp, brand, labels, and notes. Updated kilocalories must be zero or greater.
3. On update, the linked calories-consumed Health metric takes the Meal’s kilocalories and timestamp.
4. The Pet’s Owner can hard-delete a Meal. Afterward the Meal is not retrievable, it is not included in kilocalories aggregates, and its calories-consumed Health metric is gone.
5. Operations fail if the caller is not the Pet’s Owner.
6. Writes fail if the Pet is deactivated. Reads remain allowed when the Pet is deactivated.
7. Operations on a non-existent Meal fail in a way distinguishable from success.

### PHS-FR-009 — Get kilocalories eaten

**Description:** The service returns the sum of Meal kilocalories for a Pet over a caller-supplied from–to range.

**Acceptance criteria:**

1. The Pet’s Owner can request kilocalories eaten with a **from** and **to** timestamp.
2. Both ends are inclusive. A Meal timestamp equal to `from` or `to` counts. `from` equal to `to` counts Meals at that timestamp.
3. An empty range result is zero, not an error, when the Pet exists and the caller is allowed.
4. The request fails if `from` or `to` is missing or invalid, including when `from` is after `to`.
5. The request fails if the caller is not the Pet’s Owner.
6. The service has no special “today” mode. Clients pass an explicit range.
7. The request remains allowed when the Pet is deactivated.

### PHS-FR-010 — Set Wash schedule

**Description:** The Owner sets the Wash schedule for a Pet: a start date and a recurring interval in days.

**Acceptance criteria:**

1. The Pet’s Owner can set a start date and a positive whole-number interval in days.
2. On a new schedule, the start date must be on or after the current date. An earlier start date fails.
3. Until a schedule is set, next due is not defined (PHS-FR-012 returns not due).
4. The Owner can later change the interval, and can replace the start date with a date on or after the current date. An earlier replacement fails.
5. The replacement start date becomes the anchor. Washes before it do not move next due.
6. Set or update fails if the caller is not the Pet’s Owner or the Pet is deactivated.
7. The service does not apply a species-based default interval.

### PHS-FR-011 — Add / list / update / delete Wash

**Description:** The Owner logs completed Washes and manages wash history.

**Acceptance criteria:**

1. The Pet’s Owner can add a Wash with a required **timestamp**. **Notes** may be omitted.
2. The Pet’s Owner can list Washes for a Pet and get a Wash by id.
3. The Pet’s Owner can update a Wash’s timestamp and notes, including clearing notes, or hard-delete a Wash.
4. Logging a Wash is allowed when no Wash schedule is configured.
5. Writes fail if the caller is not the Pet’s Owner or the Pet is deactivated. Reads remain allowed when the Pet is deactivated.
6. Operations on a non-existent Wash fail in a way distinguishable from success.

### PHS-FR-012 — Get next appointed Wash

**Description:** The service returns when the next Wash is due from the Wash schedule anchor and later Washes.

**Acceptance criteria:**

1. When a Wash schedule is configured and no Wash has a timestamp on or after the start date, next due is the start date.
2. When at least one Wash has a timestamp on or after the start date, next due is the latest of those timestamps plus the interval in days.
3. Washes timestamped before the start date do not change next due.
4. When no Wash schedule is configured, the call returns a distinguishable not-due outcome.
5. Only the Pet’s Owner may request next due.
6. The request remains allowed when the Pet is deactivated.

### PHS-FR-013 — Get Medical record

**Description:** The service returns the Medical record for a Pet as its Vet visits and Medications. There is no separate Medical record create, update, or delete.

**Acceptance criteria:**

1. The Pet’s Owner can retrieve the Medical record by Pet id, including the Pet’s Vet visits and Medications.
2. There is no API to create, update, or delete a Medical record entity independent of visits and medications.
3. Retrieval fails if the caller is not the Pet’s Owner.
4. Retrieval remains allowed when the Pet is deactivated.

### PHS-FR-014 — Create / get / list / update / delete Vet visit

**Description:** The Owner manages Vet visits for a Pet.

**Acceptance criteria:**

1. The Pet’s Owner can create a Vet visit with required **date**, **time**, **clinic name**, and **reason or summary**.
2. The Pet’s Owner can get, list, update, and hard-delete Vet visits for the Pet.
3. Create or update fails if any required field is missing.
4. Writes fail if the caller is not the Pet’s Owner or the Pet is deactivated. Reads remain allowed when the Pet is deactivated.
5. Operations on a non-existent Vet visit fail in a way distinguishable from success.

### PHS-FR-015 — Create / get / list / update / delete Medication

**Description:** The Owner manages Medication courses for a Pet. A Medication may optionally link to a Vet visit.

**Acceptance criteria:**

1. The Pet’s Owner can create a Medication with required **drug name**, **dosage instructions**, and **start**. **End** may be omitted.
2. An optional Vet visit id may be supplied. If supplied, it must belong to the same Pet.
3. A Medication may be created with no Vet visit link.
4. The Pet’s Owner can get, list, update, and hard-delete Medications for the Pet.
5. Dose-by-dose administration logging is not supported.
6. Writes fail if the caller is not the Pet’s Owner or the Pet is deactivated. Reads remain allowed when the Pet is deactivated.
7. Operations on a non-existent Medication fail in a way distinguishable from success.
8. Create or update fails if a linked Vet visit does not exist or belongs to a different Pet.

### PHS-FR-016 — Sync activity-duration Health metric

**Description:** Activity Manager creates, corrects, or deletes the activity-duration Health metric for one Activity. The Owner can read that history and cannot author it.

**Acceptance criteria:**

1. Activity Manager can create one activity-duration Health metric for an Activity. The value is duration in minutes and the timestamp is the Activity’s timestamp.
2. Activity Manager can correct that same metric when the Activity is updated.
3. Activity Manager can hard-delete that metric when the Activity is hard-deleted.
4. Create and update fail if the Pet does not exist or is deactivated.
5. Hard-delete of the metric succeeds when the Pet is deactivated.
6. The Pet’s Owner can list activity-duration Health metrics for a Pet and get one by id, including when the Pet is deactivated.
7. An Owner call to create, correct, or delete an activity-duration Health metric fails.
8. A call that is not from Activity Manager fails for create, correct, and delete.

### PHS-FR-017 — Read calories-consumed Health metrics

**Description:** The Owner reads calories-consumed Health metric history. Writes happen only through Meals (PHS-FR-007 and PHS-FR-008).

**Acceptance criteria:**

1. The Pet’s Owner can list calories-consumed Health metrics for a Pet, optionally filtered by a from–to time range.
2. The Pet’s Owner can retrieve a single calories-consumed Health metric by id.
3. Reads fail if the caller is not the Pet’s Owner.
4. Reads fail for a non-existent Pet in a way distinguishable from an empty history.
5. Reads remain allowed when the Pet is deactivated.
6. There is no Owner or Activity Manager operation that creates, corrects, or deletes a calories-consumed Health metric except by creating, updating, or hard-deleting its Meal.

## Quality attributes (NFRs)

### PHS-NFR-001 — Read latency

**Description:** Read and aggregate operations respond quickly under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **< 500ms** for: get Health profile, list or get Health metrics (weight, calories consumed, and activity duration), list or get Meals, get kilocalories eaten, list or get Washes, get next appointed Wash, get Medical record, list or get Vet visits, and list or get Medications.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### PHS-NFR-002 — Write latency

**Description:** Write and delete operations complete within a bound under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **< 2s** for: record, correct, or delete weight metrics; compute or override recommended kilocalories; Meal create, update, or delete; Wash schedule set; Wash create, update, or delete; Vet visit create, update, or delete; Medication create, update, or delete; and activity-duration metric create, correct, or delete.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### PHS-NFR-003 — Owner data isolation

**Description:** Owners cannot read or modify another Owner’s Pet health data. Ownership is established via Owner & Pet Manager.

**Acceptance criteria:**

1. An Owner cannot read the Health profile, Health metrics, Meals, Washes, Medical record, Vet visits, or Medications for a Pet they do not own.
2. An Owner cannot create, update, or delete those resources for a Pet they do not own.
3. Before Owner-facing writes and Owner-facing reads of Pet-scoped data, the service verifies ownership with Owner & Pet Manager.
4. Activity Manager may perform the activity-duration writes and the hard-delete defined in PHS-FR-016.

### PHS-NFR-004 — Dependence on Owner & Pet Manager

**Description:** Pet existence, species, ownership, and active or deactivated status come from Owner & Pet Manager. This service does not invent Pet identity.

**Acceptance criteria:**

1. Writes that require an active Pet fail when Owner & Pet Manager reports the Pet missing or deactivated, except the activity-duration hard-delete in PHS-FR-016.
2. Recommended kilocalories computation uses species from Owner & Pet Manager for the Pet id.
3. This service does not create, update, or deactivate Pets or Owners.
