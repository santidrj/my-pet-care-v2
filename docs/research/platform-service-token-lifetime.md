# Platform-service / S2S access-token lifetimes

Primary sources converge on **short-lived bearer access tokens measured in minutes to about one hour**, not multi-day secrets. OAuth RFCs repeatedly treat **≤1 hour** as the “short-lived” bar for bearer tokens and treat lifetime as the main damage limit when tokens can be stolen and when **revocation/denylist is absent**. Major clouds and Kubernetes default machine credentials near **1 hour** (with refresh/cache until near expiry). Product IdPs vary more (Okta org AS **60m**; Auth0 API default **24h**; Keycloak lifespan is configurable without a documented fixed default). Clock-skew leeway is consistently **a few minutes**, not hours.

## Source → lifetime (or range)

| Source | Stated / default lifetime | Citation summary |
| --- | --- | --- |
| **RFC 6750** (Bearer Token Usage) | **SHOULD** issue short-lived bearer tokens: **one hour or less** | §5.2–5.3: lifetime MUST be limited; short-lived (≤1h) reduces leak impact; token servers SHOULD issue ≤1h bearer tokens especially where leakage is likely. |
| **RFC 6749** (OAuth 2.0) | **No mandated lifetime**; example `expires_in=3600` (1 hour) | §5.1: `expires_in` RECOMMENDED; example value `3600`. No normative S2S/client-credentials duration. |
| **RFC 6819** (OAuth Threat Model) | **Minutes or hours** (risk-dependent); no single number | §3.2: access tokens “typically have short life spans (minutes or hours)”. §5.1.5.2: may expire after a few minutes (high risk) or stay valid for hours (lower risk). §5.1.5.3: short expiry vs replay/leak; notes more refreshes and tighter clock sync. |
| **RFC 9068** (JWT access tokens) | **Requires `exp`**; no duration | §2.2 / validation: `exp` REQUIRED; MAY allow small leeway, usually **no more than a few minutes**, for clock skew. |
| **RFC 7519** (JWT) | Clock skew leeway only | §4.1.4 `exp`: MAY allow small leeway, usually **no more than a few minutes**. |
| **RFC 7523** (JWT client assertions) | Must have `exp`; max lifetime **out of scope** | §3: JWT MUST include `exp`; AS may reject unreasonably far-future `exp`. Interop: “maximum JWT lifetime allowed” is agreement between parties, not specified. |
| **RFC 9700** (OAuth Security BCP) | **No numeric lifetime** | Emphasizes audience restriction and sender-constrained tokens to reduce impact of stolen access tokens; does not prescribe minutes/hours. |
| **NIST SP 800-63C** | Short assertion lifetimes; **no OAuth AT number** | Assertions: long-lived assertions raise theft/replay risk; short lifetime mitigates. Artifact references SHOULD be time-limited with short lifetime of **seconds or minutes**. Does not prescribe client-credentials access-token duration. |
| **OWASP ASVS 5.0** | Auth codes short-lived; **no AT minutes for M2M** | V10.4.3: authorization code short-lived (points at OAuth norms). Session chapter requires documented timeouts; does not fix S2S access-token minutes. |
| **Kubernetes** | Bound SA TokenRequest: **default 1 hour**; kubelet refreshes before expiry | [Managing Service Accounts](https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/): TokenRequest token expires when Pod deleted or after defined lifespan (**by default, 1 hour**); kubelet refreshes before expiry. Legacy Secret tokens did not expire. |
| **GCP** | SA access tokens: **default 1 hour**; allowed range **5 minutes–12 hours** (longer needs org policy) | [Token types](https://cloud.google.com/docs/authentication/token-types): SA access tokens default expire after **one hour**; cannot be revoked until expiry. `generateAccessToken` lifetime default 1 hour; up to 12 hours only with `iam.allowServiceAccountCredentialLifetimeExtension`. Docs note longer lifetimes increase risk. |
| **AWS STS `AssumeRole`** | **Default 3600s (1 hour)**; min **900s (15 min)**; max up to **12 hours** (role setting; chaining capped at 1 hour) | [AssumeRole API](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html): `DurationSeconds` default 3600; valid range 900–43200 subject to role max. Temporary credentials described as lasting from a few minutes to several hours ([IAM temp credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp.html)). |
| **Microsoft Entra ID** | Access tokens default **~60–90 minutes** (avg ~75m); configurable **10 minutes–~24 hours**; MI lifetimes not separately configurable | [Configurable token lifetimes](https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes): default variable 60–90m; CTL min 10m, max 23:59:59. Explicit trade-off: shorter lifetime limits use after account disable / compromise; longer reduces how often clients must refresh (auth load). Managed identity principals: configuring token lifetimes **not supported** (same platform defaults). |
| **Auth0** | API **Maximum Access Token Lifetime** default **86,400s (24 hours)**; max 30 days; MFA audience fixed **10 minutes** | [Update Access Token Lifetime](https://auth0.com/docs/secure/tokens/access-tokens/update-access-token-lifetime) / [API Settings](https://auth0.com/docs/get-started/apis/api-settings): default 86400s. [Token Best Practices](https://auth0.com/docs/secure/tokens/token-best-practices): give tokens an expiration; **store and reuse** until expiry (reduces round-trips). Default is a product setting, not an RFC-style “SHOULD ≤1h”. |
| **Okta** | Org Authorization Server: access token **hard-coded 60 minutes**. Custom AS: **5 minutes–24 hours** via access policy | [OIDC/OAuth API reference — Token lifetime](https://developer.okta.com/docs/reference/api/oidc/): Org AS AT/ID **60 minutes**; custom AS AT min 5m, max 24h. Guides show example policy of **15 minutes** for higher-sensitivity APIs. |
| **Keycloak** | **Configurable** “Access Token Lifespan” (realm/client); **no numeric default in Server Admin docs** | [Server Admin — Session and token timeouts](https://www.keycloak.org/docs/latest/server_admin/#_timeouts): controls lifetime when creating OIDC access tokens. Security guidance: shorten lifespans to mitigate leaked access tokens (forces refresh sooner). |

## Tradeoffs stated by primary sources

- **Theft / leak window:** Limited lifetime MUST/SHOULD bound bearer-token damage (RFC 6750 §5.2–5.3; RFC 6819 §3.1.2, §5.1.5.2–5.1.5.3; NIST 800-63C on assertion lifetime; GCP on longer SA tokens increasing risk; Entra on shorter AT limiting post-compromise use).
- **Revocation without denylist:** With self-contained JWTs and no denylist, **expiry is the practical revocation delay**—RFC 6819 §3.2–3.3: short AT lifespan enables “passive revocation” once the current AT expires (refresh/session revoke paths for interactive grants; for pure client-credentials, re-issue gating + short `exp` is the analogue).
- **Auth / refresh load:** Shorter tokens mean more token endpoint traffic (RFC 6819 §5.1.5.3; Entra CTL docs). Mitigations in primary docs: **cache/reuse until expiry** (Auth0 Token Best Practices); **refresh before expiry** (Kubernetes kubelet).
- **Clock skew:** JWT validators MAY allow **usually ≤ a few minutes** leeway (RFC 7519 §4.1.4; RFC 9068). Short lifetimes need tighter clock sync (RFC 6819 §5.1.5.3). Refresh-before-expiry buffers should be **larger than** that leeway.
- **Scope / audience vs lifetime:** Privilege restriction and audience binding reduce leak impact alongside (or instead of only) ever-shorter TTLs (RFC 6750 §5.3; RFC 9700 §2.3; RFC 6819 §5.1.5.5).

## Recommendation for My Pet Care

Context: Authentication Service issues platform-service Bearer JWTs (client-credentials style); Owner access tokens already expire in **15 minutes**; services verify JWTs locally with `jose` (**no access-token denylist**); shared authenticator **caches outbound platform tokens until near expiry**.

| Candidate | Lifetime | Fit |
| --- | --- | --- |
| **Recommended default** | **1 hour (3600s)** | Matches the strongest repeated machine/default bar: RFC 6750 “≤1 hour”, Kubernetes SA default, GCP SA default, AWS STS default, Okta Org AS **60m**, Entra ~**60–90m**. With outbound caching until near expiry, Auth Service load stays low (one refresh/hour/client, not per request). |
| **Tighter option** | **15–30 minutes** | Equal to or modestly above Owner AT; better when stolen platform JWT must die quickly and there is **no denylist** (RFC 6819 passive-revocation logic). Still within Okta custom min (**5m**) and AWS STS min (**15m**). Expect ~2–4× more token refreshes than 1h unless cache hit rate stays high. |
| **Avoid as default** | **≥24 hours** (e.g. Auth0 API product default) | Compatible with some IdP defaults but **above** RFC 6750’s short-lived guidance and far larger theft window with local JWT acceptance and no denylist. Use only with additional controls (sender-constrained tokens, aggressive audience/scope limits)—not lifetime alone. |

**Operational rules tied to sources**

1. Set `exp` on every platform JWT (RFC 9068); treat lifetime as the revocation SLA while no denylist exists (RFC 6819).
2. Cache outbound tokens and refresh shortly **before** `exp`, with skew buffer of a **few minutes** (Auth0 reuse-until-expiry; K8s refresh-before-expiry; RFC 7519/9068 leeway).
3. Prefer **≤ Owner AT only if** platform compromise must not outlive user sessions; otherwise **1h platform / 15m Owner** is a coherent split (user session risk vs machine credential churn), both still in the “minutes–about an hour” band primary sources describe.

## Sources

- RFC 6749 — https://www.rfc-editor.org/rfc/rfc6749 (§5.1 `expires_in`)
- RFC 6750 — https://www.rfc-editor.org/rfc/rfc6750 (§5.2, §5.3)
- RFC 6819 — https://www.rfc-editor.org/rfc/rfc6819 (§3.1.2, §3.2–3.3, §5.1.5.2–5.1.5.3)
- RFC 7519 — https://www.rfc-editor.org/rfc/rfc7519 (§4.1.4)
- RFC 7523 — https://www.rfc-editor.org/rfc/rfc7523 (§3, §5)
- RFC 9068 — https://www.rfc-editor.org/rfc/rfc9068 (§2.2, validation / clock skew)
- RFC 9700 — https://www.rfc-editor.org/rfc/rfc9700 (§2.2–2.3)
- NIST SP 800-63C — https://pages.nist.gov/800-63-3/sp800-63c.html (assertion lifetime / artifacts)
- OWASP ASVS 5.0 — https://owasp.org/www-project-application-security-verification-standard/ (V10.4.3; V7.3)
- Kubernetes Managing Service Accounts — https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/
- GCP token types — https://cloud.google.com/docs/authentication/token-types
- GCP `generateAccessToken` — https://cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken
- AWS STS AssumeRole — https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html
- AWS temporary credentials — https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp.html
- Microsoft Entra configurable token lifetimes — https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes
- Auth0 Update Access Token Lifetime — https://auth0.com/docs/secure/tokens/access-tokens/update-access-token-lifetime
- Auth0 API Settings — https://auth0.com/docs/get-started/apis/api-settings
- Auth0 Token Best Practices — https://auth0.com/docs/secure/tokens/token-best-practices
- Okta OIDC/OAuth API (Token lifetime) — https://developer.okta.com/docs/reference/api/oidc/
- Okta access policies (custom lifetimes) — https://developer.okta.com/docs/guides/configure-access-policy/main/
- Keycloak Server Admin timeouts — https://www.keycloak.org/docs/latest/server_admin/#_timeouts
