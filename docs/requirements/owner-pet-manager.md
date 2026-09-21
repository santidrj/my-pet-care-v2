# Owner & Pet Manager — Requirements

## Purpose

This document defines the requirements for the **Owner & Pet Manager** service of the My Pet Care platform. It captures what the service must do so developers and agents can implement and verify behavior consistently.

This version covers **functional requirements** only. Non-functional requirements and additional requirement details will be added later.

## Scope

### In scope

- Owner lifecycle: create, read, update, and deactivate
- Pet lifecycle: create, read, update, and deactivate
- Owner↔Pet management: linking a Pet to exactly one Owner, listing an Owner’s Pets, and checking whether an Owner manages a Pet
- Serving other platform services that need Owner/Pet identity and ownership information

### Out of scope

- Health metrics, exercise types, activity logs, and social features (communities, forums, shared locations, group activities)
- Authentication protocols and login flows (this service stores Owner credential fields; how clients authenticate is defined elsewhere)
- Ownership transfer between Owners
- Reactivation of deactivated Owners or Pets
- Photo upload/storage pipelines (photos are optional opaque references)
- Password policy and credential hashing details (deferred to non-functional requirements)

### Domain constraints

- Each Pet is managed by **exactly one** Owner
- Creating a Pet assigns the creating Owner as that Pet’s Owner
- Deactivation is soft (records are retained and marked inactive)
- Deactivating an Owner first deactivates that Owner’s active Pets, then deactivates the Owner

## Key actors

| Actor | Description |
| ----- | ----------- |
| **Owner** | A person who manages one or more Pets. Creates and maintains their own profile and their Pets. |
| **Other platform services** | Backend services (e.g. health or exercise) that look up Owners/Pets and verify ownership before acting on a Pet. |

## Functional requirements

### OPM-FR-001 — Create Owner

**Description:** The service creates a new Owner with the required profile and credential fields.

**Acceptance criteria:**

1. An Owner can be created with **username**, **email**, and **password**.
2. **Photo** may be omitted; if provided, it is stored as an opaque reference.
3. Create fails if **username** is already used by another Owner.
4. Create fails if **email** is already used by another Owner.
5. Create fails if any required field (username, email, password) is missing.
6. On success, the Owner is active and can be retrieved by id or username.

### OPM-FR-002 — Get Owner

**Description:** The service returns an Owner by identifier or username for Owners and other platform services.

**Acceptance criteria:**

1. An Owner can be retrieved by **id**.
2. An Owner can be retrieved by **username**.
3. Retrieval of a non-existent id or username fails in a way the caller can distinguish from success.
4. A deactivated Owner can still be retrieved (callers can observe deactivated status).

### OPM-FR-003 — Update Owner

**Description:** The service updates an existing active Owner’s profile and credential fields.

**Acceptance criteria:**

1. An active Owner can update **username**, **email**, **password**, and **photo** (photo may be set, changed, or cleared).
2. Update fails if the new **username** is already used by another Owner.
3. Update fails if the new **email** is already used by another Owner.
4. Update of a non-existent Owner fails.
5. Update of a deactivated Owner fails.

### OPM-FR-004 — Deactivate Owner

**Description:** The service soft-deactivates an Owner. If the Owner has active Pets, those Pets are deactivated first, then the Owner.

**Acceptance criteria:**

1. Deactivating an Owner with no active Pets marks that Owner inactive.
2. Deactivating an Owner with one or more active Pets first deactivates each of those Pets, then deactivates the Owner.
3. Deactivation of a non-existent Owner fails.
4. Deactivation of an already deactivated Owner fails (or is a no-op that leaves the Owner deactivated — either is acceptable if documented by the implementation; callers must not observe a reactivated Owner).
5. A deactivated Owner cannot be updated (see OPM-FR-003).
6. Reactivation is not supported in this requirements version.

### OPM-FR-005 — Create Pet

**Description:** The service creates a new Pet and assigns the creating Owner as its sole Owner.

**Acceptance criteria:**

1. An active Owner can create a Pet with **name**, **species**, and **sex**.
2. **Breed**, **date of birth**, and **photo** may be omitted; if provided, photo is stored as an opaque reference.
3. **Sex** must be one of: `male`, `female`, `unknown`.
4. On success, the creating Owner is the Pet’s only Owner.
5. Create fails if the creating Owner does not exist or is deactivated.
6. Create fails if any required field (name, species, sex) is missing or sex is not an allowed value.
7. On success, the Pet is active and can be retrieved by id.

### OPM-FR-006 — Get Pet

**Description:** The service returns a Pet by id for Owners and other platform services.

**Acceptance criteria:**

1. A Pet can be retrieved by **id**.
2. Retrieval of a non-existent id fails in a way the caller can distinguish from success.
3. A deactivated Pet can still be retrieved (callers can observe deactivated status).
4. The response identifies the Pet’s Owner.

### OPM-FR-007 — Update Pet

**Description:** The service updates an existing active Pet’s profile fields. Only the Pet’s Owner may update it.

**Acceptance criteria:**

1. The Pet’s Owner can update **name**, **species**, **breed**, **date of birth**, **sex**, and **photo** (optional fields may be set, changed, or cleared where applicable).
2. **Sex**, when present in the update, must be one of: `male`, `female`, `unknown`.
3. Update fails if the caller is not the Pet’s Owner.
4. Update of a non-existent Pet fails.
5. Update of a deactivated Pet fails.

### OPM-FR-008 — Deactivate Pet

**Description:** The service soft-deactivates a Pet. Only the Pet’s Owner may deactivate it (aside from cascade via OPM-FR-004).

**Acceptance criteria:**

1. The Pet’s Owner can deactivate an active Pet; the Pet is marked inactive.
2. Deactivation fails if the caller is not the Pet’s Owner (when invoked as an Owner-facing operation).
3. Deactivation of a non-existent Pet fails.
4. Deactivation of an already deactivated Pet fails (or is a no-op that leaves the Pet deactivated — either is acceptable if documented by the implementation; callers must not observe a reactivated Pet).
5. A deactivated Pet cannot be updated (see OPM-FR-007).
6. Reactivation is not supported in this requirements version.

### OPM-FR-009 — List Pets for Owner

**Description:** The service lists Pets managed by a given Owner for that Owner and for other platform services.

**Acceptance criteria:**

1. Callers can list Pets for an Owner by Owner **id**.
2. The list includes active Pets for that Owner.
3. The list may include deactivated Pets, or expose a filter for active-only vs all; if no filter is provided, behavior must be documented and consistent.
4. Listing for a non-existent Owner fails in a way the caller can distinguish from an empty list for a valid Owner with no Pets.
5. An Owner with no Pets receives an empty list (not an error).

### OPM-FR-010 — Check Pet ownership

**Description:** The service answers whether a given Owner manages a given Pet, for use by other platform services.

**Acceptance criteria:**

1. Given an Owner id and a Pet id, the service returns whether that Owner is the Pet’s Owner.
2. The check returns negative (not owner) when the Pet exists but belongs to a different Owner.
3. The check fails or returns a distinguishable “not found” outcome when the Owner or Pet does not exist.
4. The check remains answerable for deactivated Owners and/or deactivated Pets (ownership relationship is still queryable).
