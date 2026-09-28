# Platform-service authenticator — architectural tactics and patterns

Primary sources and this repo’s already-accepted constraints converge on a **thin shared Fastify library**: local JWT verification (`jose`), actor-only inbound hooks, and a small outbound client-credentials cache with **refresh-before-expiry**, **promise coalescing**, and **exactly one** peer-401 retry. The tactics that matter are security separation (authenticate ≠ authorize), fail closed, audience binding, non-leaky 401s, and bounded availability patterns (cache, timeout, single retry). Patterns to **avoid** for this package are gateway-only auth, introspection/denylist, mTLS/SPIFFE in v1, Circuit Breaker on the token grant, rate limiting inside the lib, spoofable identity headers, impersonation, and deep Clean/Hexagon layering for a widget this thin.

## Context

Each platform service (Owner & Pet Manager, Pet Health Service, Activity Manager, Authentication Service; Community later) must (1) verify Auth-signed Bearer JWTs on non-public routes and expose a trusted actor to handlers, and (2) obtain/present its own platform-service JWT on synchronous outbound calls ([`docs/requirements/platform-service-authenticator.md`](../requirements/platform-service-authenticator.md); C4 in [`docs/architecture/platform-service-authenticator.mmd`](../architecture/platform-service-authenticator.mmd)).

Decided constraints (do not reopen here): shared library (not a gateway); local `jose` verification (no Auth call per inbound request); inbound establishes actor only; public allowlist skips verification (ignore Bearer if present); outbound OAuth2-style client-credentials to Auth `POST /oauth/token` with in-memory cache, refresh ≤5 minutes before expiry, any peer 401 → one invalidate/re-fetch/retry, fail closed; uniform 401 Problem Details `urn:my-pet-care:unauthorized` (ADR-0016, ADR-0017, ADR-0002, ADR-0010/0014).

### Existing scaffolding (`packages/platform-service-authenticator/src/`)

| Module | What is already sketched | Alignment with this research |
| --- | --- | --- |
| `verify-token.ts` | `jwtVerify` with fixed `iss`, dual `aud`, ±60s `clockTolerance`; mutually exclusive Owner/`service` actor extraction; errors collapsed to `TokenVerificationError` | **Apply** path: local verify, audience binding, non-leaky failure. Keep collapsing reasons at the HTTP boundary. |
| `outbound.ts` | Factory `createOutboundCredentialProvider`; in-memory cache; refresh-before-expiry; `inflight` promise coalescing; authorized `fetch` with one 401 invalidate/retry | **Apply** path for cache + single-flight + one retry. **Gaps:** default skew is **120s** while the HTTP contract requires **300s** ([`platform-service-authenticator-api.md`](../requirements/platform-service-authenticator-api.md)); token-endpoint `fetch` has **no timeout/`AbortSignal`** yet. |
| `plugin.ts` | `fastify-plugin` + `onRequest` hook; `decorateRequest('actor')`; public allowlist; uniform `unauthorizedProblem` | **Apply** Fastify Intercepting Filter. Correct use of `fp` to break encapsulation. |
| `index.ts` | Re-exports verifier, outbound factory, plugin, and shared unauthorized problem | Sensible public surface; keep verifier usable without Fastify for unit tests. |

Naming drift to resolve in implementation (not by reopening requirements): API trusted actor uses `kind: "platform"`; scaffolding currently uses `kind: "service"`. Prefer the API discriminant.

## Tactic / pattern fit

