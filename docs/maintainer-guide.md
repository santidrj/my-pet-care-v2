# Maintainer guide

How to work in this repository. Domain language, service behavior, and the reasons for past decisions live elsewhere:

- [CONTEXT.md](../CONTEXT.md) is the glossary.
- [docs/requirements/](requirements/) says what each service must do.
- [docs/adr/](adr/) records why a decision was made.
- [docs/architecture/](architecture/) is the structure diagrams.

## Workspace map

pnpm workspace packages are `packages/*` and `services/*` ([pnpm-workspace.yaml](../pnpm-workspace.yaml)). Service boundaries are [ADR-0001](adr/0001-backend-service-boundaries.md).

| Path | Package | Role |
| --- | --- | --- |
| `packages/contracts` | `@my-pet-care/contracts` | Shared contracts used by the services. |
| `packages/platform-service-authenticator` | `@my-pet-care/platform-service-authenticator` | Shared module that verifies inbound Bearer JWTs and presents platform-service credentials on outbound calls. |
| `packages/service-skeleton` | `@my-pet-care/service-skeleton` | Shared Fastify shell: validation Problem Details, request logs, correlation, and outbound client logs. |
| `packages/service-config` | `@my-pet-care/service-config` | Loads `shared.json` and `instance.json` from `MPC_CONFIG_DIR`, merges them, applies `MPC_*` overrides, and validates with Zod. See [ADR-0024](adr/0024-startup-settings-in-two-json-files.md). |
| `services/owner-pet-manager` | `@my-pet-care/owner-pet-manager` | Owner & Pet Manager. |
| `services/pet-health-service` | `@my-pet-care/pet-health-service` | Pet Health Service. |
| `services/activity-manager` | `@my-pet-care/activity-manager` | Activity Manager. |
| `services/authentication-service` | `@my-pet-care/authentication-service` | Authentication Service. |
| `services/community-collaborator-stub` | `@my-pet-care/community-collaborator-stub` | Local stand-in for the future Community collaborator. |

## Local stack

- Node.js 24
- pnpm 12.6.0 (`corepack enable`)
- Docker

`docker compose up -d` starts PostgreSQL 18. `pnpm dev` listens on `127.0.0.1`:

| Process | Port |
| --- | --- |
| Owner & Pet Manager | 3001 |
| Pet Health Service | 3002 |
| Activity Manager | 3003 |
| Authentication Service | 3004 |
| Community collaborator stub | 3005 |

`GET /health` returns `{ "status": "ok" }`.

## Startup settings

Each backend process reads two JSON files once at startup from the directory in `MPC_CONFIG_DIR`. [ADR-0024](adr/0024-startup-settings-in-two-json-files.md) is the decision record. Format and library comparison: [startup-config-format.md](research/startup-config-format.md).

| File | In git | Role |
| --- | --- | --- |
| `config/shared.json` | yes | Defaults shared by every deployment (ports `3001`–`3005`, local base URLs, `logLevel`, and similar). |
| `config/instance.json` | no | Partial overlay for this deployment: database URLs, platform secrets, JWT key paths, reset-link template, optional `mailSink`. |
| `config/instance.example.json` | yes | Template to copy when creating `instance.json`. |

Copy the example, then fill in the instance overlay. Both `shared.json` and `instance.json` must exist before a process starts. The instance file only needs leaves that differ from shared or that have no shared default (secrets and database URLs). Omitted optional leaves keep the shared value or the code default described in the ADR.

After the merge, a non-empty environment variable `MPC_<SECTION>_<LEAF>` replaces one leaf (for example `MPC_OWNER_PET_MANAGER_PORT` for `ownerPetManager.port`). Empty values are ignored. Tests do not load these files; they keep using their own variables (for example `OPM_TEST_DATABASE_URL`).

Root `pnpm dev` sets `MPC_CONFIG_DIR` to the repository `config/` directory. Migrate scripts and drizzle-kit use the same directory and need only that service’s `databaseUrl` in the merged document.

## Commands

From the repository root:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds workspace packages (including `@my-pet-care/service-config` when present), then starts every package under `services/*` with `MPC_CONFIG_DIR` pointing at `config/`. |
| `pnpm build` | Builds those three packages, then every service. |
| `pnpm typecheck` | Typechecks those three packages, builds them, then typechecks every service. |
| `pnpm test:opm` | Runs `@my-pet-care/owner-pet-manager` tests (`tsx --test test/**/*.test.ts`). Persistence tests skip unless `OPM_TEST_DATABASE_URL` is set. |
| `pnpm test:opm:persistence` | Runs the Owner & Pet Manager Postgres persistence test against `owner_pet_manager_test` (never the dev database). |
| `pnpm db:migrate:opm` | Applies Owner & Pet Manager drizzle-kit migrations. Requires `MPC_CONFIG_DIR` and a merged `ownerPetManager.databaseUrl`. |

