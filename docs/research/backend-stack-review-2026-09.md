# Backend stack review (2026-09)

Before building more features, we re-reviewed ADR-0003 (TypeScript on Node.js) and ADR-0007 (Fastify). The review covered the language as well as the HTTP framework. **Outcome: keep TypeScript on Node.js 24 with Fastify.** No alternative cleared the bar we set: a switch needs a large gain on the top criteria. A separate decision from this review is that the OpenAPI specs in `postman/specs/` become the source of truth for cross-service contracts (ADR-0021).

## Constraints and criteria

- **Why review now.** We wanted to confirm we were not locking in a mistake while only Owner & Pet Manager had real code.
- **Who writes the code.** Mostly AI agents, supervised by one maintainer who is fluent in Python and Kotlin/Java. Maintainer fluency was used as a tie-breaker, not a primary criterion.
- **Scope.** Language and framework together. All four services use one stack.
- **Deployment.** docker compose on one host, so memory use and startup time are not deciding factors.
- **Criteria, in priority order:**
  1. Contract ergonomics: how well the stack fits authoritative OpenAPI 3.1 specs.
  2. Ecosystem and longevity.
  3. Low boilerplate.
  4. Structure/DI (ADR-0018 already gets this from ports and adapters).
  5. Portability.
  6. Raw performance (latency budgets are I/O-bound).
- **Excluded:** Python/FastAPI, because its type checking is optional, which is a poor fit for supervising agent-written code. .NET, because of Ed25519 and Argon2id library gaps (see §B.3).

## Scored comparison

| | **Fastify (TS)**, current | **Ktor (Kotlin)** | **Hono (TS)** | **Go (Huma / stdlib)** |
|---|---|---|---|---|
| Fit with authoritative OpenAPI | Good: `@fastify/swagger` generates the spec from Zod, which can be diffed against the committed specs | Fair: openapi-generator `kotlin-server` stubs; OpenAPI generated from code is newer, and the bundled renderers only handle 3.0 | Good: `@hono/zod-openapi` | Fair: Huma is code-first; oapi-codegen's 3.1 support is only "initial" |
| Ecosystem / maintenance | Strong: OpenJS Foundation, 24 stable releases in the last 12 months, official pino/JWT/CORS/rate-limit plugins | Good: JetBrains; smaller ecosystem than Spring | Fair: pino, rate limiting and Problem Details are third-party or hand-built; 48 repo advisories since 2025 | Strong: stdlib plus mature libraries |
| Ed25519 JWT | Native (`jose`) | Custom provider needed (the auth0 `java-jwt` library has no EdDSA) | Native (`jose`) | Native (`golang-jwt` v5) |
| Domain sum types | Discriminated unions | Sealed classes with exhaustive `when` (best of the four) | Discriminated unions | None (interface idiom plus a linter) |
| Boilerplate | Low | Low–medium | Lowest | Medium |
| Maintainer fluency (tie-breaker) | Not listed | Fluent | Not listed | Not listed |
| Migration cost | None | Full rewrite plus an EdDSA adapter | ~710 source + ~330 test lines in the HTTP layer | Full rewrite |

**Verdict.**
- **Ktor** is the only real challenger, with better domain types and maintainer fluency. It still loses: a full rewrite, a hand-written EdDSA adapter in the service that signs tokens, and less mature OpenAPI tooling. Fluency only breaks ties.
- **Hono** is a sideways move with a weaker ecosystem and a worse security record.
- **Go** is weaker on domain types and no better on contracts.
- **NestJS, Express 5, Elysia and AdonisJS** each fail a basic fit test (§A.3).

**What changed since ADR-0003.** ADR-0003 chose TypeScript mainly because one shared Zod package kept cross-service contracts aligned. In practice that package is 108 lines, mostly Problem Details constants. OpenAPI 3.1 specs already existed for three services. The contract now lives in those specs (ADR-0021), and TypeScript is kept because nothing beats it by enough to justify a rewrite.

## Follow-ups decided

- Replace the community `fastify-type-provider-zod` with the official `@fastify/type-provider-zod`.
- Generate OpenAPI from each service's Zod schemas and fail CI on any difference from `postman/specs/<service>/openapi.yaml`, using `oasdiff`.
- Write the Pet Health Service OpenAPI spec before implementing that service.
- Upgrade to Fastify 6 once it is stable, while only Owner & Pet Manager has real code.

The two research reports behind this review follow, unedited apart from heading levels. Facts are as of 2026-09-30. Each report ends with a list of what could not be verified.

# Appendix A — TypeScript frameworks on Node.js 24


Scope: re-check ADR-0007 (Fastify) against current alternatives for four small REST/JSON services (Node 24, ESM/nodenext, Zod 4 contracts, Drizzle, pino, RFC 9457, jose bearer JWT, ports-and-adapters). I/O-bound latency budgets (p95 read < 500 ms) mean framework overhead is not the deciding factor.

Method: npm registry and npm downloads API (`registry.npmjs.org`, `api.npmjs.org/downloads/point/last-week/<pkg>`, window 2026-09-22..2026-09-28), GitHub API (releases, repo metadata, published security advisories), official docs. "Releases last 12 mo" = stable (non-prerelease) versions published since 2025-09-30, counted from npm `time`.

### 1. Comparison table

