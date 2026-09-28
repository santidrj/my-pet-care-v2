# my-pet-care-v2

Backend for My Pet Care. This workspace is the runnable skeleton: four Fastify services and a shared contracts package.

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

`docker compose up -d` starts PostgreSQL 18 with one database per service. `pnpm dev` starts the four processes on `127.0.0.1`:

- Owner & Pet Manager: `3001`
- Pet Health Service: `3002`
- Activity Manager: `3003`
- Authentication Service: `3004`

`GET /health` returns `{ "status": "ok" }`.

## Typecheck

```bash
pnpm typecheck
```