Packages with a `test` script:

- `@my-pet-care/owner-pet-manager` (`pnpm test:opm`, `pnpm test:opm:persistence`)
- `@my-pet-care/platform-service-authenticator` (`pnpm --filter @my-pet-care/platform-service-authenticator test`)
- `@my-pet-care/service-skeleton` (`pnpm --filter @my-pet-care/service-skeleton test`)
- `@my-pet-care/pet-health-service`, `@my-pet-care/activity-manager`, and `@my-pet-care/authentication-service` (`pnpm --filter <package> test`)

The community-collaborator stub has no `test` script. Service and skeleton tests import the built workspace packages, so build `@my-pet-care/contracts`, `@my-pet-care/platform-service-authenticator`, and `@my-pet-care/service-skeleton` first. Owner & Pet Manager’s Postgres persistence tests skip when `OPM_TEST_DATABASE_URL` is unset. `pnpm test:opm` does not set it. Use `pnpm test:opm:persistence` to run them against the dedicated test database.

## Databases

Compose runs one Postgres server. The image creates `owner_pet_manager`. [docker/postgres/init/01-create-databases.sql](../docker/postgres/init/01-create-databases.sql) creates `pet_health_service`, `activity_manager`, `authentication_service`, and `owner_pet_manager_test`.

Owner & Pet Manager, Pet Health Service, Activity Manager, and Authentication Service each have `src/schema.ts` and `drizzle.config.ts`. [ADR-0006](adr/0006-drizzle-orm.md) says schema changes ship as drizzle-kit migrations owned by that service. Owner & Pet Manager is the first service with a committed migration directory (`services/owner-pet-manager/drizzle/`) and a migrate script. Startup checks that Postgres accepts a connection. It does not apply migrations.

### Owner & Pet Manager migrations

Schema changes start in `services/owner-pet-manager/src/schema.ts`. Generate SQL with drizzle-kit, commit the files under `drizzle/`, then apply with the same helper the persistence tests use:

```bash
# From the repository root — after editing src/schema.ts
pnpm --filter @my-pet-care/owner-pet-manager db:generate

# Apply pending migrations to the dev database
MPC_CONFIG_DIR="$(pwd)/config" pnpm --filter @my-pet-care/owner-pet-manager db:migrate
```

`db:generate` writes into `services/owner-pet-manager/drizzle/` (SQL plus `meta/`). The committed migration SQL (for example `drizzle/0000_owners_pets.sql`) is the DDL applied to dev and test databases. `db:migrate` runs `applyMigrations` from `src/migrate.ts` using `ownerPetManager.databaseUrl` from the merged config. Do not maintain a second, hand-applied DDL path beside `drizzle/`.

### Persistence tests

The Owner & Pet Manager persistence test drops `owners`, `pets`, and the drizzle migration journal on the test database, then reapplies the same drizzle-kit migrations via `applyMigrations`. It must never target the `owner_pet_manager` (or other service) databases.

```bash
docker compose up -d
pnpm test:opm:persistence
```

That sets `OPM_TEST_DATABASE_URL` to `postgresql://my_pet_care:my_pet_care@localhost:5432/owner_pet_manager_test`. The test creates `owner_pet_manager_test` if the volume was initialized before that database existed. It refuses to run against protected database names (`owner_pet_manager`, and the other service databases).

## Before you change a service

Read that service’s requirements and architecture diagram, then the ADRs in [docs/adr/](adr/) that touch the change. When the change crosses service boundaries, also read [backend.mmd](architecture/backend.mmd) and [system-class-diagram.mmd](architecture/system-class-diagram.mmd).

