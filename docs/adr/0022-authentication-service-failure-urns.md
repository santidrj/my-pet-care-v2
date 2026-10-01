---
status: accepted
---

# Authentication Service failure URNs

**Authentication Service** reuses shared Problem Details URNs where the meaning already matches, and adds three URNs for failures that had none. This reopens the “new URNs stay deferred” sentence in ADR-0020. ADR-0014 says two different failure kinds must not share a `type`, and the skeleton trio cannot name rejected credentials, try-again-later, or a failed reset message without collapsing them into unauthorized, not-found, or internal-error.

| Failure | URN |
| --- | --- |
| Validation | `urn:my-pet-care:validation-failed` |
| Missing or invalid Bearer JWT on revoke | `urn:my-pet-care:unauthorized` |
| Platform JWT whose `service` is not `owner-pet-manager` | `urn:my-pet-care:forbidden` |
| Reset did not start, or the reset token is expired, unknown, or already used | `urn:my-pet-care:resource-not-found` |
| Owner & Pet Manager unreachable | `urn:my-pet-care:owner-pet-manager-unavailable` |
| Credentials or refresh token not accepted | `urn:my-pet-care:credentials-rejected` |
| Try-again-later | `urn:my-pet-care:try-again-later` |
| Mail delivery failed | `urn:my-pet-care:mail-delivery-failed` |

`urn:my-pet-care:not-found` stays the unmatched-route failure only. Details are fixed sentences and carry no identifier, password, secret, or token. The three new URNs live beside the existing constants in `packages/contracts`.

We considered keeping the deferral and reusing `urn:my-pet-care:unauthorized` for a bad password or a bad refresh token. That would make a missing JWT and rejected credentials the same `problemType`. We considered one `503` type for both Owner & Pet Manager and mail. Those are different kinds: one is a dependency the caller can retry after the other service is back, the other is a reset message that was not sent.
