# Owner & Pet Manager — Requirements

## Purpose

This document defines the requirements for the **Owner & Pet Manager** service of the My Pet Care platform. It states what the service must do so developers and agents can implement and verify behavior.

## Goals

- An Owner can create and maintain their own identity and the Pets they manage, including Deactivation.
- An Owner can control Pet list visibility so other Owners may see a **Pet summary** for each active Pet.
- Other platform services can look up Owner and Pet identity and check whether an Owner manages a Pet before they act on that Pet.

## Actors

| Actor | Description |
| ----- | ----------- |
| **Owner** | The person who manages one or more Pets. Creates and maintains their own profile and their Pets, and sets Pet list visibility. |
| **Other platform services** | Backend services (for example Pet Health Service or Activity Manager) that look up Owners and Pets and verify ownership before acting on a Pet. |
| **Community service** | The future service that answers whether an Owner is still **Community owner** of any Community. Owner & Pet Manager calls it when deactivating an Owner. It owns ending **belonging** and the **Community administrator** role. |

## Scope

### In scope

- Owner lifecycle: create, read, update, and deactivate
- Pet lifecycle: create, read, update, and deactivate
- Owner–Pet management: linking a Pet to exactly one Owner, listing an Owner’s Pets, and checking whether an Owner manages a Pet
- **Pet list visibility**: Owner-controlled public/private setting for their Pet list
- **Pet summary** reads for other Owners: the public list and Get Pet Summary
- Community-owner gate on Owner Deactivation, delegated to the Community service
- Serving other platform services that need Owner and Pet identity and ownership
- Quality attributes for latency, Owner data isolation, and credential and data protection in transit

### Out of scope

- Health metrics, the Medical record, Activity types, Activities, and social features (Communities, Forums, Shared locations, Group activities), except the Community-owner check this service consumes
- Ending an Owner’s belonging in every Community, and ending their Community administrator role, when that Owner is deactivated (carried out by the Community service)
- Login, refresh, logout, and forgotten-password reset (Authentication Service). This service stores the password hash and answers hash and active-status reads for that service.
- Ownership transfer between Owners
- Reactivation of deactivated Owners or Pets
- Photo upload and storage pipelines (photos are optional opaque references)
- Offline or client-side operation without a network
- Encryption at rest

## Business / domain rules

- Each Pet is managed by exactly one Owner. Creating a Pet assigns the creating Owner as that Pet’s Owner.
- **Username** and **email** are unique among Owners, including deactivated Owners. Username uniqueness is case-sensitive. Email uniqueness ignores case.
- A **username** is one or more ASCII letters, digits, `_`, or `-`. An **email** has a single `@`, a non-empty local part, and a domain with a dot and no whitespace. No string is both.
- A **password** is at least 8 characters and at most as long as the service allows, which is at least 64 characters. Any character is allowed, including spaces. Commonly used or known-breached passwords are rejected. No mix of letters, digits, or symbols is required (ADR-0012).
- Deactivation is soft: the record is retained and marked inactive. It is not a Hard delete.
- An Owner who is still Community owner of any Community cannot be deactivated until each Community ownership transfer is complete.
- If Owner & Pet Manager cannot complete the Community-owner check, Owner Deactivation fails and leaves that Owner and their Pets unchanged.
- When Owner Deactivation proceeds, it deactivates that Owner’s active Pets first, then deactivates the Owner.
- Deactivating an Owner or Pet that is already deactivated fails. The record stays deactivated.
- A successful Owner Deactivation ends that Owner’s belonging in every Community and their Community administrator role in each. The Community service carries out that ending. This service does not.
- **Pet list visibility** defaults to **private**. The Owner may set it to **public**.
- A **Pet summary** is the Pet id, name, species, breed, date of birth, sex, and photo. Breed, date of birth, and photo are present only when set.
- When Pet list visibility is public, another Owner may read Pet summaries for that Owner’s active Pets. They cannot Get Pet.
- This service does not return a Medical record, a Health metric, or an Activity.

## Constraints

- This backend service is the system of record for Owners, Pets, the one-Owner-per-Pet rule, Deactivation, and Pet list visibility. Clients are separate.
- It does not own health, activity, or Community data.
- The Community-owner check is delegated to the Community service. Owner Deactivation fails closed when that check cannot be made.
- Photo values are opaque references. This service does not run an upload or storage pipeline.
- Reactivation and ownership transfer are not supported.
- Passwords are not stored in plaintext. Encryption at rest is outside this requirements version. Password strength is enforced on create and on password change (ADR-0012).

## Assumptions