| Tactic or pattern | Primary source | Fit | Rationale for this package |
| --- | --- | --- | --- |
| **Authenticate actors ≠ authorize actors** | Bass et al., *Software Architecture in Practice* (3rd ed.), Ch. 11 security tactics (Authenticate / Authorize Actors); RFC 9068 §4 (authz claims “beyond the scope” of JWT profile validation) | **Apply** | PSA-FR-005 / ADR-0018: authenticator establishes trusted actor; per-route authz stays in each service’s use cases. |
| **Fail secure / fail closed** | Saltzer & Schroeder, “The Protection of Information in Computer Systems” (fail-safe defaults); PSA-FR-003/004 | **Apply** | Non-allowlisted missing/invalid JWT → 401; outbound without a usable platform token must not proceed anonymously. |
| **Least privilege (claim / client scope)** | Saltzer & Schroeder (least privilege); RFC 9700 §2.3 privilege restriction; PSA business rules | **Apply** | Client may obtain a token only for its own `serviceId`; Owner and platform claim shapes are mutually exclusive; audiences differ (`my-pet-care` vs `my-pet-care:platform`). |
| **Audience binding on JWT access tokens** | RFC 9700 §2.3 / §4.10.2; RFC 9068 §4 (MUST reject wrong `aud`); RFC 6750 §5.3; RFC 7519 §4.1.3 | **Apply** | Verifier already checks `aud` per actor shape. Do not accept a token meant for the other audience. |
| **Clock-skew leeway** | RFC 7519 §4.1.4; RFC 9068 §4 (“usually no more than a few minutes”); PSA-NFR-004 (±60s) | **Apply** | ±60s is inside the RFC “few minutes” band. Refresh-before-expiry margin must stay **larger** than verification leeway (PSA-NFR-002; lifetime research note). |
| **Non-leaky unauthorized responses** | RFC 9068 §4 → RFC 6750 §3.1 `invalid_token` for any validation failure; ADR-0014; PSA-NFR-003 | **Apply** | One wire shape: `401` + `urn:my-pet-care:unauthorized`. Do not distinguish missing vs expired vs bad signature on the wire. |
| **Secret / token non-disclosure in logs** | RFC 6750 §5.2–5.3 (safeguard bearer tokens; URL/log leakage); ADR-0013 redaction | **Apply** | Never log `Authorization`, raw JWTs, or client secrets. Service logs stay outcome/status/`problemType` only. |
| **Shared library in each service (not gateway-only)** | ADR-0008 / ADR-0016 consequences (verify in each Fastify service); requirements “shared library” constraint | **Apply** | Matches monorepo composition and keeps auth next to handlers. Gateway-only auth is **Avoid** (below). |
| **Fastify plugin + `fastify-plugin` (break encapsulation)** | Fastify Encapsulation docs; `fastify-plugin` README (breaks encapsulation by default; `name` / `fastify: '5.x'`) | **Apply** | Auth hooks and `request.actor` must be visible to sibling route plugins—exactly why scaffolding wraps with `fp`. |
| **Intercepting Filter / Middleware (`onRequest`)** | Fastify Hooks (`onRequest` first lifecycle hook; early `reply.send`); Core J2EE / POSA Intercepting Filter | **Apply** | Public allowlist gate then Bearer verify before handlers. Prefer `onRequest` (header-only) over `preHandler` for this concern. |
| **Request Decorator (`decorateRequest` + per-request assign)** | Fastify Decorators docs (do not share mutable decorator defaults across requests) | **Apply** | `request.actor = null` then set on success; matches Fastify’s recommended per-request initialization. |
| **Factory (outbound credential provider)** | GoF Factory Method (create configured collaborator) | **Apply** | `createOutboundCredentialProvider({ tokenEndpoint, serviceId, secret, fetch, … })` keeps grant/cache policy behind a small API. |
| **Strategy / key provider (`getKey` / JWKS)** | `jose` `jwtVerify(jwt, getKey, options)` overload; RFC 9068 key retrieval via AS material | **Partial** | v1 may inject a static public key (current scaffolding). Keep the seam open for JWKS/`createRemoteJWKSet` later without redesigning the plugin. |
| **Chain of Responsibility** | GoF CoR | **Partial** | Allowlist → verify → handler is a short fixed chain. Do **not** build a general CoR framework inside the package. |
| **Local verification (no per-request Auth round-trip)** | ADR-0016; PSA-FR-001 / PSA-NFR-001; RFC 9068 local signature + claim checks | **Apply** | Signature/`iss`/`aud`/`exp` locally with `jose`. |
| **Caching + store-and-reuse until near expiry** | Auth0 Token Best Practices (“store and reuse”); RFC 6749 `expires_in`; PSA-FR-002 / PSA-NFR-002 | **Apply** | In-memory cache until refresh-before-expiry. Default margin must be **300s** per API contract (scaffolding’s 120s should be corrected). |
| **Refresh-before-expiry** | Kubernetes SA token refresh-before-expiry practice (lifetime research note); PSA-NFR-002 | **Apply** | Margin > clock leeway; contract = 5 minutes. |
| **Single-flight / promise coalescing (stampede avoidance)** | Classic concurrent-refresh coalescing (e.g. Go `singleflight` idea applied as one shared Promise in Node); Bass performance tactics (Manage / schedule concurrent work) | **Apply** | Scaffolding’s `inflight` Promise is the right Node idiom: concurrent `getAccessToken()` share one grant. Prefer coalescing over a heavy mutex library. |
| **Bounded retry (exactly one)** | Bass availability tactic Retry (bound attempts); PSA-FR-002 peer-401 rule | **Apply** | Invalidate → re-fetch → retry outbound **once**. Second 401 or failed grant fails closed. |
| **Timeouts on token endpoint** | Bass availability tactic Timeout; Node.js `AbortSignal.timeout(delay)` for `fetch` | **Apply** | Scaffolding lacks this; add a finite timeout on `POST /oauth/token` and treat timeout as grant failure (fail closed). |
| **Ports / dependency injection (thin)** | ADR-0018 ports-and-adapters for OPM; ADR-0007 rejecting Nest-style DI for these services | **Partial** | Inject `fetch`, clock, keys, allowlist, credentials at the package boundary. Do **not** mirror OPM’s full hexagon inside this widget. |
| **Clean / Hexagonal depth (entities, use-case layers, etc.)** | ADR-0018 applies to OPM domain; Alistair Cockburn Hexagonal Architecture (ports for *applications*) | **Avoid** (for this package) | Authenticator is a cross-cutting adapter, not a domain. Extra layers buy little and fight Fastify plugin ergonomics. |
| **Circuit Breaker on client-credentials** | Resilience4j CircuitBreaker (OPEN rejects further calls after failure-rate threshold) | **Avoid** | Requirements already specify fail closed + one retry. Opening a breaker after Auth blips would amplify outages and duplicate bounded-retry policy. Timeouts + single retry suffice for v1. |
| **Token-bucket / rate limits in this lib** | Rate limiting belongs at Auth token endpoint / edge | **Avoid** | Auth Service capacity and abuse controls are Auth’s concern, not the shared client. |
| **API Gateway as the only authenticator** | Contrasts ADR-0016 (verify in each service) | **Avoid** | Gateway may sit in front later for TLS/routing, but must not be the sole identity check for S2S or Owner calls into each process. |
| **mTLS / SPIFFE as S2S identity (v1)** | Explicitly out of scope in requirements; rejected in ADR-0008/0016 | **Avoid** (v1) | Tokens + local verify are the chosen mechanism. |
| **Access-token denylist / introspection per request** | Out of scope (requirements); ADR-0016: already-issued AT valid until `exp`; RFC 6819 §3.2 passive revocation via short life | **Avoid** | Expiry (+ short lifetime) is the revoke window; per-request introspection would violate PSA-NFR-001. |
| **Spoofable identity headers (`X-Owner-Id`, etc.)** | ADR-0008/0016 (raw header rejected) | **Avoid** | Actor comes only from verified JWT claims, exposed in-process—not as trusted inbound headers. |
| **Impersonation tokens (service-as-Owner)** | Explicitly out of scope | **Avoid** | Mutual exclusion of `ownerId` and `service` claims. |
| **Heavy DI frameworks (Nest modules, etc.)** | ADR-0007 chose Fastify over Nest DI | **Avoid** | Plugin options + factory functions are enough. |

