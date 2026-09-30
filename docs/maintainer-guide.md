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

## Commands

From the repository root:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds `@my-pet-care/contracts` and `@my-pet-care/platform-service-authenticator`, then starts every package under `services/*`. Each service `dev` script sets `DATABASE_URL` and `PORT`. The stub script sets `PORT` only. |
| `pnpm build` | Builds the two packages, then every service. |
| `pnpm typecheck` | Typechecks the two packages, builds them, then typechecks every service. |
| `pnpm test:opm` | Runs `@my-pet-care/owner-pet-manager` tests (`tsx --test test/**/*.test.ts`). |

Packages with a `test` script:

- `@my-pet-care/owner-pet-manager` (`pnpm test:opm`)
- `@my-pet-care/platform-service-authenticator` (`pnpm --filter @my-pet-care/platform-service-authenticator test`)

Pet Health Service, Activity Manager, Authentication Service, and the community-collaborator stub have no `test` script. Owner & Pet Manager’s Postgres persistence tests skip when `DATABASE_URL` is unset. `pnpm test:opm` does not set it.

## Databases

Compose runs one Postgres server. The image creates `owner_pet_manager`. [docker/postgres/init/01-create-databases.sql](../docker/postgres/init/01-create-databases.sql) creates `pet_health_service`, `activity_manager`, and `authentication_service`.

Owner & Pet Manager, Pet Health Service, Activity Manager, and Authentication Service each have `src/schema.ts` and `drizzle.config.ts`. [ADR-0006](adr/0006-drizzle-orm.md) says schema changes ship as drizzle-kit migrations owned by that service. This repository has no migration directory and no migrate script. Startup checks that Postgres accepts a connection. It does not apply `src/schema.ts`.

## Before you change a service

Read that service’s requirements and architecture diagram, then the ADRs in [docs/adr/](adr/) that touch the change. When the change crosses service boundaries, also read [backend.mmd](architecture/backend.mmd) and [system-class-diagram.mmd](architecture/system-class-diagram.mmd).

| Area | Requirements | Architecture |
| --- | --- | --- |
| Owner & Pet Manager | [owner-pet-manager.md](requirements/owner-pet-manager.md), [owner-pet-manager-api.md](requirements/owner-pet-manager-api.md) | [owner-pet-manager.mmd](architecture/owner-pet-manager.mmd) |
| Pet Health Service | [pet-health-service.md](requirements/pet-health-service.md), [pet-health-service-api.md](requirements/pet-health-service-api.md) | [pet-health-service.mmd](architecture/pet-health-service.mmd) |
| Activity Manager | [activity-manager.md](requirements/activity-manager.md), [activity-manager-api.md](requirements/activity-manager-api.md) | [activity-manager.mmd](architecture/activity-manager.mmd) |
| Authentication Service | [authentication-service.md](requirements/authentication-service.md), [authentication-service-api.md](requirements/authentication-service-api.md) | [authentication-service.mmd](architecture/authentication-service.mmd) |
| Platform-service authenticator | [platform-service-authenticator.md](requirements/platform-service-authenticator.md), [platform-service-authenticator-api.md](requirements/platform-service-authenticator-api.md) | [platform-service-authenticator.mmd](architecture/platform-service-authenticator.mmd) |

## API collections

Postman files in this repository are the contract checks.

| Directory | Contents |
| --- | --- |
| [postman/collections/](../postman/collections/) | Owner & Pet Manager, Pet Health Service, Activity Manager, and Authentication Service collections. |
| [postman/environments/](../postman/environments/) | Owner & Pet Manager Local, Pet Health Service Local, Activity Manager Local, and Authentication Service Local. |
| [postman/specs/](../postman/specs/) | OpenAPI specs for those four services. |

How to open a project and choose an environment is in [Live local run](#live-local-run).

## Live local run

Do this in one shell. No service loads a `.env` file. Keep the key pair outside the repository. `.gitignore` ignores `.env` files and does not ignore PEM files.

Create an Ed25519 key pair. Point `JWT_PUBLIC_KEY_PATH` at the public PEM. No process in this repository reads the private key.

```bash
mkdir -p "$HOME/.my-pet-care"
openssl genpkey -algorithm ED25519 -out "$HOME/.my-pet-care/authentication-private.pem"
openssl pkey -in "$HOME/.my-pet-care/authentication-private.pem" -pubout -out "$HOME/.my-pet-care/authentication-public.pem"
```

`JWT_PUBLIC_KEY` may hold the public PEM text instead of a path. These instructions use the path.

Export the variables Owner & Pet Manager exits without. `pnpm dev` already sets `DATABASE_URL` and `PORT`. When `AUTH_BASE_URL` is set, Owner & Pet Manager sets `AUTH_TOKEN_URL` to `{AUTH_BASE_URL}/oauth/token`.

```bash
export JWT_PUBLIC_KEY_PATH="$HOME/.my-pet-care/authentication-public.pem"
export PLATFORM_SERVICE_SECRET="$(openssl rand -base64 32)"
export AUTH_BASE_URL=http://127.0.0.1:3004
export COMMUNITY_BASE_URL=http://127.0.0.1:3005
```

Authentication Service does not sign JWTs and does not store platform-client secret hashes yet. These values let Owner & Pet Manager start. A client-credentials grant does not succeed.

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
- Pet Health Service Local — [Contract artifacts](requirements/pet-health-service-api.md#contract-artifacts)
- Activity Manager Local — [Contract artifacts](requirements/activity-manager-api.md#contract-artifacts)

A request that reads or writes a table fails until migrations exist. See [Databases](#databases).