- Login and credential checks happen in the Authentication Service. Owner & Pet Manager receives a trusted Owner identity on Owner-facing calls, and it can tell those calls apart from trusted calls by other platform services and by the Community service. It does not implement login.
- The password hash is readable by the Authentication Service only. On Deactivation and on password change, this service tells the Authentication Service to revoke that Owner’s refresh tokens. The Owner change still succeeds if that call cannot be completed.

## Functional requirements

### OPM-FR-001 — Create Owner

**Description:** The service creates a new Owner with the required profile and credential fields.

**Acceptance criteria:**

1. An Owner can be created with **username**, **email**, and **password**.
2. **Photo** may be omitted; if provided, it is stored as an opaque reference.
3. Create fails if **username** is not one or more ASCII letters, digits, `_`, or `-`.
4. Create fails if **email** does not have a single `@`, a non-empty local part, and a domain with a dot and no whitespace.
5. Create fails if **username** is already used by another Owner, including a deactivated Owner. The comparison is case-sensitive.
6. Create fails if **email** is already used by another Owner, including a deactivated Owner. The comparison ignores case.
7. Create fails if **password** is shorter than 8 characters, longer than the allowed maximum (at least 64 characters), or on the list of commonly used or known-breached passwords.
8. Create fails if any required field (username, email, password) is missing.
9. On success, the Owner is active and can be retrieved by id or username.
10. On success, **Pet list visibility** is **private** (see OPM-FR-011).

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
2. Update fails if the new **username** is not one or more ASCII letters, digits, `_`, or `-`.
3. Update fails if the new **email** does not have a single `@`, a non-empty local part, and a domain with a dot and no whitespace.
4. Update fails if the new **username** is already used by another Owner, including a deactivated Owner. The comparison is case-sensitive.
5. Update fails if the new **email** is already used by another Owner, including a deactivated Owner. The comparison ignores case.
6. Update fails if the new **password** is shorter than 8 characters, longer than the allowed maximum (at least 64 characters), or on the list of commonly used or known-breached passwords.
7. On a successful password change, this service tells the Authentication Service to revoke that Owner’s refresh tokens. The update still succeeds if that call cannot be completed.
8. Update of a non-existent Owner fails.
9. Update of a deactivated Owner fails.

### OPM-FR-004 — Deactivate Owner

**Description:** The service soft-deactivates an Owner after the Community-owner check. If the Owner has active Pets, those Pets are deactivated first, then the Owner.

**Acceptance criteria:**

1. Deactivation fails while the Owner is still Community owner of any Community. That Owner and their Pets stay active.
2. Deactivation fails when the Community-owner check cannot be made. That Owner and their Pets stay active.
3. The Community-owner check is completed before any Pet is deactivated.
4. When the check shows the Owner is not a Community owner, and the Owner has no active Pets, the Owner is marked inactive.
5. When the check shows the Owner is not a Community owner, and the Owner has one or more active Pets, each of those Pets is deactivated first, then the Owner is deactivated.
6. Deactivation of a non-existent Owner fails.
7. Deactivation of an already deactivated Owner fails in a way distinguishable from not-found. The Owner stays deactivated.
8. A deactivated Owner cannot be updated (see OPM-FR-003).
9. Reactivation is not supported.
10. This operation does not end belonging or the Community administrator role.
11. On success, this service tells the Authentication Service to revoke that Owner’s refresh tokens. Deactivation still succeeds if that call cannot be completed.

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

**Description:** The service returns a Pet by id for the Pet’s Owner and for other platform services. Other Owners use Get Pet Summary (OPM-FR-012).

**Acceptance criteria:**

1. The Pet’s Owner can retrieve the Pet by **id**, including the Pet’s identity fields, the Owner id, and deactivated status.
2. Other platform services can retrieve the Pet by **id**, including the Pet’s identity fields, the Owner id, and deactivated status.
3. An Owner who is not the Pet’s Owner cannot retrieve that Pet through Get Pet.
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
4. Deactivation of an already deactivated Pet fails in a way distinguishable from not-found. The Pet stays deactivated.
5. A deactivated Pet cannot be updated (see OPM-FR-007).
6. Reactivation is not supported.

### OPM-FR-009 — List Pets for Owner

**Description:** The service lists Pets managed by a given Owner. Other Owners receive Pet summaries of active Pets only when Pet list visibility is public. The Owner and other platform services receive full Pet records and may include deactivated Pets.

**Acceptance criteria:**