## Recommended package shape

Keep three seams—matching the C4 components and the current files—without adding domain/use-case folders:

```
packages/platform-service-authenticator/
  src/
    verify-token.ts     # pure: JWT → Actor | TokenVerificationError
    outbound.ts         # factory: cache + single-flight + authorized fetch
    plugin.ts           # Fastify: allowlist + onRequest + decorateRequest
    index.ts            # public exports only
```

**Inbound seam**

1. Export pure `verifyToken` (testable without Fastify).
2. Plugin: `fp`-wrapped; `decorateRequest('actor')`; `onRequest` → if public (ignore Bearer) return; else Bearer required → `verifyToken` → set `request.actor` or send uniform unauthorized Problem Details.
3. Do not encode route authorization in the plugin.

**Outbound seam**

1. `createOutboundCredentialProvider` owns cache, `refreshAtMs = now + (expiresIn - skewMargin) * 1000` with **skewMargin default 300**, single-flight Promise, and `fetch` wrapper.
2. Inject `fetch` (tests) and pass `signal: AbortSignal.timeout(...)` (or equivalent) on the token grant.
3. Peer handling: any `401` on a call that used a platform Bearer → clear cache → force refresh once → retry once; no Problem Details parsing.
4. Surface `PlatformTokenUnavailableError` to the calling service; that service maps to its own Problem Details (typically dependency unavailable)—the authenticator does not invent outbound HTTP error bodies.

