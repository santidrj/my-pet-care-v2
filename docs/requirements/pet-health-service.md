# Pet Health Service — Requirements

## Purpose

This document defines the requirements for the **Pet Health Service** of the My Pet Care platform. It captures what the service must do so developers and agents can implement and verify behavior consistently.

This version covers **functional requirements** and an initial set of **non-functional requirements**. Further NFRs and additional requirement details may be added later.

## Scope

### In scope

- **Health profile** for a Pet: latest weight and recommended daily kilocalories
- **Health metrics** for weight (and calories consumed derived from Meals): record, read history, correct, and delete readings
- **Meals**: create, read, update, and hard-delete; sum kilocalories eaten over a from–to range
- Recommended daily kcal: compute a suggestion from weight and species, allow Owner override, explicit recalculate
- **Washes** and **Wash schedule**: log washes, set a recurring interval, read next due and wash history
- **Medical record** as a read-only view of **Vet visits** and **Medications**
- Vet visit and Medication CRUD (hard delete)
- Verifying Pet ownership via Owner & Pet Manager before Owner-facing writes
- Initial NFRs for latency and Owner data isolation

### Out of scope

- Pet and Owner identity lifecycle (owned by Owner & Pet Manager)
- **Activity type** catalog and **Activity** logs (separate service later)
- Dose-by-dose medication administration logging
- Species-based default wash intervals
- Vet visit attachments or clinical coding systems
- Authentication protocols and login flows (defined elsewhere)
- Medical advice liability / veterinary diagnosis
- Offline / client-side operation without network
- Reactivation of deactivated Pets (OPM concern)

### Domain constraints

- All data in this service is keyed by an existing **Pet** id from Owner & Pet Manager
- Each Pet is managed by exactly one Owner; this service does not redefine ownership
- **Meals** are the write path for the calories-consumed **Health metric**
- **Medical record** is not a separately authored entity; it is the Pet’s Vet visits and Medications together
- **Medication** is a treatment **course**, optionally linked to a Vet visit
- **Wash schedule** is a recurring interval set by the Owner; “next due” is undefined until an interval is set
- Deletes of Meal, Wash, Vet visit, and Medication are **hard** deletes
- Health profile latest weight equals the latest remaining weight Health metric for that Pet (or absent if none)

## Key actors

| Actor | Description |
| ----- | ----------- |
| **Owner** | The person who manages the Pet. Creates and maintains that Pet’s health data in this service. |
| **Owner & Pet Manager** | Platform service that owns Pet/Owner identity and answers ownership and Pet detail lookups (including species and active/deactivated status). |

## Functional requirements

### PHS-FR-001 — Get Health profile

**Description:** The service returns the Health profile for a Pet (latest weight and recommended daily kilocalories).

**Acceptance criteria:**

1. The Pet’s Owner can retrieve the Health profile by Pet id.
2. The profile includes the latest weight when at least one non-deleted weight Health metric exists; otherwise weight is absent/empty in a documented way.
3. The profile includes recommended daily kilocalories when one has been computed or set; otherwise that value is absent/empty in a documented way.
4. Retrieval fails if the caller is not the Pet’s Owner.
5. Retrieval of a non-existent Pet fails in a way distinguishable from success.
6. Retrieval remains allowed when the Pet is deactivated in Owner & Pet Manager.

### PHS-FR-002 — Record weight

**Description:** The Owner records a weight reading for a Pet. The service appends a weight Health metric and updates the Health profile’s latest weight.

**Acceptance criteria:**

1. The Pet’s Owner can record a weight with a **value** and **timestamp**.
2. On success, a weight Health metric is appended and the Health profile’s latest weight equals that value.
3. Record fails if the caller is not the Pet’s Owner.
4. Record fails if the Pet does not exist or is deactivated in Owner & Pet Manager.
5. Record fails if value or timestamp is missing or invalid.
6. There is no separate “edit profile weight without history” path.

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

1. The Pet’s Owner can update (correct) an existing weight Health metric’s value and/or timestamp.
2. The Pet’s Owner can delete an existing weight Health metric.
3. After correct or delete, the Health profile’s latest weight equals the latest remaining weight metric by timestamp (or is absent if none remain).
4. Correct/delete fails if the caller is not the Pet’s Owner.
5. Correct/delete fails if the Pet is deactivated.
6. Correct/delete of a non-existent metric fails.

### PHS-FR-005 — Compute or recalculate recommended daily kcal

