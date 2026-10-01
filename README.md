# my-pet-care-v2

Backend for My Pet Care. This workspace runs Owner & Pet Manager, Pet Health Service, Activity Manager, Authentication Service, and the Community collaborator stub.

How to work in this repo is in the [Maintainer guide](docs/maintainer-guide.md).

## Requirements

- Node.js 24
- pnpm 12.6.0 (`corepack enable`)
- Docker

## Local stack

```bash
docker compose up --build
```

That starts PostgreSQL 18 and the five processes. Host ports are `127.0.0.1:3001` through `3005`, plus Postgres on `127.0.0.1:5432`. `GET /health` returns `{ "status": "ok" }`. The first Owner and login calls are in the [Maintainer guide](docs/maintainer-guide.md#compose).

`pnpm dev` is the edit loop. Start only Postgres for that with `docker compose up -d postgres`.

## Typecheck

```bash
pnpm typecheck
```