1. An Owner can list their own Pets by Owner **id**.
2. Other platform services can list Pets for an Owner by Owner **id**.
3. Another Owner can list an Owner’s Pets only when that Owner’s **Pet list visibility** is **public**. If it is **private**, the request is denied in a way distinguishable from an Owner who has no Pets.
4. Without a filter, every allowed caller receives active Pets only.
5. The Owner and other platform services may set a filter to include deactivated Pets. Another Owner never receives deactivated Pets, including when that filter is set.
6. When another Owner receives the list, each entry is a **Pet summary**: Pet id, name, species, breed, date of birth, sex, and photo. Breed, date of birth, and photo are included only when set.
7. When the Owner or another platform service receives the list, each entry includes the Pet’s identity fields, the Owner id, and deactivated status.
8. Listing for a non-existent Owner fails in a way the caller can distinguish from an empty list for a valid Owner with no Pets.
9. An Owner with no Pets receives an empty list (not an error) when the caller is allowed to list.

### OPM-FR-010 — Check Pet ownership

**Description:** The service answers whether a given Owner manages a given Pet, for use by other platform services.

**Acceptance criteria:**

1. Given an Owner id and a Pet id, the service returns whether that Owner is the Pet’s Owner.
2. The check returns negative (not owner) when the Pet exists but belongs to a different Owner.
3. When the Owner or Pet does not exist, the outcome is distinguishable from both success and “not the owner.”
4. The check remains answerable for deactivated Owners and deactivated Pets (the ownership relationship is still queryable).

### OPM-FR-011 — Set Pet list visibility

**Description:** An Owner sets whether other Owners may see their active Pets as Pet summaries. Visibility defaults to private.

**Acceptance criteria:**

1. A newly created Owner has **Pet list visibility** set to **private**.
2. An active Owner can set their Pet list visibility to **public** or **private**.
3. Setting visibility on a non-existent or deactivated Owner fails.
4. Changing visibility does not authorize another Owner to Get Pet (see OPM-FR-006).
5. After setting visibility to **public**, other Owners can list that Owner’s active Pets and call Get Pet Summary per OPM-FR-009 and OPM-FR-012.
6. After setting visibility to **private**, other Owners can no longer list that Owner’s Pets, and Get Pet Summary for those Pets fails per OPM-FR-012.

### OPM-FR-012 — Get Pet Summary

**Description:** Another Owner retrieves one **Pet summary** by Pet id. The call succeeds only when that Pet is active and its Owner’s Pet list visibility is public.

**Acceptance criteria:**

1. An Owner who is not the Pet’s Owner can retrieve a Pet summary by Pet **id** when the Pet is active and that Owner’s **Pet list visibility** is **public**.
2. The summary contains Pet id, name, species, breed, date of birth, sex, and photo. Breed, date of birth, and photo are included only when set.
3. If the Pet does not exist, the Pet is deactivated, or Pet list visibility is **private**, the call fails in the same way, so those three cases cannot be told apart.
4. The Pet’s Owner and other platform services are not the callers of this operation; they use Get Pet (OPM-FR-006). A call by the Pet’s Owner or by another platform service fails.

## Quality attributes (NFRs)

### OPM-NFR-001 — Read/check latency

**Description:** Read and ownership-check operations respond quickly under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **< 500ms** for: get Owner, get Pet, get Pet Summary, list Pets for Owner, and check Pet ownership.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### OPM-NFR-002 — Write latency

**Description:** Write and deactivate operations complete within a bound under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **< 2s** for: create, update, and deactivate Owner; create, update, and deactivate Pet; and set Pet list visibility.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### OPM-NFR-003 — Owner data isolation

**Description:** Owners cannot access other Owners’ private data or modify other Owners’ or Pets’ information. Another Owner may read a Pet summary only through the public list and Get Pet Summary. Trusted other platform services retain their functional-requirement capabilities.

**Acceptance criteria:**

1. An Owner cannot read another Owner’s **email**.
2. An Owner cannot read another Owner’s **Pet list** when that Owner’s Pet list visibility is **private**.
3. When Pet list visibility is **public**, another Owner may read **Pet summaries** for active Pets only, through the list (OPM-FR-009) and Get Pet Summary (OPM-FR-012).
4. An Owner cannot Get Pet for a Pet they do not own.
5. This service does not return a Medical record, a Health metric, or an Activity to any caller.
6. An Owner cannot modify another Owner’s profile or a Pet they do not own (consistent with OPM-FR-003, OPM-FR-007, OPM-FR-008, and OPM-FR-011).
7. These isolation rules constrain **Owner** actors. **Other platform services** may perform the lookups and ownership checks defined in the functional requirements.

### OPM-NFR-004 — Credential and data protection

**Description:** Credentials and sensitive data are protected in API responses and in transit. Passwords are not stored in plaintext.

**Acceptance criteria:**

1. Owner **passwords** are never included in API responses.
2. Owner passwords are not stored in plaintext.
3. Client–service communication that carries credentials or private Owner or Pet data uses **TLS**.
4. The password hash is never included in responses to Owners or to services other than the Authentication Service.
5. Encryption at rest is out of scope for this requirements version.
