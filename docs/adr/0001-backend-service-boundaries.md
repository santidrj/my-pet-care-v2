---
status: accepted
---

# Backend service boundaries

My Pet Care’s backend is split into **Owner & Pet Manager**, **Pet Health Service**, and **Activity Manager**, each owning distinct aggregates defined in `CONTEXT.md` and the matching requirements under `docs/requirements/`. We chose this split over a single monolithic service so identity, clinical-style health data, and activity logging can evolve, scale, and authorize independently while still sharing one ubiquitous language at the repo root.

**Owner & Pet Manager** is the system of record for Owners, Pets, the one-Owner-per-Pet rule, Deactivation, and Pet list visibility. Every other service references Pets by id and must verify ownership (and active/deactivated status) through it before Owner-facing writes; it does not own health, activity, or community data.

**Pet Health Service** is the system of record for a Pet’s Health profile, Health metrics, Meals, Washes, Wash schedules, Vet visits, Medications, and the Medical record view. It does not create or deactivate Pets or Owners. **Activity Manager** owns Activity types, Activities, Shares, and Calories burned on Activities; on Activity create/update/delete it syncs **activity-duration** Health metrics to Pet Health and reads latest weight from Pet Health for calorie estimates. Pet Health does not own Activity logs or Share grants.

**Community** concepts (open/closed Communities, Belonging, Forums, Group activities, Shared locations, administration, and ownership transfer) live in the glossary but are not yet assigned to a backend service in requirements. **Activity Manager** may create Shares whose audience is a Forum or Group activity; resolving those Shares depends on a future Community service (or equivalent) that owns membership and those aggregates.

**Consequences:** Cross-service calls (or events, once chosen) are required for ownership checks, deactivated-Pet rules, weight lookup, and Health metric sync. Hard delete vs Deactivation rules differ by aggregate; only Owner & Pet Manager soft-deactivates identity. An Owner who is Community owner of any Community must transfer ownership before deactivation—a rule enforced at identity deactivation time even though Community ownership is owned elsewhere once that service exists.
