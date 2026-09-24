---
status: accepted
---

# Synchronous cross-service calls in v1

ADR-0001 splits the backend into **Owner & Pet Manager**, **Pet Health Service**, and **Activity Manager**, and left the integration style open: cross-service calls or events. For v1 we use synchronous calls. Each service still owns its own datastore. The diagram is `docs/architecture/backend.mmd`.

We considered events so Activity logging could finish without waiting on Pet Health Service. We rejected them for v1 because an Activity create, update, or hard-delete must leave the activity-duration Health metric in sync before the caller is told the write succeeded, and ownership, species, and latest-weight checks are part of the same response. The write-latency bound in the requirements includes those calls.

**Calls.** Pet Health Service and Activity Manager call Owner & Pet Manager for ownership and for whether the Pet is active or deactivated before Owner-facing reads and writes of Pet-scoped data. Recommended daily kilocalories also reads species from Owner & Pet Manager. Activity Manager calls Pet Health Service for latest weight when estimating Calories burned, and calls it again to create, correct, or hard-delete the activity-duration Health metric. Owner Deactivation calls the future Community collaborator for the Community-owner check and fails closed when that call cannot be completed. A Share whose audience is a Forum or a Group activity calls that collaborator and fails closed when the target cannot accept it.

**Consequences.** A failed ownership, weight, or activity-duration call fails the operation that needed it. Hard-delete of an activity-duration Health metric still follows Pet Health Service rules when the Pet is deactivated. Events are not a v1 integration path. The Community collaborator is outside this backend; until it exists, Owner Deactivation and Forum or Group activity Shares fail closed.
