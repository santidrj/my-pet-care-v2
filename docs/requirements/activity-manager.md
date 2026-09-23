# Activity Manager — Requirements

## Purpose

This document defines the requirements for the **Activity Manager** service of the My Pet Care platform. It captures what the service must do so developers and agents can implement and verify behavior consistently.

This version covers **functional requirements** and an initial set of **non-functional requirements**. Further NFRs and additional requirement details may be added later.

## Goals

- Let the Owner maintain a catalog of **Activity types** and log **Activities** for their Pets.
- Let the Owner share an **Activity** inside the platform and/or out to external apps so others can see what the Pet did.

## Actors

| Actor | Description |
| ----- | ----------- |
| **Owner** | The person who manages Pets. Creates and maintains Activity types and Activities, and creates/revokes shares. |
| **Owner & Pet Manager** | Platform service that owns Pet/Owner identity and answers ownership and Pet active/deactivated lookups. |
| **Pet Health Service** | Platform service that provides the Pet’s latest weight for calorie estimation and receives activity duration **Health metric** sync from Activity writes/deletes. |
| **Recipient Owner** | Another Owner who receives an in-platform share of an Activity. |
| **Forum** | A discussion area within a Community. May be the audience of a Share. |
| **Group activity** | A planned event within a Community. May be the audience of a Share. |
| **Unauthenticated link holder** | Anyone who opens a valid external share link and can read the share snapshot until the share is revoked. |

## Scope

### In scope

- Platform-default and Owner-scoped custom **Activity types** (including GPS-capable flag and calorie factor)
- Soft-retire vs hard-delete rules for custom Activity types
- **Activity** and **GPS Activity** create, read, list, update, and hard-delete
- System calorie-burned estimate (duration × latest weight × type factor) with optional Owner override
- Sync of activity duration **Health metric** to Pet Health on Activity create/update/delete (metric value = duration in minutes)
- In-platform Share to another Owner, a Forum, or a Group activity; external share payload (link + summary); resolve and revoke shares
- Ownership checks via Owner & Pet Manager; deactivated-Pet write/read rules
- Initial NFRs for latency, Owner data isolation, and dependence on OPM / Pet Health

### Out of scope

- First-party WhatsApp / Telegram / Facebook / other vendor posting APIs
- The Community itself, and a Shared location, as Share audiences
- Media upload/storage pipelines (opaque references only)
- Automatic calorie models beyond the simple duration × weight × type-factor estimate
- Route-based calorie or Health-metric calculation
- Live tracking / streaming GPS while an Activity is in progress (only a completed route on log)
- Ownership transfer, authentication protocols, and offline-only clients
- Reactivation of deactivated Pets (OPM concern)
- Analytics dashboards, streaks, and leaderboards
- Bulk import of Activities from wearables or other apps

## Business / domain rules

- **Activity type** is the kind of physical activity (walk, frisbee play, running, …). **Activity** is a logged record that a Pet performed an Activity type at a point in time. Prefer these terms over Exercise / workout / session.
- **GPS Activity** is an Activity whose Activity type is GPS-capable; create/update requires a route/GPS payload. Non-GPS types reject or ignore route payloads.
- Custom Activity types are **Owner-scoped** (usable for all of that Owner’s Pets). Platform defaults are global and not editable or deletable by Owners.
- Deleting a custom Activity type: **hard delete** if no historical Activity references it; otherwise **soft-retire** (hidden from the pickable catalog; existing Activities still resolve label and GPS-capable flag).
- An Activity records: Pet id, Activity type, timestamp, **duration** (required), optional type-dependent **Activity amount**, calories burned, optional media references, optional notes; GPS Activities also require route/GPS.
- Activity duration **Health metric** value for an Activity is **duration in minutes**.
- Calories burned are **system-estimated** on create and when estimate inputs change; the Owner may override; override sticks until cleared.
- Calorie estimate inputs: duration, Pet latest weight from Pet Health, and the Activity type’s calorie factor. Route/distance does not affect the estimate in this version.
- Activity media are optional **opaque references**; this service does not own upload/storage.
- Activity deletes are **hard** deletes; linked Health metrics are removed/corrected; shares for that Activity become unavailable.
- Shareable unit is a **single Activity**. A Share’s audience is another Owner, a Forum, a Group activity, or anyone holding an external link. The Community itself is not an audience. An Owner who belongs to a Community may read a Share addressed to one of its Forums or Group activities. Share snapshot includes: Pet display name, Activity type label, timestamp, duration, optional notes, calories burned, optional Activity amount, media if present, and for GPS Activities the route (full route acceptable in this version).
- External share links are secret capability URLs: anyone with the link may read the snapshot until revoked.
- Owner-facing writes require verified ownership of the Pet via OPM; create/update fail if the Pet is missing or deactivated; reads of existing Activities remain allowed when the Pet is deactivated; hard delete remains allowed when deactivated.

