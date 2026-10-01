# my-pet-care-v2

Backend for My Pet Care. This workspace is the runnable skeleton: four Fastify services, a Community collaborator stub, and shared packages (`contracts`, `platform-service-authenticator`, `service-skeleton`).

How to work in this repo is in the [Maintainer guide](docs/maintainer-guide.md).

## Requirements

- Node.js 24
- pnpm 12.6.0 (`corepack enable`)
- Docker

## Local stack

```bash
docker compose up -d
pnpm install
pnpm dev
```

`docker compose up -d` starts PostgreSQL 18 with one database per service. `pnpm dev` starts five processes on `127.0.0.1`:

- Owner & Pet Manager: `3001`
- Pet Health Service: `3002`
- Activity Manager: `3003`
- Authentication Service: `3004`
- Community collaborator stub: `3005`

`GET /health` returns `{ "status": "ok" }`.

Owner & Pet Manager exits at startup unless these are set (see [Live local run](docs/maintainer-guide.md#live-local-run) for the full stack):

- `JWT_PUBLIC_KEY_PATH` (or `JWT_PUBLIC_KEY`)
- `PLATFORM_SERVICE_SECRET`
- `PLATFORM_SETUP_SECRET`
- `AUTH_BASE_URL` (`http://127.0.0.1:3004`)
- `COMMUNITY_BASE_URL` (`http://127.0.0.1:3005`)

## Typecheck

```bash
pnpm typecheck
```
