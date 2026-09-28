---
status: accepted
---

# External Share resolve does not reveal whether the link was valid

`GET /shares/external/{token}` on **Activity Manager** is a capability URL with no JWT. An unknown token, a revoked Share, and a Share whose Activity was hard-deleted all return `410` with `urn:my-pet-care:share-unavailable` and the same fixed detail. Authenticated `GET` or `DELETE /shares/{shareId}` still uses `404` `urn:my-pet-care:resource-not-found` when that share id never existed, and `410` only when the Share existed and is no longer available.

We considered `404` for an unknown external token so a client could tell a typo from a revoked link. That response would confirm a guessed token had once been valid. One `410` for every external failure matches the non-leaky unauthorized style in ADR-0014.

**Consequences.** A client cannot retry an external link to learn whether it was ever issued. The HTTP mapping is in `docs/requirements/activity-manager-api.md`.