## Constraints

- Backend service in this monorepo; clients are separate.
- Must integrate with **Owner & Pet Manager** (ownership / Pet status) and **Pet Health** (latest weight; activity duration metric sync).
- An in-platform Share to a Forum or Group activity requires that target to accept an Activity share reference; if it cannot, the Share fails closed or is feature-flagged without removing the requirement.
- External share is link + summary text only; no vendor messaging API keys or compliance scope in this version.
- GPS route payloads must be size-bounded; the service may reject oversized routes (exact limit in the spec/test plan).
- Hard delete of Activities is permanent.

## Assumptions

- Authentication of the calling Owner is handled outside this service; the service receives a trusted Owner identity.
- Pet Health exposes (or will expose) APIs for latest weight and for writing/correcting/deleting activity duration Health metrics.
- A Forum or Group activity can accept an Activity share reference for an in-platform Share.
- Clients perform OS-level external shares using the link/summary this service returns.
- Platform default Activity types are seeded by deployment/ops, not by Owners.
- “Normal load” for latency NFRs matches the same notion used in Pet Health requirements.
- The glossary uses **Activity type** for the kind of physical activity and **activity duration** for the Health metric dimension synced from an Activity.

## Functional requirements

### AM-FR-001 — List Activity types

**Description:** The service returns the Activity types available to an Owner: platform defaults plus that Owner’s custom types.

**Acceptance criteria:**

1. The Owner can list platform-default Activity types and their own custom Activity types.
2. Soft-retired custom types are excluded from the pickable catalog returned for new logs.
3. Soft-retired and active types remain resolvable by id for historical Activities and shares.
4. The list includes, for each type, at least: identity, label/name, GPS-capable flag, and calorie factor.
5. An Owner does not see another Owner’s custom Activity types.

### AM-FR-002 — Create custom Activity type

**Description:** The Owner creates an Owner-scoped custom Activity type.

**Acceptance criteria:**

1. The Owner can create a custom Activity type with a name/label, GPS-capable flag, and calorie factor.
2. On success, the type is Owner-scoped and appears in that Owner’s pickable catalog.
3. Create fails if required fields are missing or invalid.
4. Owners cannot create or modify platform-default types through this API.

### AM-FR-003 — Rename custom Activity type

**Description:** The Owner renames an active (non-retired) custom Activity type they own.

**Acceptance criteria:**

1. The Owner can rename their custom Activity type.
2. Rename fails for platform-default types.
3. Rename fails for types the Owner does not own.
4. Rename fails for soft-retired types, or is defined to only affect display going forward in a documented way; historical Activities continue to resolve a stable type identity.
5. Rename fails if the name/label is missing or invalid.

### AM-FR-004 — Delete custom Activity type

**Description:** The Owner deletes a custom Activity type: hard delete when unused, otherwise soft-retire.

**Acceptance criteria:**

1. If no historical Activity references the type, delete permanently removes it.
2. If any historical Activity references the type, delete soft-retires it: hidden from the pickable catalog; existing Activities still resolve label and GPS-capable flag.
3. Delete fails for platform-default types.
4. Delete fails for types the Owner does not own.
5. Soft-retired types cannot be selected when creating new Activities.

### AM-FR-005 — Create Activity

**Description:** The Owner logs an Activity (or GPS Activity) for a Pet they own.

**Acceptance criteria:**