| | Fastify | NestJS (+ Fastify adapter) | Hono (+ @hono/node-server) | Express 5 | Elysia | AdonisJS | oRPC (contract layer) |
|---|---|---|---|---|---|---|---|
| Latest | 5.12.5 (2026-09-16); 6.0.0-alpha.4 (2026-09-16) | 12.1.2 (2026-09-30); v12.0.0 2026-08-27 | hono 4.13.12 (2026-09-30); node-server 2.1.3 (2026-09-29) | 5.2.1 (2025-12-01) | 1.4.30 (2026-08-26); 2.0.0-beta.19 | @adonisjs/core 7.5.2 (2026-09-23); v7.0.0 2026-02-25 | @orpc/server 1.15.4 (2026-09-23); 2.0.0-beta.40 |
| Stable releases last 12 mo | 24 | 41 | 71 | 6 | 21 | 20 | 50 |
| Weekly npm downloads | 16.3M | @nestjs/core 17.5M; platform-fastify 2.1M | hono 76.0M; node-server 69.5M | 158.9M | 1.32M (@elysiajs/node 74k; @elysia/node 17k) | 187k | 1.67M |
| Governance | OpenJS Foundation (At-Large) | Company/individual-led (Kamil Myśliwiec; Trilon) | honojs org; creator is a Cloudflare dev advocate | OpenJS Foundation (Impact) | Individual-led (SaltyAom) | Small core team | Individual/small org (middleapi) |
| Node 24 | Yes (v5 LTS table lists 20/22/24/26; v6 requires >=24) | Yes (v12 needs 20.19+/22.12+) | Yes (node-server engines >=20) | Yes (>=18) | Via adapter (srvx); Bun-first | Required (engines >=24) | Yes |
| TS typing | Good (type providers infer schema types); declaration merging for decorators | Good, decorator/metadata-based; DTO typing via schemas | Excellent inference (routes, validators, RPC client) | Weak: `@types/express` (DefinitelyTyped) | Excellent inference (TypeBox-native) | Good; own validator VineJS | Excellent (contract-first) |
| Zod 4 path | Type provider: `fastify-type-provider-zod` 7 (community, in repo) or official `@fastify/type-provider-zod` 1.0 | v12 built-in Standard Schema pipe/interceptor; `nestjs-zod` 5.5 (peers only Nest 10/11) | `@hono/zod-validator` (zod ^3.25/^4), `@hono/standard-validator` | Manual middleware or `express-zod-api` 29 | Standard Schema supported | Not native (VineJS); manual | `@orpc/zod` |
| OpenAPI from Zod | `@fastify/swagger` + provider's `jsonSchemaTransform` | v12: Standard Schema feeds OpenAPI (`@nestjs/swagger` 12) | `@hono/zod-openapi` 1.6 (zod ^4), `hono-openapi` 1.3 | `zod-openapi` / `@asteasolutions/zod-to-openapi` (framework-agnostic) | `@elysiajs/openapi` (TypeBox-first; Zod not confirmed) | Tuyau; native planned post-v7 | `OpenAPIGenerator` + `ZodToJsonSchemaConverter` |
| In-process tests | `app.inject()` (light-my-request) | `Test.createTestingModule` + Fastify `inject` | `app.request()` / `testClient` | supertest (third party) | `app.handle(new Request())` | Japa test client | handler-level / adapter tests |
| fastify/benchmarks req/s (Node 24.20, 4 vCPU, autocannon -c100 -p10) | 97,595 | not listed (~Fastify minus Nest overhead; unverified) | 88,525 | 59,651 | 88,800 (on Node) | 89,837 | n/a (trpc-router 17,704 for reference) |
| Published GHSAs since 2025-01-01 (repo) | 13 | 10 | 48 (+5 in node-server) | 1 (rejected) | 6 | 4 | 0 found |
| Migration cost from current code | none | high | medium | medium-high | medium-high (and Bun-first) | very high | medium (additive) |

Sources for the table are listed per section below.

### 2. What in this repo is Fastify-coupled (basis for migration estimates)

Read from `services/owner-pet-manager/src`, `packages/platform-service-authenticator/src`, tests, and ADR-0007/0013/0018/0020.

Fastify-coupled (~710 source lines + ~330 test lines):
- `services/owner-pet-manager/src/app.ts` (203 lines): `Fastify({ loggerInstance, logController: new LogController({ disableRequestLogging: true }) })`, `.withTypeProvider<ZodTypeProvider>()`, `setValidatorCompiler/setSerializerCompiler`, `onRequest`/`onResponse` hooks, `reply.elapsedTime`, `request.routeOptions.url` (route template for logs), `setNotFoundHandler`, `setErrorHandler` detecting `"validation" in error`, `reply.serializer(...)` for problem+json, `declare module "fastify"` for `correlationId`.
- `services/owner-pet-manager/src/http/routes.ts` (386 lines): route definitions with Zod `schema` blocks, `request.params/query/body` casts, `reply.status().send()`, result-to-Problem mapping.
- `packages/platform-service-authenticator/src/plugin.ts` (122 lines): `fastify-plugin` (`fastify: "5.x"`), `decorateRequest("actor")`, global `onRequest` hook, `FastifyReply` for 401. The pure parts (`isPublicRoute`, bearer parsing, `verify-token.ts` with jose, `outbound.ts`) are framework-agnostic.
- Tests: `services/owner-pet-manager/test/http.test.ts` (179) and `packages/platform-service-authenticator/test/plugin.test.ts` (149) use `app.inject`.
- Four skeleton services (`services/*/src/app.ts`) import Fastify.
- ADR-0013 hard-codes "through Fastify's Pino logger" and `disableRequestLogging`; ADR-0018/0020 name "Fastify HTTP adapters".

Framework-agnostic (~1.9k lines): `application/`, `domain/`, `infrastructure/` (Drizzle store, clients, AsyncLocalStorage correlation), `verify-token.ts`, `outbound.ts`, `use-cases.test.ts`, `persistence.test.ts`. The ports-and-adapters split (ADR-0018) is what keeps a migration bounded to the HTTP adapter layer.

### 3. Per-framework findings

#### 3.1 Fastify (incumbent)