| Area | Requirements | Architecture |
| --- | --- | --- |
| Owner & Pet Manager | [owner-pet-manager.md](requirements/owner-pet-manager.md), [owner-pet-manager-api.md](requirements/owner-pet-manager-api.md) | [owner-pet-manager.mmd](architecture/owner-pet-manager.mmd) |
| Pet Health Service | [pet-health-service.md](requirements/pet-health-service.md) | [pet-health-service.mmd](architecture/pet-health-service.mmd) |
| Activity Manager | [activity-manager.md](requirements/activity-manager.md), [activity-manager-api.md](requirements/activity-manager-api.md) | [activity-manager.mmd](architecture/activity-manager.mmd) |
| Authentication Service | [authentication-service.md](requirements/authentication-service.md), [authentication-service-api.md](requirements/authentication-service-api.md) | [authentication-service.mmd](architecture/authentication-service.mmd) |
| Platform-service authenticator | [platform-service-authenticator.md](requirements/platform-service-authenticator.md), [platform-service-authenticator-api.md](requirements/platform-service-authenticator-api.md) | [platform-service-authenticator.mmd](architecture/platform-service-authenticator.mmd) |

## API collections

Committed OpenAPI specs in [postman/specs/](../postman/specs/) are the REST contract source of truth ([ADR-0021](adr/0021-openapi-specs-are-contract-source-of-truth.md)); CI diffs each service’s generated OpenAPI against its spec. Postman collections and environments exercise a running local stack against those contracts.

| Directory | Contents |
| --- | --- |
| [postman/collections/](../postman/collections/) | Owner & Pet Manager, Activity Manager, and Authentication Service collections. |
| [postman/environments/](../postman/environments/) | Owner & Pet Manager Local, Activity Manager Local, and Authentication Service Local. |
| [postman/specs/](../postman/specs/) | OpenAPI specs for those three services. |

Pet Health Service has no collection, environment, or spec here. How to open a project and choose an environment is in [Live local run](#live-local-run).

## Live local run

Do this in one shell. Services load [startup settings](#startup-settings) from `config/`, not from a `.env` file. Keep the key pair outside the repository. `.gitignore` ignores `.env` files and does not ignore PEM files.

Create an Ed25519 key pair. Authentication Service reads the private PEM path from `authenticationService.jwtPrivateKeyPath`. Every other service uses `platform.jwtPublicKeyPath` for the public PEM.

```bash
mkdir -p "$HOME/.my-pet-care"
openssl genpkey -algorithm ED25519 -out "$HOME/.my-pet-care/authentication-private.pem"
openssl pkey -in "$HOME/.my-pet-care/authentication-private.pem" -pubout -out "$HOME/.my-pet-care/authentication-public.pem"
```

Create `config/instance.json` from `config/instance.example.json`. Set at least:

- `platform.serviceSecret` and `platform.setupSecret` (generate once per deployment; the same values for every service in that deployment)
- `platform.jwtPublicKeyPath`
- `authenticationService.jwtPrivateKeyPath`, `resetLinkTemplate` (exactly one `{token}`), and `databaseUrl`
- `databaseUrl` on Owner & Pet Manager, Pet Health Service, and Activity Manager (Compose defaults: `postgresql://my_pet_care:my_pet_care@localhost:5432/<database_name>` with database names from [Databases](#databases))
- Optional `authenticationService.mailSink` as `file:<path>` so reset links append to a file; omit it to fail reset delivery

Shared ports and local base URLs live in committed `config/shared.json`. Owner & Pet Manager derives the OAuth token URL from `authBaseUrl` plus `/oauth/token`.

Authentication Service signs Owner and platform access tokens, ensures its own platform client before it listens, and writes each reset link when `mailSink` is set. Owner & Pet Manager, Pet Health Service, Activity Manager, and the Community stub call ensure with the same setup secret before they listen. The Community stub registers service id `community`. A client-credentials grant succeeds after that row exists.

Start Postgres, install dependencies, and start the processes. Ports are listed in [Local stack](#local-stack).

```bash
docker compose up -d
pnpm install
pnpm dev
```

Confirm `GET /health` on `http://127.0.0.1:3001` through `http://127.0.0.1:3005`. Each response is `{ "status": "ok" }`.

Exercise the local Postman environments. Import or open the local project, choose the environment, and set the token variables that section names. There is no `postman collection run` script in this repository.

- Owner & Pet Manager Local — [Contract artifacts](requirements/owner-pet-manager-api.md#contract-artifacts)
- Authentication Service Local — [Contract artifacts](requirements/authentication-service-api.md#contract-artifacts)
- Activity Manager Local — [Contract artifacts](requirements/activity-manager-api.md#contract-artifacts)

A request that reads or writes a table fails until migrations are applied. See [Databases](#databases) and [Owner & Pet Manager migrations](#owner--pet-manager-migrations).