1. The Owner can create an Activity with Pet id, Activity type, timestamp, duration, and optional Activity amount, notes, and media references.
2. If the Activity type is GPS-capable, create requires a route/GPS payload and the result is a GPS Activity; otherwise route is rejected or ignored and a plain Activity is stored.
3. Activity amount may be omitted; when present it follows type-dependent meaning (e.g. distance or count) without driving the Health metric in this version.
4. On success, calories burned are system-estimated from duration, Pet latest weight (Pet Health), and the type’s calorie factor.
5. On success, an activity duration Health metric equal to duration in minutes is written to Pet Health for that Pet.
6. Create fails if the caller is not the Pet’s Owner.
7. Create fails if the Pet does not exist or is deactivated in Owner & Pet Manager.
8. Create fails if the Activity type is missing, not pickable (e.g. soft-retired or not visible to the Owner), or invalid for the request.
9. Create fails if duration or timestamp is missing or invalid, or if a required GPS route is missing/invalid/oversized.
10. Media, if provided, are stored as opaque references only.

### AM-FR-006 — Get and list Activities

**Description:** The Owner retrieves Activities for a Pet they own, including time-range filtered lists.

**Acceptance criteria:**

1. The Pet’s Owner can get an Activity by id.
2. The Pet’s Owner can list Activities for a Pet, with at least a from–to time range filter.
3. GPS Activities include their route/GPS payload in Owner reads.
4. Get/list fail if the caller is not the Pet’s Owner (except via share resolution — see AM-FR-012).
5. Get/list of a non-existent Activity or Pet fail in a way distinguishable from success.
6. Read remains allowed when the Pet is deactivated in Owner & Pet Manager.

### AM-FR-007 — Update Activity

**Description:** The Owner updates an existing Activity for a Pet they own.

**Acceptance criteria:**

1. The Pet’s Owner can update permitted fields (timestamp, duration, Activity amount, notes, media references, route for GPS Activities, Activity type when valid).
2. Changing to or from a GPS-capable type enforces GPS Activity route rules (require route when GPS-capable; reject/ignore when not).
3. If estimate inputs change and no Owner calorie override is set, calories burned are re-estimated.
4. If an Owner calorie override is set, it remains until cleared (see AM-FR-008).
5. On success, the activity duration Health metric in Pet Health is corrected to match the new duration in minutes.
6. Update fails if the caller is not the Pet’s Owner.
7. Update fails if the Pet does not exist or is deactivated in Owner & Pet Manager.
8. Update fails if the Activity does not exist or validation fails (including oversized/invalid GPS route).

### AM-FR-008 — Override or clear calories burned

**Description:** The Owner overrides the system calorie estimate on an Activity, or clears the override to restore the estimate.

**Acceptance criteria:**

1. The Pet’s Owner can set an explicit calories-burned value on an Activity (override).
2. The Pet’s Owner can clear the override; the service re-estimates from current duration, latest weight, and type factor.
3. While an override is set, create/update paths that would re-estimate do not replace the overridden value.
4. Override/clear fails if the caller is not the Pet’s Owner or the Activity does not exist.
5. Override/clear fails if the Pet is deactivated (writes) per AM ownership rules; reads of the stored value remain allowed when deactivated.

### AM-FR-009 — Hard-delete Activity

**Description:** The Owner permanently deletes an Activity.

**Acceptance criteria:**

1. The Pet’s Owner can hard-delete an Activity.
2. On success, the corresponding activity duration Health metric is removed or corrected in Pet Health.
3. On success, shares of that Activity become unavailable / resolve as no longer available.
4. Delete fails if the caller is not the Pet’s Owner.
5. Delete remains allowed when the Pet is deactivated.
6. Delete of a non-existent Activity fails in a way distinguishable from success.

### AM-FR-010 — Share Activity to another Owner

**Description:** The Owner creates an in-platform share of one Activity to a recipient Owner.

**Acceptance criteria:**

1. The Pet’s Owner can share a single existing Activity to another Owner by recipient identity.
2. On success, the recipient can resolve the share under share-visibility rules (AM-FR-012).
3. Share fails if the caller is not the Pet’s Owner or the Activity does not exist.
4. Share fails if the recipient Owner does not exist or is invalid.
5. The share snapshot includes the fields defined in domain rules (including media and GPS route when present).