**Config seam (constructor/options only)**

- Inbound: trust material (`publicKey` or future `getKey`), `publicRoutes[]`.
- Outbound: `tokenEndpoint`, `serviceId`, `secret`, optional `fetch` / `now` / `skewMarginSeconds` / grant timeout.

**Do not add** inside this package: authorization policies, denylist clients, circuit-breaker wrappers, rate limiters, or a second copy of OPM’s ports-and-adapters tree.

## Open risks / non-goals

| Item | Note |
| --- | --- |
| **Skew default mismatch** | Scaffolding `DEFAULT_SKEW_MARGIN_SECONDS = 120` vs contract **300**. Correct toward the contract. |
| **Actor discriminant naming** | Align scaffolding `kind: "service"` with API `kind: "platform"`. |
| **Force-refresh vs inflight** | Ensure forced refresh after 401 does not race with a stale coalesced grant in a confusing way; invalidate cache first (already done), then coalesce force refreshes if useful. |
| **Key rotation** | v1 assumes deploy-time trust material; JWKS Strategy is Partial for later. |
| **Process-local cache** | Multiple replicas each hold their own token; acceptable for v1 (no shared cache required). |
| **Non-goals** | Owner login/refresh; RBAC engine; denylist; mTLS/SPIFFE; impersonation; gateway-as-sole-auth; Auth-side rate limiting inside this lib. |

## Recommendation for My Pet Care

1. **Treat the package as a thin Fastify Intercepting Filter + outbound credential Factory**, not as a mini bounded context.
2. **Apply** authn/authz separation, fail closed, audience/`iss` binding, ±60s leeway, uniform non-leaky 401, no token/secret logging, local `jose` verify, in-memory cache with **300s** refresh margin, promise single-flight, one 401 retry, and grant **timeouts**.
3. **Avoid** gateway-only auth, introspection/denylist, mTLS/SPIFFE (v1), Circuit Breaker and rate limits in this lib, spoofable identity headers, impersonation, Nest-style DI, and Clean/Hexagon over-layering.
4. **Keep** the three-module shape already sketched; close the skew-margin, timeout, and actor-naming gaps against the requirements/API docs without redesign.

## Sources

### Repo (requirements of truth)