**Description:** The service computes a suggested recommended daily kilocalories from the Pet’s current weight and species (from Owner & Pet Manager), using a simple RER-style calculation times a species multiplier. Multipliers are service-configured defaults.

**Acceptance criteria:**

1. When no Owner override is in effect, the Pet’s Owner can request compute/recalculate; the Health profile’s recommended daily kcal is set to the computed suggestion.
2. Computation uses current profile weight and the Pet’s species from Owner & Pet Manager.
3. Computation fails if weight is absent, or if Pet/species cannot be resolved.
4. Computation fails if the caller is not the Pet’s Owner or the Pet is deactivated.
5. Breed, age, and neutered status are not inputs in this requirements version.
6. Recording a new weight does **not** by itself overwrite an Owner override (see PHS-FR-006).

### PHS-FR-006 — Override recommended daily kcal

**Description:** The Owner sets recommended daily kilocalories manually. The override remains until the Owner explicitly recalculates (PHS-FR-005).

**Acceptance criteria:**

1. The Pet’s Owner can set recommended daily kcal to a positive value they choose.
2. After override, get Health profile returns that value.
3. Subsequent weight recordings do not change the overridden recommended daily kcal.
4. Explicit recalculate (PHS-FR-005) replaces the override with a freshly computed suggestion.
5. Override fails if the caller is not the Pet’s Owner or the Pet is deactivated.

### PHS-FR-007 — Create Meal

**Description:** The Owner logs a Meal for a Pet.

**Acceptance criteria:**

1. The Pet’s Owner can create a Meal with required **food name**, **kilocalories**, and **timestamp**.
2. **Brand**, **labels** (list of short free-text tags), and **notes** may be omitted.
3. Create fails if any required field is missing or kilocalories are invalid.
4. Create fails if the caller is not the Pet’s Owner or the Pet is deactivated.
5. On success, the Meal can be retrieved by id and is included in kcal-eaten aggregates for ranges covering its timestamp.

### PHS-FR-008 — Get / list / update / delete Meal

**Description:** The Owner reads, updates, or hard-deletes Meals for a Pet.

**Acceptance criteria:**

1. The Pet’s Owner can get a Meal by id and list Meals for a Pet (optionally filtered by from–to time range).
2. The Pet’s Owner can update a Meal’s food name, kilocalories, timestamp, brand, labels, and notes.
3. The Pet’s Owner can hard-delete a Meal; afterward it is not retrievable and not included in kcal aggregates.
4. Operations fail if the caller is not the Pet’s Owner.
5. Writes fail if the Pet is deactivated; reads remain allowed when the Pet is deactivated.
6. Operations on a non-existent Meal fail in a way distinguishable from success.

### PHS-FR-009 — Get kilocalories eaten

**Description:** The service returns the sum of Meal kilocalories for a Pet over a caller-supplied from–to range.

**Acceptance criteria:**

1. The Pet’s Owner can request kcal eaten with a **from** and **to** timestamp range.
2. The result is the sum of kilocalories of Meals whose timestamps fall in that range (inclusive/exclusive bounds documented and consistent).
3. An empty range result is zero (not an error) when the Pet exists and the caller is allowed.
4. The request fails if from/to are missing or invalid (e.g. from after to).
5. The request fails if the caller is not the Pet’s Owner.
6. “Today” is not a special server mode; clients pass an explicit range.

### PHS-FR-010 — Set Wash schedule

**Description:** The Owner sets the recurring Wash interval for a Pet.

**Acceptance criteria:**

1. The Pet’s Owner can set a positive recurring interval (unit documented, e.g. days).
2. Until an interval is set, “next appointed wash” is undefined (PHS-FR-012 fails or returns a distinguishable “not configured” outcome).
3. The Owner can update the interval later.
4. Set/update fails if the caller is not the Pet’s Owner or the Pet is deactivated.
5. The service does not apply a species-based default interval.

### PHS-FR-011 — Add / list / update / delete Wash

**Description:** The Owner logs completed Washes and manages wash history.

**Acceptance criteria:**

1. The Pet’s Owner can add a Wash with a **timestamp** (optional notes allowed if implemented; timestamp required).
2. The Pet’s Owner can list Washes for a Pet (history) and get a Wash by id.
3. The Pet’s Owner can update or hard-delete a Wash.
4. Logging a Wash is allowed even when no Wash schedule is configured.
5. Writes fail if the caller is not the Pet’s Owner or the Pet is deactivated; reads remain allowed when deactivated.
6. Operations on a non-existent Wash fail in a way distinguishable from success.