- Version: 5.12.5 published 2026-09-16; v5.0.0 was 2024-09-17. `next` dist-tag is 6.0.0-alpha.4 (alphas since 2026-08-11). Repo lockfile resolves `fastify@5.12.5`. [npm](https://registry.npmjs.org/fastify), [releases](https://github.com/fastify/fastify/releases)
- Cadence/governance: 24 stable releases in 12 months; OpenJS Foundation At-Large project. LTS: each major supported >= 6 months, plus 6 months of security fixes after the next major ships; v5 is tested on Node 20, 22, 24, 26; v6 on 24, 26. [OpenJS projects](https://openjsf.org/projects), [LTS.md](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md)
- Fastify 6 (in alpha): V6 planning issue targeted "alpha in July and shipping in September" (2026). Checked items: minimum Node.js bumped to v24, removal of deprecations FSTDEP022-025, remove `FastifyPlugin`, `FastifyLoggerInstance`, `FastifyRequestContext`, `ValidationResult` types, `allowErrorHandlerOverride` false by default, undici v8. Open question: remove fast-json-stringify and validate responses with Ajv (#6507). Migration guide not yet written. [issue #6834](https://github.com/fastify/fastify/issues/6834), [v6.0.0-alpha.0](https://github.com/fastify/fastify/releases/tag/v6.0.0-alpha.0), [#6507](https://github.com/fastify/fastify/issues/6507). Impact on this repo looks small (one root `setErrorHandler`; `fastify-plugin` declares `fastify: "5.x"` and must be bumped).
- Downloads: 16.27M/week. Stars 37.2k.
- Zod 4: the repo uses the community `fastify-type-provider-zod` 7.0.0 (2026-06-24; peers `fastify ^5.5.0`, `zod >=4.1.5`; v7 uses Zod `.encode()/.decode()` so response serialization follows `z.output<T>`; 1.38M/week). Since 2026-04-19 there is also an official `@fastify/type-provider-zod` 1.0.0 in the fastify org (peers `zod >=4.2.0`, `fastify ^5.5.0`, `@fastify/swagger >=9.5.1`; 37k/week), and the Fastify v5 Type-Providers doc now points to `@fastify/type-provider-zod`. The Ecosystem doc still lists the turkerdev package. [npm @fastify/type-provider-zod](https://www.npmjs.com/package/@fastify/type-provider-zod), [repo](https://github.com/fastify/fastify-type-provider-zod), [Type-Providers.md @v5.12.5](https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Type-Providers.md), [turkerdev releases](https://github.com/turkerdev/fastify-type-provider-zod/releases)
- OpenAPI: `@fastify/swagger` 9.9.0 (2026-09-22, 3.0M/week) with the provider's `jsonSchemaTransform`; provider v6 added auto OpenAPI 3.0/3.1 mode switching. [turkerdev v6.0.0 notes](https://github.com/turkerdev/fastify-type-provider-zod/releases/tag/6.0.0)
- Ecosystem (official `@fastify/*`): `@fastify/jwt` 10.2.2, `@fastify/cors` 11.3.0 (7.6M/week), `@fastify/rate-limit` 11.2.0 (3.5M/week), pino is the built-in logger. No official RFC 9457 plugin found; the repo's own `sendProblem` covers it.
- Testing: `app.inject()` (light-my-request), already used.
- Benchmarks: fastify/benchmarks README, run 2026-09-02, Node v24.20.0, linux x64 4 vCPU, `autocannon -c 100 -d 40 -p 10`: fastify 5.12.1 97,595 req/s vs node-http 98,864. Caveat from the README: runs on GitHub Actions ("noisy neighbor"), measures framework overhead only, and is maintained by the Fastify org. [fastify/benchmarks](https://github.com/fastify/benchmarks), [fastify.dev/benchmarks](https://fastify.dev/benchmarks/)
- Security 2025-2026: 13 published GHSAs since 2025-01-01, many about content-type parsing letting body validation be bypassed (CVE-2025-32442, CVE-2026-25223, CVE-2026-33806, CVE-2026-3419) and trustProxy header spoofing. The 2026-09-04 batch (fixed in 5.12.2) includes an auth bypass: malformed URLs could reach an encapsulated not-found handler of a sibling plugin, skipping auth hooks (GHSA-p68q-wchp-6fh7), a header validation bypass, a boolean-false schema bypass, and an async validation body-swap. GHSA-4mh8-r7rc-xpvc (HTTP/2 trailer DoS) fixed in 5.12.5. The repo's `^5.12.5` includes all fixes. The not-found bypass needs prefix-encapsulated not-found handlers, which OPM does not register. [advisories](https://github.com/fastify/fastify/security/advisories), [GHSA-p68q-wchp-6fh7](https://github.com/fastify/fastify/security/advisories/GHSA-p68q-wchp-6fh7)
- Fit: plugin encapsulation + hooks map onto one HTTP adapter per service; no DI container (the repo passes `UseCaseDeps` explicitly, which fits ADR-0018).
- Migration cost: none. One optional follow-up: move from `fastify-type-provider-zod` to `@fastify/type-provider-zod` (same API; drop-in apart from the import name and the `zod >=4.2` peer, which is satisfied by zod 4.6.5).

#### 3.2 NestJS (with `@nestjs/platform-fastify`)

- Version: 12.1.2 (2026-09-30); v12.0.0 2026-08-27; v11 was 2025-01-16. 41 stable releases in 12 months. `@nestjs/platform-fastify` 12.1.2 depends on `fastify 5.12.5`. [npm](https://registry.npmjs.org/@nestjs/core), [v12.0.0 release](https://github.com/nestjs/nest/releases/tag/v12.0.0)
- Downloads: @nestjs/core 17.5M/week; platform-fastify 2.1M; platform-express 12.7M. Stars 76.8k.
- Governance: led by its creator (Kamil Myśliwiec), funded through Open Collective and commercial support; not foundation-hosted (absent from the OpenJS project list). [OpenJS projects](https://openjsf.org/projects), [opencollective.com/nest](https://opencollective.com/nest)
- v12 highlights: all core packages ship ESM (CJS apps keep working through `require(esm)`), Node 20.19+/22.12+ required, **first-class Standard Schema**: `@Body({ schema })`, `@Param(..., { schema })` + `StandardSchemaValidationPipe`, `StandardSchemaSerializerInterceptor` for responses; "The same schemas feed OpenAPI generation." Also `@nestjs/observe`, route-conflict diagnostics, reworked HTTP adapter error mapping. [v12.0.0 release](https://github.com/nestjs/nest/releases/tag/v12.0.0)
- Zod 4: native in v12 via Standard Schema. `nestjs-zod` 5.5.0 (2026-07-25) still peers `@nestjs/common ^10 || ^11`, so it does not declare Nest 12 support yet. [npm nestjs-zod](https://www.npmjs.com/package/nestjs-zod)
- Ecosystem: `@nestjs/swagger` 12.0.2, `@nestjs/throttler` 6.7.1 (peers include Nest 12), `nestjs-pino` 5.2.1 (peers Nest 12, pino ^10). With the Fastify adapter, "recipes that rely on Express may not work" and middleware receives raw `req`/`res`. Nest docs say Fastify is "nearly twice" Express in benchmarks. [Nest performance docs](https://docs.nestjs.com/techniques/performance)
- Testing: `Test.createTestingModule` for DI overrides; HTTP via Fastify `inject` or supertest.
- Security 2025-2026: 10 GHSAs, several specifically in the Fastify adapter's middleware layer: URL-encoding middleware bypass (CVE-2025-69211, CVE-2026-2293), HEAD request bypass (CVE-2026-33011), trailing-slash bypass (CVE-2026-54281, `<= 11.1.23`), path-scoped middleware bypass via absolute-form targets (2026-09-15); plus a critical CSRF-to-RCE in `@nestjs/devtools-integration` (CVE-2025-54782). [advisories](https://github.com/nestjs/nest/security/advisories)
- Fit: strongest built-in DI/modules; ADR-0007 and ADR-0018/0020 explicitly rejected Nest-style modules as boilerplate for these services.
- Migration cost: high. All of `app.ts`, `routes.ts` (to controllers/pipes/filters/interceptors), the authenticator (to a Guard or middleware; the pure `verifyToken` survives), logging hooks (to an interceptor or nestjs-pino), error handler (to an exception filter), plus wiring use cases as providers. The Fastify instance remains underneath but Nest's lifecycle replaces direct hooks. Also adds `reflect-metadata`/decorators to an ESM + TS 7 build (see unverified).

#### 3.3 Hono on Node (`@hono/node-server`)

- Version: hono 4.13.12 (2026-09-30), v4.0.0 2024-02-09; 71 stable releases in 12 months. `@hono/node-server` 2.1.3 (engines node >=20); v2.0.0 (2026-04-21) keeps the public API and claims "up to 2.3x the throughput of v1" (peak, body-parsing scenario of SaltyAom's bun-http-framework-benchmark). The same release notes concede srvx `FastResponse` beats Hono v2 in srvx's own bench. [npm hono](https://registry.npmjs.org/hono), [node-server v2.0.0](https://github.com/honojs/node-server/releases/tag/v2.0.0)
- Downloads: hono 76.0M/week, node-server 69.5M/week (both include many non-server and edge uses). Stars 32.4k.
- Governance: honojs GitHub org, MIT; creator Yusuke Wada is a Cloudflare developer advocate; not foundation-hosted. [Cloudflare author page](https://blog.cloudflare.com/author/yusuke-wada/), [OpenJS projects](https://openjsf.org/projects)
- Zod 4 / Standard Schema: `@hono/zod-validator` 0.9.1 (peers zod ^3.25 || ^4, 5.5M/week), `@hono/standard-validator` 0.4.0 (1.3M/week). [Hono validation guide](https://hono.dev/docs/guides/validation)
- OpenAPI: `@hono/zod-openapi` 1.6.3 (peer zod ^4, 2.8M/week) or `hono-openapi` 1.3.3 (1.7M/week).
- Ecosystem: built-in JWT/JWK, CORS, request-id, body-limit, secure-headers middleware; pino via third-party `hono-pino` 0.10.3 (last release 2025-10-05, 148k/week); rate limit via third-party `hono-rate-limiter` 0.5.4. No RFC 9457 helper (same as others).
- Testing: `app.request()` in-process, plus a typed `testClient`. [Hono testing](https://hono.dev/docs/guides/testing)
- Benchmarks: fastify/benchmarks (2026-09-02, Node 24): hono 4.13.5 88,525 req/s vs fastify 97,595 (about 9% lower, same caveats).
- Security 2025-2026: 48 GHSAs on honojs/hono since 2025-01 (many in JSX/SSG/static/Lambda helpers not relevant here), but relevant ones include CORS middleware reflecting any Origin with credentials when `origin` defaults to wildcard (CVE-2026-54290, high), CORS ReDoS (CVE-2026-69207), `parseBody()` memory exhaustion (CVE-2026-84364), query parser reading past `#` (CVE-2026-84363). `@hono/node-server` had 5 more, mostly `serveStatic` bypasses and a WebSocket handshake memory-leak DoS. [hono advisories](https://github.com/honojs/hono/security/advisories), [node-server advisories](https://github.com/honojs/node-server/security/advisories)
- Fit: plain functions + `c.set/c.get` context variables; no DI; ports-and-adapters is as easy as with Fastify.
- Migration cost: medium. Rewrite `app.ts` (hooks become middleware; `reply.elapsedTime` and `routeOptions.url` become `performance.now()` and `c.req.routePath`), `routes.ts` (schemas move into `zValidator`/`createRoute`), authenticator plugin to a `MiddlewareHandler` (pure logic survives), not-found/error handlers to `app.notFound`/`app.onError`, logger wiring (Hono has no built-in pino logger; ADR-0013 must change), tests from `inject` to `app.request`. Use cases, domain, infrastructure untouched.

#### 3.4 Express 5

- Version: 5.2.1 (2025-12-01); v5.0.0 2024-09-10; 6 stable releases in 12 months (5.x and 4.x lines together). v5 min Node 18, support "ongoing"; v4 also still supported. [npm](https://registry.npmjs.org/express), [support page](https://expressjs.com/en/support/)
- Governance: OpenJS Foundation Impact project. [OpenJS projects](https://openjsf.org/projects)
- Downloads: 158.9M/week (dominant, largely legacy/transitive). Stars 69.5k.
- Typing: via DefinitelyTyped `@types/express`; no schema-driven inference (ADR-0007's "weaker TypeScript story" still holds).
- Zod 4: manual middleware, or `express-zod-api` 29.8.1 (peers zod ^4.3.4, express ^5.1, **typescript ^5.1.3 || ^6.0.2**, so not TS 7 which the repo uses; 25k/week). OpenAPI via framework-agnostic `zod-openapi` 6.0.2 (1.6M/week) or `@asteasolutions/zod-to-openapi` 9.1.0 (5.3M/week). [npm express-zod-api](https://www.npmjs.com/package/express-zod-api)
- Ecosystem: largest (cors, express-rate-limit 72.9M/week, pino-http, helmet); all third-party.
- Testing: supertest (external).
- Benchmarks: 59,651 req/s on fastify/benchmarks (about 39% below Fastify), irrelevant at these latency budgets.
- Security 2025-2026: express repo shows only one advisory (CVE-2024-51999), later marked REJECTED. [express advisories](https://github.com/expressjs/express/security/advisories)
- Migration cost: medium-high: everything Fastify-coupled plus hand-built validation/typing glue that Fastify's type provider gives for free.

#### 3.5 Elysia (Node vs Bun)

- Version: 1.4.30 (2026-08-26); 2.0.0-beta.19 on `next` (peers `typebox >=1.3`, `@types/bun >=1.3`). 21 stable releases in 12 months. 1.32M/week, 19.2k stars. [npm](https://registry.npmjs.org/elysia), [releases](https://github.com/elysiajs/elysia/releases)
- Runtime: README tagline "Supercharged by Bun". The docs show a Node adapter (docs name `@elysia/node`); npm has both `@elysiajs/node` 1.4.5 (2026-02-17, 74k/week) and `@elysia/node` 1.4.6 (package created 2026-05-19, 17k/week), both built on `srvx` and pointing to `github.com/elysiajs/node` (74 stars, 19 open issues). The docs page gives no limitations or stability statement. `elysia` itself peer-depends on `@types/bun`. Conclusion: viable on Node, but Node is a secondary target with a thin adapter. [Elysia Node docs](https://elysiajs.com/integrations/node), [elysiajs/node](https://github.com/elysiajs/node)
- Zod 4: Standard Schema supported ("use your favorite validation library"). OpenAPI via `@elysiajs/openapi` is TypeBox-first; the docs do not confirm Zod-to-OpenAPI. [Elysia validation](https://elysiajs.com/essential/validation)
- Benchmarks: on Node, fastify/benchmarks shows elysia 1.4.29 88,800 req/s (about Hono's figure).
- Security: critical RCE (GHSA-gmm9-qwx3-2m3h, 2026-09-01, `<= 1.4.29`): Elysia compiles handlers with `new Function()` and embedded schema property names/defaults unescaped. Also critical prototype pollution (CVE-2025-66456) and cookie-config code injection (CVE-2025-66457). [advisories](https://github.com/elysiajs/elysia/security/advisories)
- Migration cost: medium-high (full HTTP layer rewrite), plus a Bun-first project running on Node, and single-maintainer risk.

#### 3.6 AdonisJS

- Version: @adonisjs/core 7.5.2 (2026-09-23); v7.0.0 2026-02-25; engines `node >=24.0.0`. 20 stable releases in 12 months; 187k/week. [npm](https://registry.npmjs.org/@adonisjs/core), [v7 release](https://github.com/adonisjs/core/releases/tag/v7.0.0), [v7 blog](https://adonisjs.com/blog/v7)
- Nature: batteries-included MVC (IoC container, Lucid ORM, VineJS validator, auth, own logger on pino). v7 adds end-to-end type safety and OpenTelemetry; OpenAPI via Tuyau, with native generation planned after v7. [Roadmap to v7](https://adonisjs.com/blog/roadmap-to-adonisjs-7)
- Zod 4: not the native path (VineJS); you'd validate Zod manually.
- Benchmarks: fastify/benchmarks lists "adonisjs 9.3.0" (the http-server package) at 89,837 req/s.
- Security: critical path traversal in multipart handling (CVE-2026-21440), prototype pollution + DoS in multipart (CVE-2026-25754, -25762), incomplete fix (CVE-2026-48795). [advisories](https://github.com/adonisjs/core/security/advisories)
- Migration cost: very high. It clashes with Drizzle, the Zod contracts package and the thin ports-and-adapters layout. Not a fit.

#### 3.7 Contract layers on top (not replacements)

- **oRPC**: @orpc/server 1.15.4 (2026-09-23), 50 stable releases in 12 months, 1.67M/week, 5.7k stars (middleapi org); 2.0 in beta. `OpenAPIHandler` serves REST endpoints (vs `RPCHandler`), has adapters for Fastify and others, and generates OpenAPI with `OpenAPIGenerator` + `ZodToJsonSchemaConverter` from `@orpc/zod` (peers zod >=3.25). Caveat on Fastify: bodies that bypass Fastify's parsers also skip `bodyLimit`. It could replace hand-written routes and provide typed clients for service-to-service calls, but it moves the HTTP contract into oRPC's model (RFC 9457 mapping and indistinguishability collapsing would need interceptors). [oRPC Fastify adapter](https://orpc.dev/docs/adapters/fastify), [oRPC OpenAPI spec](https://orpc.dev/docs/openapi/openapi-specification)
- **ts-rest**: `@ts-rest/core` latest 3.52.1 (2025-03-04), latest dist peer `zod ^3.22.3`, no stable release in 12 months (3.53.0-rc.1 2025-06-02), last push 2026-02-06. Appears stalled; avoid for Zod 4. [npm](https://registry.npmjs.org/@ts-rest/core)
- **tRPC**: not REST (ADR-0004 already rejects it). fastify/benchmarks lists `trpc-router` 11.18.0 at 17,704 req/s.
- Other frameworks seen in benchmarks: h3 2.0.1-rc.32 (still RC, 53.5M/week mostly via Nuxt/Nitro), Koa 3.2.1 (8.8M/week). Neither is a common default for typed REST APIs with Zod on Node; not evaluated further.

### 4. Key trade-offs for this repo

1. Fastify still fits ADR-0007: it's foundation-hosted, the fastest option measured on Node, uses pino natively (ADR-0013), `inject` is already used for tests, and there are now two Zod 4 type providers, one of them official.
2. The one Fastify event to plan for is v6 (alpha since 2026-08-11, planned for about September 2026). It requires Node 24, which the repo already uses. The breaking changes seen so far are type removals and `allowErrorHandlerOverride`. v5 then gets security fixes for 6 months after v6 ships.
3. Fastify had many validation-bypass advisories in 2026. All are fixed in the repo's 5.12.5. Keep the lockfile current, because the fixes landed in minors (5.12.1, .2 and .5).
4. Hono is the credible lighter alternative. It has strong inference and `@hono/zod-openapi`, but pino, rate-limit and Problem Details come from third parties or have to be hand-built. It has more advisories, about 9% lower Node throughput on the Fastify benchmark, and a medium rewrite of the HTTP layer.
5. NestJS 12 fixed the Zod story with Standard Schema, but it re-adds the DI/module layer that was rejected. Its Fastify adapter has had repeated middleware-bypass CVEs.
6. Express 5, Elysia (Bun-first on Node) and AdonisJS (a full-stack model that clashes with Drizzle and Zod) are weaker fits.

### 5. Could not verify

- NestJS request throughput on Node 24 from a neutral source (Nest isn't in fastify/benchmarks; Nest's docs give only "nearly twice" Express for Fastify vs Express).
- TechEmpower rounds covering these framework versions (not checked).
- Whether each framework's types compile cleanly under **TypeScript 7** (the repo pins `typescript ^7.0.2`). Only `express-zod-api` visibly excludes TS 7 in its peers. Nest's decorator/`emitDecoratorMetadata` needs under TS 7 were not checked.
- Fastify 6 GA date and final breaking changes (no migration guide yet; #6507 on removing fast-json-stringify is still open).
- Whether the community `fastify-type-provider-zod` will be deprecated in favor of `@fastify/type-provider-zod` (no deprecation flag on npm, and nothing announced that I found).
- Whether `nestjs-zod` will add Nest 12 peers, and how Nest 12's Standard Schema OpenAPI handles Zod-specific features (for example `.transform`, discriminated unions).
- Elysia-on-Node limitations (the docs are silent), and whether `@elysia/node` is replacing `@elysiajs/node`.
- Zod-to-OpenAPI support in `@elysiajs/openapi`.
- NestJS funding details beyond Open Collective (the company-backing claim is general knowledge, not checked against a primary page).
- Download counts are for one week, 2026-09-22..28. Hono's and Express's include heavy transitive or non-server use, so they overstate direct REST-API adoption.
- Advisory counts come only from repo-level GitHub advisories. Advisories filed on other repos (for example `@fastify/*` plugins, `path-to-regexp`, `body-parser`) are not included.

# Appendix B — Other languages and stacks


Scope: Go, Kotlin/JVM, .NET, plus short notes on Python FastAPI and Rust Axum. TypeScript/Node frameworks are out of scope here (covered by another agent). Facts come from vendor docs, GitHub release APIs (queried 2026-09-30), and the 2025 Stack Overflow / JetBrains surveys.

### Repo context that shapes the comparison

- Four services, each with its own Postgres DB. Calls between them are synchronous REST/JSON (ADR-0002, ADR-0004). The TS `packages/contracts` package is small (108 lines of Zod: Problem Details shapes and constants). `packages/platform-service-authenticator` is about 350 lines of source (inbound Ed25519 JWT verify, outbound client-credentials token cache). Owner & Pet Manager is the only service with real logic. The repo has about 6k lines of TS in total, tests included.
- **OpenAPI 3.1 specs already exist** for three services at `postman/specs/{owner-pet-manager,authentication-service,activity-manager}/openapi.yaml`. OPM and Activity Manager already use `oneOf`/`discriminator`. So the "OpenAPI as source of truth" path has a head start in any language. Tools that only support OpenAPI 3.0 are a real constraint.
- The current Argon2 library is `argon2` (node) ^0.44, and it stores PHC-format strings (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`). Authentication Service reads the hash from OPM (ADR-0002), so both sides must agree on the encoding. Every Argon2id option below can verify PHC strings, directly or through a wrapper, but check this when two services use different libraries.

### Comparison table

| Dimension | Go (1.27) | Kotlin/JVM: Spring Boot 4.1 | Kotlin/JVM: Ktor 3.6 | .NET 10 (ASP.NET Core Minimal APIs) |
|---|---|---|---|---|
| Latest / support | Go 1.27.1 (1.27.0 released 2026-08-19). Each release is supported until two newer majors exist, so about 1 year | Boot 4.1.1. OSS support until 2027-07-31, 4.2 due Nov 2026. JDK 17+ baseline, Kotlin 2.3 baseline | Ktor 3.6.0 (2026-09-16), JetBrains-run. Kotlin 2.4.20 is current | .NET 10.0.12 LTS, supported until 2028-11-14. .NET 11 (STS) due 2026-11-10 |
| Governance | Google Go team. Frameworks are community projects (chi, echo, gin, huma) | Broadcom/VMware Spring team | JetBrains | Microsoft/.NET Foundation |
| Ed25519 JWT | Good: `golang-jwt/jwt/v5` `SigningMethodEdDSA` on stdlib `crypto/ed25519`. `go-jose` v4 and `jwx` v4 also work | Partial: Nimbus JOSE+JWT supports EdDSA but needs the optional Tink dependency. Spring Security `NimbusJwtEncoder` EdDSA issue #17098 is still open (PR #19175 open). jjwt 0.13 supports EdDSA on JDK 15+ | `ktor-server-auth-jwt` is built on auth0 `java-jwt`, which has no EdDSA. You need a custom provider with Nimbus or jjwt | Weak: no Ed25519 in the BCL (dotnet/runtime #63174 API approved May 2026, milestone "Future"). `Microsoft.IdentityModel` has no EdDSA. The third-party `ScottBrady.IdentityModel` (last release Nov 2024, BouncyCastle-based) fills the gap |
| Argon2id | `golang.org/x/crypto/argon2.IDKey` (raw). `alexedwards/argon2id` adds PHC strings | Spring Security `Argon2PasswordEncoder` (needs BouncyCastle), or BC directly | Same JVM libs (BC, or Spring Security crypto standalone) | No BCL support. Options: NSec (libsodium, raw bytes, no PHC), Geralt 4.4 (libsodium), Konscious (last release 2024-06), BouncyCastle.Cryptography 2.7 |
| RFC 9457 | Not in stdlib or chi/echo/gin, so hand-rolled. Huma emits RFC 9457 by default | Built in: `ProblemDetail`/`ErrorResponse`. Boot `spring.mvc.problemdetails.enabled` | Hand-rolled with the StatusPages plugin | Built in: `AddProblemDetails`/`IProblemDetailsService`. .NET 10 validation errors go through it |
| OpenAPI | Code-first: Huma (3.1). Spec-first: oapi-codegen v2.8 (3.1 support new in v2.8.0, described as "initial") or ogen | Code-first: springdoc-openapi 3.1.x. Spec-first: openapi-generator `kotlin-spring` | Code-first: compiler-plugin + runtime metadata (3.4+). Spec-first: openapi-generator `kotlin-server` (ktor) | Code-first built in: `Microsoft.AspNetCore.OpenApi`, OpenAPI 3.1 by default, build-time generation. Clients: Kiota 1.35, NSwag 14.7. Spec-first server generation is weaker (openapi-generator `aspnetcore`) |
| Testing | `net/http/httptest` in-process. testcontainers-go 0.44 | `@SpringBootTest`/MockMvc/WebTestClient. Testcontainers-java 2.0 + `@ServiceConnection` | `testApplication {}` in-process. Testcontainers-java | `WebApplicationFactory` in-process. Testcontainers for .NET 4.15 |
| Footprint / startup | Single static binary, no runtime to install. Smallest of the options (qualitative) | Heaviest on JVM. Mitigations: AOT cache, CRaC, GraalVM native | Lighter than Spring on JVM. Native is possible but less common | Moderate on JIT. Native AOT supported for Minimal APIs (partial), which lowers memory and startup; needs STJ source-gen, and EF Core has AOT limits |
| Sum types | None. Interface plus unexported-method pattern, and exhaustiveness only through a linter (`go-check-sumtype`) | `sealed interface`/`sealed class` + exhaustive `when` | Same as Spring | C# 15 `union` in .NET 11 (preview, GA Nov 2026, STS). On .NET 10 LTS: records + abstract base, or `OneOf` |
| DB layer | sqlc 1.31 + pgx v5.11 (SQL-first, typed). GORM 1.31 / ent 0.14 | Spring Data JDBC, jOOQ 3.21, Exposed 1.5 | Exposed 1.5 / jOOQ | EF Core 10 + Npgsql, or Dapper 2.1 |
| Migrations | goose 3.28, Atlas 1.3 (open-core) | Flyway 13.8 (Boot auto-config), Liquibase | Flyway (manual wiring) | EF Core migrations, or Flyway/DbUp |
| SO 2025 usage (pro devs) | Go 17.4% | Kotlin 11.5%, Spring Boot 15.6% | Ktor not listed | C# 29.9%, ASP.NET Core 21.3% |

### Cross-cutting: keeping contracts aligned without a shared TS package

This was the deciding argument in ADR-0003. The options below are language-neutral and mostly already started in this repo:

1. **OpenAPI 3.1 as the source of truth** (the `postman/specs/*/openapi.yaml` files already exist). Each service either generates server stubs and types from its own spec (spec-first), or generates its spec from code and CI diffs it against the committed file (code-first).
2. **Generate consumer clients from the provider's spec.** Go: oapi-codegen/ogen clients. Kotlin: openapi-generator `kotlin`, or Spring `@HttpExchange` interfaces written by hand. .NET: Kiota/NSwag. In a single-language monorepo, a generated client package per provider plays the role that `packages/contracts` plays today.
3. **Detect breaking changes in CI** with `oasdiff` (v1.32.1, 2026-09-15). Lint with Spectral (v6.16.3).
4. **Contract tests.** Schemathesis v4.28 fuzzes a running service against its spec. Prism v5.16 mocks a provider from its spec for consumer tests. Pact (JVM 4.7.5) adds consumer-driven contracts. The existing Postman collections stay valid because they only speak HTTP.
5. **Shared Problem Details constants** (`urn:my-pet-care:*` types) move into each spec's `components/schemas` and `examples`, or into a small per-language constants module.

Caveat: every spec-first generator handles OpenAPI 3.1 `oneOf`/`discriminator` differently. The existing specs use both, so try each generator on the real specs before committing to one.

### 1. Go

- **Versions and support.** Go 1.27.0 shipped 2026-08-19 and 1.27.1 on 2026-09-01. 1.26 is still supported. The policy is that "each major Go release is supported until there are two newer major releases" ([release history](https://go.dev/doc/devel/release)). Go 1.27 adds generic methods (not on interfaces) and makes `encoding/json` v2-backed by default ([Go 1.27 notes](https://go.dev/doc/go1.27)).
- **Routers** (releases per the GitHub API):
  - stdlib `net/http` has method + wildcard patterns since 1.22 ([routing enhancements](https://go.dev/blog/routing-enhancements)). It is enough for this API surface.
  - chi v5.3.2 (2026-08) is stdlib-compatible middleware and routing.
  - Echo v5.4.0 (2026-09-27). Echo v5 is a new major, so check how mature the ecosystem is.
  - Gin v1.12.0 (2026-02).
  - Huma v2.39.1 (2026-07) is code-first OpenAPI 3.1 with RFC 9457 errors by default ([Huma errors docs](https://huma.rocks/features/response-errors/)). It has adapters for stdlib (`humago`), chi, echo, gin, fiber, gorilla/mux, httprouter, bunrouter, and flow ([adapters dir](https://github.com/danielgtaylor/huma/tree/main/adapters)). Huma is mostly a single-maintainer project (inferred from the repo, not verified).
- **OpenAPI-first.** oapi-codegen v2.8.0 (2026-07-17) added initial OpenAPI 3.1 support and closed issue #373 ([release](https://github.com/oapi-codegen/oapi-codegen/releases/tag/v2.8.0)). It generates stdlib, chi, echo, gin, fiber, and so on. ogen v1.24.0 generates server + client with validation and sum types for `oneOf` ([ogen docs](https://ogen.dev/docs/intro)); its OpenAPI 3.1 coverage is not verified.
- **DB.** sqlc v1.31.1 + pgx v5.11.0 generate typed Go from SQL. This fits "SQL in adapters behind ports". Alternatives are GORM v1.31.2 and ent v0.14.6 (ent is schema-as-code with a graph model, which is heavier than needed). Migrations: goose v3.28.0 (plain SQL, library or CLI) or Atlas v1.3.0 (declarative; open-core with paid tiers, see [atlasgo.io](https://atlasgo.io)).
- **JWT.** `golang-jwt/jwt/v5` (v5.3.1) provides `SigningMethodEdDSA`/`SigningMethodEd25519` over stdlib `crypto/ed25519` ([pkg docs](https://pkg.go.dev/github.com/golang-jwt/jwt/v5)). Alternatives are go-jose v4.1.5 and lestrrat-go/jwx v4.5.0.
- **Argon2id.** `golang.org/x/crypto/argon2.IDKey` is maintained by the Go team. The `alexedwards/argon2id` wrapper produces and parses PHC strings in the reference C format ([README](https://github.com/alexedwards/argon2id)).
- **Problem Details.** No stdlib type. It takes about 30 lines by hand, or comes free with Huma.
- **Testing.** `httptest` in-process, plus testcontainers-go v0.44.0 (Postgres module).
- **Domain types.** Go has no sum types. Share audiences (Owner / Forum / Group activity / external link) and Activity type kinds (platform-default / custom / soft-retired) become a sealed-interface idiom plus a linter (`alecthomas/go-check-sumtype` v0.5.0) for exhaustiveness. ADR-0003 already names this as Go's weakness.
- **Ergonomics.** Small language, fast builds, one static binary per service. Error handling is verbose. There is no DI container, so ports and adapters are wired by hand, which fits ADR-0018.

### 2. Kotlin on the JVM

- **Kotlin.** 2.4.20 (2026-09-07) is current. **JDK 25** is the current Java LTS (not re-verified).
- **Spring Boot.** 4.1 was released 2026-06 and the latest patch is 4.1.1. OSS support runs to 2027-07-31 and commercial support to 2028-07-31. 4.0 OSS support ends 2026-12-31 ([endoflife.date](https://endoflife.date/spring-boot)). 4.1 is on Spring Framework 7.0, keeps the JDK 17 baseline, raises the Kotlin baseline to 2.3, and adds Kotlin Serialization 1.11 support ([InfoQ](https://www.infoq.com/news/2026/06/spring-boot-4-1/), [Spring blog: Kotlin in Boot 4](https://spring.io/blog/2025/12/18/next-level-kotlin-support-in-spring-boot-4/)). 4.2 is planned for Nov 2026.
- **Ktor.** 3.6.0 was published 2026-09-16 ([release](https://github.com/ktorio/ktor/releases/tag/3.6.0)). Since 3.4, OpenAPI is generated through a compiler plugin that emits runtime metadata. The bundled static HTML renderers only support OpenAPI 3.0.x ([Ktor OpenAPI docs](https://ktor.io/docs/server-openapi.html), [3.4 blog](https://blog.jetbrains.com/kotlin/2026/01/ktor-3-4-0-is-now-available/)).
- **Problem Details.** Spring supports RFC 9457 through `ProblemDetail`/`ErrorResponse`, and Boot auto-configures a handler with `spring.mvc.problemdetails.enabled` ([Spring docs](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html)). Ktor has nothing built in, so it is hand-rolled with StatusPages.
- **JWT (Ed25519) is a real friction point on the JVM.**
  - Nimbus JOSE+JWT supports EdDSA but "for EdDSA you need to include the optional Tink dependency" ([Connect2id](https://connect2id.com/products/nimbus-jose-jwt/examples/jwt-with-eddsa)).
  - Spring Security's `NimbusJwtEncoder` cannot sign EdDSA. [Issue #17098](https://github.com/spring-projects/spring-security/issues/17098) is open and PR #19175 ("Add EdDSA support to NimbusJwtEncoder") is open. On the verify side you need a custom `JWTProcessor` rather than the `withPublicKey` builder (inferred, not tested).
  - jjwt 0.13.0 supports EdDSA (Ed25519/Ed448) on JDK 15+ ([README](https://github.com/jwtk/jjwt)).
  - Ktor's `auth-jwt` uses auth0 `java-jwt`. Its README algorithm table lists HS/RS/PS/ES only, no EdDSA ([README](https://github.com/auth0/java-jwt)), so Ktor needs a custom auth provider.
- **Argon2id.** Spring Security `Argon2PasswordEncoder` "requires BouncyCastle" ([docs](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html)) and encodes as `$argon2id$v=19$m=..`.
- **OpenAPI.**
  - Code-first: springdoc-openapi v3.1.1 (2026-09, the Boot 4 line).
  - Spec-first: openapi-generator v7.25.0 has `kotlin-spring`, `kotlin-server` (ktor), and `kotlin` client generators ([generators list](https://github.com/OpenAPITools/openapi-generator/blob/master/docs/generators.md)).
  - Spring's declarative `@HttpExchange` clients can be written by hand from the spec.
- **DB.** Spring Data JDBC (no JPA session magic, which suits aggregates), jOOQ 3.21.9 (typed SQL, code generated from the schema; commercial license for some non-OSS databases, but Postgres is fine under OSS), or Exposed 1.5.0 (JetBrains, 1.x stable). Flyway 13.8.1 is auto-configured by Boot.
- **Testing.** Spring Boot test slices, Testcontainers-java 2.0.5 with `@ServiceConnection`. Ktor `testApplication {}`.
- **Domain types.** Sealed interfaces + exhaustive `when` + value classes model Share audiences and Activity-type states directly. ADR-0003 already names this as Kotlin's strength. Polymorphic JSON works with Jackson `@JsonTypeInfo` or kotlinx.serialization sealed-class support (v1.12.0-RC).
- **Footprint.** The JVM has the largest per-process memory and the slowest startup of these options. Spring Boot documents AOT cache, JVM checkpoint/restore, and GraalVM native images as mitigations ([Boot packaging docs](https://docs.spring.io/spring-boot/reference/packaging/index.html)). No specific numbers verified.
- **Ergonomics.** Spring gives the most batteries but is annotation- and DI-heavy, and the learning curve is steep for newcomers. Ktor is explicit and lighter, but you assemble more yourself: RFC 9457, EdDSA auth, and OpenAPI.

### 3. .NET (ASP.NET Core Minimal APIs)

- **Versions and support.** .NET 10 (LTS) was released 2025-11-11, is supported until 2028-11-14, and its latest patch is 10.0.12 (2026-09-08). .NET 8 and 9 both reach EOL 2026-11-10. .NET 11 (STS) is due 2026-11-10 ([endoflife.date](https://endoflife.date/dotnet), [MS support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)).
- **OpenAPI.** .NET 10 generates OpenAPI 3.1 by default, can serve YAML, and supports build-time generation (`OpenApiGenerateDocumentsOnBuild`) ([What's new in ASP.NET Core 10](https://learn.microsoft.com/en-us/aspnet/core/release-notes/aspnetcore-10.0)). That supports a code-first + oasdiff-against-committed-spec workflow. Clients come from Kiota v1.35.0 (Microsoft) or NSwag v14.7.1. Spec-first server generation relies on openapi-generator `aspnetcore`/`aspnet-fastendpoints`, which are less idiomatic for Minimal APIs.
- **Problem Details.** Built in with `AddProblemDetails`/`IProblemDetailsService`. .NET 10 adds built-in Minimal API validation (`AddValidation()`, DataAnnotations), and its error responses can go through `IProblemDetailsService` (same source).
- **Ed25519 JWT is the biggest gap.**
  - The BCL has no Ed25519. The [API proposal #63174](https://github.com/dotnet/runtime/issues/63174) was re-proposed and approved in API review on 2026-05-05 but sits in the "Future" milestone. A 2025 comment in the thread quotes the crypto owners as calling it low priority.
  - `Microsoft.IdentityModel.JsonWebTokens` (8.23.0) has no native EdDSA. You need `ScottBrady.IdentityModel` 4.1.0 (Nov 2024; targets net8/net9; depends on BouncyCastle) ([repo](https://github.com/scottbrady91/IdentityModel), [damienbod walkthrough](https://damienbod.com/2025/08/06/use-eddsa-signatures-to-validate-tokens-in-asp-net-core-using-openid-connect/)), or custom signing and verification over NSec or BouncyCastle.
  - Switching to ES256 would remove this gap, but that means changing ADR-0016.
- **Argon2id.** Not in the BCL. Options:
  - NSec.Cryptography 26.4.0 (libsodium) offers Argon2id `DeriveBytes` only, with no PHC string ([NSec API](https://nsec.rocks/docs/api/nsec.cryptography.passwordbasedkeyderivationalgorithm)).
  - Geralt 4.4.0 (libsodium, 2026-07).
  - BouncyCastle.Cryptography 2.7.0.
  - Konscious 1.3.1 (last release 2024-06) and Isopoh 2.0.0 (2023-08) look stale.
  - ASP.NET Identity's default hasher is PBKDF2, not Argon2 (not re-verified).
- **DB.** EF Core 10.0.12 + Npgsql (migrations built in; heavier ORM) or Dapper 2.1.89 (SQL-first). Either works behind ports.
- **Testing.** `WebApplicationFactory<T>` in-process (Microsoft.AspNetCore.Mvc.Testing) plus Testcontainers for .NET 4.15.0.
- **Footprint.** Native AOT supports Minimal APIs partially and JWT auth fully, lowers app size, memory, and startup, and requires System.Text.Json source generation ([Native AOT docs](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/native-aot)). EF Core under AOT has limits (not re-verified for EF 10).
- **Domain types.** C# 15 `union` types ship with .NET 11 (preview; GA expected Nov 2026; STS). They are compiled to a struct that boxes value-type cases ([.NET blog](https://devblogs.microsoft.com/dotnet/csharp-15-union-types/)). On .NET 10 LTS you get records + abstract base + switch expressions, where exhaustiveness is only a warning, or the `OneOf` library.
- **Ergonomics.** Mature tooling (Rider, VS, VS Code C# Dev Kit). Minimal APIs are close to Fastify in shape. The DI container is built in.

### 4. Brief: Python FastAPI and Rust Axum

- **FastAPI** 0.142.2 (2026-09-30) is still 0.x. It generates OpenAPI from Pydantic v2 models, which support discriminated unions. PyJWT 2.15.1 supports EdDSA through `cryptography`, and argon2-cffi 25.1.0 produces PHC strings. It had 15.1% pro-dev usage in SO 2025. It is not an obvious upgrade over TS for typing rigor, and it does not help with the contract question. Not a strong contender here.
- **Rust Axum** 0.8.9 (2026-04) is still 0.x. It offers enums as true sum types, `jsonwebtoken` 11.x (EdDSA), RustCrypto `argon2` (PHC via `password-hash`), and utoipa for OpenAPI. It has the smallest footprint, but the learning curve and rewrite cost are the highest. The latency budgets are I/O-bound (ADR-0003), so it is not justified here.

### Migration cost from the current TS code (all stacks)

- **Rewrite scope:**
  - OPM (~2.7k lines incl. tests)
  - three skeleton services
  - `platform-service-authenticator` (verify + outbound client-credentials cache)
  - `contracts` (small; becomes OpenAPI components + per-language constants)
  - Community collaborator stub
  - per-service migrations (Drizzle → goose / Flyway / EF or SQL)
  - `pnpm dev` orchestration and Cursor Cloud instructions in AGENTS.md
- **Unchanged:** the Postman collections and OpenAPI specs in `postman/`, which are HTTP-level. ADRs 0003, 0007 (framework choice), and 0018 (Fastify/Drizzle naming) would need superseding ADRs.
- **Relative effort (qualitative):** Go or Kotlin/Ktor come out lowest-to-moderate. Spring Boot is moderate: fastest scaffolding, but the EdDSA workaround costs time. .NET is moderate plus the EdDSA and Argon2 library gaps.

### Surveys (caveats: self-selected samples)

- Stack Overflow 2025, pro-dev usage ([technology](https://survey.stackoverflow.co/2025/technology)):
  - Languages: TypeScript 48.8%, C# 29.9%, Go 17.4%, Rust 14.5%, Kotlin 11.5%.
  - Web frameworks: ASP.NET Core 21.3%, Express 20.3%, Spring Boot 15.6%, FastAPI 15.1%, Fastify 3.1%, Axum 2.7%.
- JetBrains State of Developer Ecosystem 2025 (24,534 respondents): TypeScript, Rust, and Go top its Language Promise Index, and Go and Kotlin grow steadily ([JetBrains blog](https://blog.jetbrains.com/research/2025/10/state-of-developer-ecosystem-2025/)).
- TechEmpower: Round 23 (Feb 2025) is final, and the project was archived 2026-03-24 ([TFB](https://www.techempower.com/benchmarks/)). Its synthetic throughput tests don't bear on I/O-bound p95 budgets of 500 ms / 2 s.

### Could not verify

- A 2026 Stack Overflow survey with the same breakdown. Only secondary blogs mention it, so 2025 figures are used.
- Numeric memory and startup figures for comparable small services in Go, Spring Boot 4.1 (JIT / AOT cache / native), Ktor, and .NET 10 (JIT / Native AOT). The vendor pages give qualitative claims or charts without numbers.
- Whether ogen fully supports OpenAPI 3.1. How well each spec-first generator handles the repo's `oneOf`/`discriminator` usage.
- Whether Spring Security 7.x `NimbusJwtDecoder` verifies EdDSA out of the box, and whether PR #19175 will land in Boot 4.2.
- Whether `ScottBrady.IdentityModel` works with Microsoft.IdentityModel 8.x on .NET 10 (its package targets net8/net9 only).
- Whether .NET 11 will include the approved Ed25519 API. The milestone is "Future".
- Huma's governance/bus factor. Atlas open-source vs paid feature boundaries.
- JDK 25 LTS support dates (not re-fetched).
- EF Core 10 Native AOT limitations.