- [`docs/requirements/platform-service-authenticator.md`](../requirements/platform-service-authenticator.md)
- [`docs/requirements/platform-service-authenticator-api.md`](../requirements/platform-service-authenticator-api.md)
- [`docs/architecture/platform-service-authenticator.mmd`](../architecture/platform-service-authenticator.mmd)
- [`docs/research/platform-service-token-lifetime.md`](./platform-service-token-lifetime.md)
- ADR-0002, ADR-0004, ADR-0007, ADR-0008, ADR-0010, ADR-0013, ADR-0014, ADR-0016, ADR-0017, ADR-0018 (`docs/adr/`)
- Package scaffolding: `packages/platform-service-authenticator/src/{verify-token,outbound,plugin,index}.ts`

### External primary sources

- RFC 6749 — OAuth 2.0 — https://www.rfc-editor.org/rfc/rfc6749 (client credentials §4.4; `expires_in` §5.1)
- RFC 6750 — Bearer Token Usage — https://www.rfc-editor.org/rfc/rfc6750 (§3.1 errors; §5.2–5.3 short-lived, scoped, safeguard tokens)
- RFC 6819 — OAuth 2.0 Threat Model — https://www.rfc-editor.org/rfc/rfc6819 (§3.2 short AT life / passive revocation)
- RFC 7519 — JWT — https://www.rfc-editor.org/rfc/rfc7519 (§4.1.3 `aud`; §4.1.4 `exp` leeway)
- RFC 9068 — JWT Profile for OAuth 2.0 Access Tokens — https://www.rfc-editor.org/rfc/rfc9068 (§2.2 `exp` REQUIRED; §4 validation / audience / leeway; authz beyond profile)
- RFC 9700 — OAuth 2.0 Security BCP — https://www.rfc-editor.org/rfc/rfc9700 (§2.2–2.3 audience and privilege restriction)
- RFC 9457 — Problem Details for HTTP APIs — https://www.rfc-editor.org/rfc/rfc9457
- Fastify Encapsulation — https://github.com/fastify/fastify/blob/main/docs/Reference/Encapsulation.md
- Fastify Hooks — https://github.com/fastify/fastify/blob/main/docs/Reference/Hooks.md (`onRequest`; early `reply.send`)
- Fastify Decorators — https://github.com/fastify/fastify/blob/main/docs/Reference/Decorators.md (`decorateRequest` + per-request `onRequest` init)
- fastify-plugin — https://github.com/fastify/fastify-plugin (break encapsulation; metadata `name` / `fastify`)
- jose `jwtVerify` — https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md (`issuer`, `audience`, `clockTolerance`; `getKey` overload)
- Node.js `AbortSignal.timeout` — https://nodejs.org/api/globals.html#abortsignaltimeoutdelay
- Auth0 Token Best Practices — https://auth0.com/docs/secure/tokens/token-best-practices (store and reuse access tokens)
- Resilience4j CircuitBreaker — https://resilience4j.readme.io/docs/circuitbreaker (OPEN rejects calls after threshold—contrast with this package’s policy)
- Bass, L.; Clements, P.; Kazman, R. *Software Architecture in Practice*, 3rd ed., Addison-Wesley, 2012, Ch. 11 (security tactics: Authenticate/Authorize Actors; availability tactics: Retry, Timeout; performance: Caching)
- Saltzer, J. H.; Schroeder, M. D. “The Protection of Information in Computer Systems,” *Proceedings of the IEEE*, 63(9), 1975 (fail-safe defaults; least privilege)
- Gamma, E.; Helm, R.; Johnson, R.; Vlissides, J. *Design Patterns*, Addison-Wesley, 1994 (Factory Method; Strategy; Chain of Responsibility; Decorator)
- Alur, D.; Crupi, J.; Malks, D. *Core J2EE Patterns* (Intercepting Filter) — classic middleware/filter presentation of the same idea Fastify expresses with hooks
