# Owner & Pet Manager — Requirements

## Purpose

This document defines the requirements for the **Owner & Pet Manager** service of the My Pet Care platform. It captures what the service must do so developers and agents can implement and verify behavior consistently.

This version covers **functional requirements** and an initial set of **non-functional requirements**. Further NFRs and additional requirement details may be added later.

## Scope

### In scope

- Owner lifecycle: create, read, update, and deactivate
- Pet lifecycle: create, read, update, and deactivate
- Owner↔Pet management: linking a Pet to exactly one Owner, listing an Owner’s Pets, and checking whether an Owner manages a Pet
- **Pet list visibility**: Owner-controlled public/private setting for their Pet list
- Serving other platform services that need Owner/Pet identity and ownership information
- Initial NFRs for latency, Owner data isolation, and credential/data protection in transit

### Out of scope

- Health metrics, Activity types, Activity logs, and social features (communities, forums, shared locations, group activities)
- Authentication protocols and login flows (this service stores Owner credential fields; how clients authenticate is defined elsewhere)
- Ownership transfer between Owners
- Reactivation of deactivated Owners or Pets
- Photo upload/storage pipelines (photos are optional opaque references)
- Offline / client-side operation without network (client concern, not this backend service)
- Password complexity policy and encryption at rest (deferred)
- Making Pet **details** public (only the Pet **list** may be made public)

### Domain constraints

- Each Pet is managed by **exactly one** Owner
- Creating a Pet assigns the creating Owner as that Pet’s Owner
- Deactivation is soft (records are retained and marked inactive)
- Deactivating an Owner first deactivates that Owner’s active Pets, then deactivates the Owner
- **Pet list visibility** defaults to **private**; the Owner may set it to **public**
- Public Pet list does **not** expose Pet details to other Owners

## Key actors

| Actor | Description |
| ----- | ----------- |
| **Owner** | A person who manages one or more Pets. Creates and maintains their own profile and their Pets. |
| **Other platform services** | Backend services (e.g. health or activity) that look up Owners/Pets and verify ownership before acting on a Pet. |

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
7. On success, **Pet list visibility** is **private** (see OPM-FR-011).

### OPM-FR-002 — Get Owner

**Description:** The service returns an Owner by identifier or username for Owners and other platform services.

**Acceptance criteria:**

1. An Owner can be retrieved by **id**.
2. An Owner can be retrieved by **username**.
3. Retrieval of a non-existent id or username fails in a way the caller can distinguish from success.
4. A deactivated Owner can still be retrieved (callers can observe deactivated status).
5. Responses never include the Owner’s **password** (see OPM-NFR-004).
6. An Owner retrieving another Owner does not receive that Owner’s **email** (see OPM-NFR-003).

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

**Description:** The service returns a Pet by id for the Pet’s Owner and for other platform services. Other Owners do not receive Pet details.

**Acceptance criteria:**

1. The Pet’s Owner can retrieve the Pet by **id**, including Pet details.
2. Other platform services can retrieve the Pet by **id**, including Pet details needed for platform operations.
3. An Owner who is not the Pet’s Owner cannot retrieve that Pet’s details.
4. Retrieval of a non-existent id fails in a way the caller can distinguish from success.
5. A deactivated Pet can still be retrieved by its Owner or by other platform services (callers can observe deactivated status).
6. The response identifies the Pet’s Owner.

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

**Description:** The service lists Pets managed by a given Owner, subject to Pet list visibility for Owner callers, and without restriction for other platform services.

**Acceptance criteria:**

1. An Owner can always list their **own** Pets by Owner **id**.
2. Other platform services can list Pets for an Owner by Owner **id**.
3. Another Owner can list an Owner’s Pets only when that Owner’s **Pet list visibility** is **public**; if **private**, the request is denied (or returns no Pet list) in a way distinguishable from “Owner has no Pets.”
4. When the list is returned, it includes active Pets for that Owner.
5. The list may include deactivated Pets, or expose a filter for active-only vs all; if no filter is provided, behavior must be documented and consistent.
6. Listing for a non-existent Owner fails in a way the caller can distinguish from an empty list for a valid Owner with no Pets.
7. An Owner with no Pets receives an empty list (not an error) when the caller is allowed to list.

### OPM-FR-010 — Check Pet ownership

**Description:** The service answers whether a given Owner manages a given Pet, for use by other platform services.

**Acceptance criteria:**

1. Given an Owner id and a Pet id, the service returns whether that Owner is the Pet’s Owner.
2. The check returns negative (not owner) when the Pet exists but belongs to a different Owner.
3. The check fails or returns a distinguishable “not found” outcome when the Owner or Pet does not exist.
4. The check remains answerable for deactivated Owners and/or deactivated Pets (ownership relationship is still queryable).

### OPM-FR-011 — Set Pet list visibility

**Description:** An Owner sets whether other Owners may see their Pet list. Visibility defaults to private and does not expose Pet details.

**Acceptance criteria:**

1. A newly created Owner has **Pet list visibility** set to **private**.
2. An active Owner can set their Pet list visibility to **public** or **private**.
3. Setting visibility on a non-existent or deactivated Owner fails.
4. Changing visibility does not by itself expose Pet **details** to other Owners (see OPM-FR-006, OPM-NFR-003).
5. After setting visibility to **public**, other Owners can list that Owner’s Pets per OPM-FR-009.
6. After setting visibility to **private**, other Owners can no longer list that Owner’s Pets per OPM-FR-009.

## Non-functional requirements

### OPM-NFR-001 — Read/check latency

**Description:** Read and ownership-check operations respond quickly under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **&lt; 500ms** for: get Owner, get Pet, list Pets for Owner, and check Pet ownership.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### OPM-NFR-002 — Write latency

**Description:** Write and deactivate operations complete within a bound under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **&lt; 2s** for: create/update/deactivate Owner, create/update/deactivate Pet, and set Pet list visibility.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### OPM-NFR-003 — Owner data isolation

**Description:** Owners cannot access other Owners’ private data or modify other Owners’ or Pets’ information. Trusted other platform services retain their FR capabilities.

**Acceptance criteria:**

1. An Owner cannot read another Owner’s **email**.
2. An Owner cannot read another Owner’s **Pet list** when that Owner’s Pet list visibility is **private**.
3. When Pet list visibility is **public**, another Owner may read the **list** only (not Pet details).
4. An Owner cannot read **Pet details** for a Pet they do not own.
5. An Owner cannot modify another Owner’s profile or a Pet they do not own (consistent with OPM-FR-003, OPM-FR-007, OPM-FR-008, OPM-FR-011).
6. These isolation rules constrain **Owner** actors; **other platform services** may perform the lookups and ownership checks defined in the FRs.

### OPM-NFR-004 — Credential and data protection

**Description:** Credentials and sensitive data are protected in API responses and in transit. Passwords are not stored in plaintext.

**Acceptance criteria:**

1. Owner **passwords** are never included in API responses.
2. Owner passwords are not stored in plaintext.
3. Client–service communication that carries credentials or private Owner/Pet data uses **TLS** (confidentiality in transit).
4. Encryption at rest and password complexity policy are out of scope for this NFR version.