### AM-FR-011 — Share Activity to a Forum or Group activity

**Description:** The Owner creates an in-platform Share of one Activity to a Forum or a Group activity.

**Acceptance criteria:**

1. The Pet’s Owner can share a single existing Activity to a Forum or a Group activity.
2. On success, that Forum or Group activity can present the Share under share-visibility rules.
3. Share fails if the caller is not the Pet’s Owner or the Activity does not exist.
4. Share fails closed (or is unavailable) if the Forum or Group activity does not exist or cannot accept the share reference.
5. The Community itself and a Shared location are not valid audiences.

### AM-FR-012 — Create external share and resolve shares

**Description:** The Owner obtains an external share payload (link + summary). Recipients and link holders resolve a shared Activity snapshot.

**Acceptance criteria:**

1. The Pet’s Owner can create an external share for one Activity and receive a link plus summary text suitable for client OS sharing.
2. Anyone with a valid external share link can read the share snapshot without authentication.
3. A recipient Owner can resolve an in-platform Owner share while authenticated as that recipient.
4. Shares addressed to a Forum or a Group activity are resolvable to Owners who belong to the Community that contains that Forum or Group activity.
5. Resolved snapshots include: Pet display name, Activity type label, timestamp, duration, optional notes, calories burned, optional Activity amount, media if present, and route for GPS Activities.
6. Resolve fails in a documented “no longer available” way when the Activity was deleted or the share was revoked.
7. This service does not post to WhatsApp, Telegram, Facebook, or other vendor APIs.

### AM-FR-013 — Revoke share

**Description:** The Owner revokes a previously created share of an Activity.

**Acceptance criteria:**

1. The Pet’s Owner can revoke an in-platform Owner Share, a Forum Share, a Group activity Share, or an external Share they created for that Activity.
2. After revoke, resolve/view of that share fails as no longer available (including external capability URLs).
3. Revoke fails if the caller is not the Pet’s Owner or the share does not exist.
4. Revoking one share does not by itself delete the Activity.

## Quality attributes (NFRs)

### AM-NFR-001 — Read latency

**Description:** Read and resolve operations respond quickly under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **&lt; 500ms** for: list/get Activity types, get/list Activities, and resolve share snapshot.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### AM-NFR-002 — Write latency

**Description:** Write and delete operations complete within a bound under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **&lt; 2s** for: Activity type create/rename/delete, Activity create/update/delete, calorie override/clear, share create/revoke, and paths that re-estimate calories.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### AM-NFR-003 — Owner data isolation

**Description:** Owners cannot read or modify another Owner’s Activities or custom Activity types except through an intentional share.

**Acceptance criteria:**

1. An Owner cannot list, get, create, update, or delete Activities for a Pet they do not own, except by resolving a Share addressed to them or to a Forum or Group activity in a Community they belong to.
2. An Owner cannot read or modify another Owner’s custom Activity types.
3. Unauthenticated link holders can only read the snapshot for a valid, non-revoked external share link — not arbitrary Activities.
4. Before Owner-facing writes (and Owner-facing reads of Pet-scoped Activity data), the service verifies ownership with Owner & Pet Manager (or equivalent trusted check).

### AM-NFR-004 — Dependence on Owner & Pet Manager

**Description:** Pet existence, ownership, and active/deactivated status come from Owner & Pet Manager; this service does not invent Pet identity.

**Acceptance criteria:**

1. Writes that require an active Pet fail when OPM reports the Pet missing or deactivated.
2. This service does not create, update, or deactivate Pets or Owners.

### AM-NFR-005 — Dependence on Pet Health Service

**Description:** Latest weight for calorie estimation and activity duration Health metric persistence depend on Pet Health.

**Acceptance criteria:**

1. Calorie estimation uses the Pet’s latest weight from Pet Health when available; behavior when weight is absent is documented and deterministic (estimate fails or uses a documented fallback).
2. Activity create/update/delete syncs the activity duration Health metric (duration in minutes) to Pet Health.
3. This service does not own Health profile or other Health metric dimensions beyond that sync contract.