### PHS-FR-012 — Get next appointed Wash

**Description:** The service returns when the next Wash is due: last Wash timestamp plus the configured interval (or a documented starting point if a schedule exists but no Wash has been logged yet).

**Acceptance criteria:**

1. When a Wash schedule is configured and at least one Wash exists, next due = latest Wash timestamp + interval.
2. When a Wash schedule is configured and no Wash exists yet, behavior is documented and consistent (e.g. next due = schedule-set time + interval, or “due now”).
3. When no Wash schedule is configured, the operation fails or returns a distinguishable “not configured” outcome.
4. Only the Pet’s Owner may request next due.
5. Request remains allowed when the Pet is deactivated.

### PHS-FR-013 — Get Medical record

**Description:** The service returns the Medical record for a Pet as its Vet visits and Medications. There is no separate Medical record create/update/delete.

**Acceptance criteria:**

1. The Pet’s Owner can retrieve the Medical record by Pet id, including the Pet’s Vet visits and Medications (or equivalent composed read).
2. There is no API to create, update, or delete a Medical record entity independent of visits and medications.
3. Retrieval fails if the caller is not the Pet’s Owner.
4. Retrieval remains allowed when the Pet is deactivated.

### PHS-FR-014 — Create / get / list / update / delete Vet visit

**Description:** The Owner manages Vet visits for a Pet.

**Acceptance criteria:**

1. The Pet’s Owner can create a Vet visit with required **date**, **time**, **clinic name**, and **reason/summary**.
2. The Pet’s Owner can get, list, update, and hard-delete Vet visits for the Pet.
3. Create/update fails if any required field is missing.
4. Writes fail if the caller is not the Pet’s Owner or the Pet is deactivated; reads remain allowed when deactivated.
5. Operations on a non-existent Vet visit fail in a way distinguishable from success.

### PHS-FR-015 — Create / get / list / update / delete Medication

**Description:** The Owner manages Medication courses for a Pet. A Medication may optionally link to a Vet visit.

**Acceptance criteria:**

1. The Pet’s Owner can create a Medication with required **drug name**, **dosage instructions**, and **start**; **end** may be omitted (ongoing).
2. An optional **Vet visit** id may be supplied; if supplied, it must belong to the same Pet.
3. A Medication may be created with no Vet visit link.
4. The Pet’s Owner can get, list, update, and hard-delete Medications for the Pet.
5. Dose-by-dose administration logging is not supported in this version.
6. Writes fail if the caller is not the Pet’s Owner or the Pet is deactivated; reads remain allowed when deactivated.
7. Operations on a non-existent Medication fail in a way distinguishable from success.
8. Create/update fails if a linked Vet visit does not exist or belongs to a different Pet.

## Non-functional requirements

### PHS-NFR-001 — Read latency

**Description:** Read and aggregate operations respond quickly under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **&lt; 500ms** for: get Health profile, list/get Health metrics, list/get Meals, get kcal eaten, list/get Washes, get next appointed Wash, get Medical record, list/get Vet visits, and list/get Medications.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### PHS-NFR-002 — Write latency

**Description:** Write and delete operations complete within a bound under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **&lt; 2s** for: record/correct/delete weight metrics, compute/override recommended kcal, Meal create/update/delete, Wash schedule set, Wash create/update/delete, Vet visit create/update/delete, and Medication create/update/delete.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### PHS-NFR-003 — Owner data isolation

**Description:** Owners cannot read or modify another Owner’s Pet health data. Ownership is established via Owner & Pet Manager.

**Acceptance criteria:**

1. An Owner cannot read Health profile, metrics, Meals, Washes, Medical record, Vet visits, or Medications for a Pet they do not own.
2. An Owner cannot create, update, or delete those resources for a Pet they do not own.
3. Before Owner-facing writes (and Owner-facing reads of Pet-scoped data), the service verifies ownership with Owner & Pet Manager (or equivalent trusted check).

### PHS-NFR-004 — Dependence on Owner & Pet Manager

**Description:** Pet existence, species, ownership, and active/deactivated status come from Owner & Pet Manager; this service does not invent Pet identity.

**Acceptance criteria:**

1. Writes that require an active Pet fail when OPM reports the Pet missing or deactivated.
2. Recommended kcal computation uses species from OPM for the Pet id.
3. This service does not create, update, or deactivate Pets or Owners.
