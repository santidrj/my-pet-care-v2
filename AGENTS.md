## Agent skills

### Issue tracker

Issues live in GitHub Issues for `santidrj/my-pet-care-v2`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles mapped to GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` at repo root, ADRs in `docs/adr/`, requirements in `docs/requirements/`, architecture diagrams in `docs/architecture/`. See `docs/agents/domain.md`.

<API_TASKS>
Before responding to any non-trivial API engineering task — designing, implementing, mocking, testing, monitoring, documenting, or deploying an API or Postman Flow — read `postman/skills/ai-readiness/SKILL.md` and follow it. It is the default entry point for API work in this repository. Pure questions and trivial one-line edits do not need it.
</API_TASKS>

## Cursor Cloud specific instructions

- Node.js 24 is installed at `/opt/node-v24` and linked from `/usr/local/cargo/bin`, which is ahead of the image Node 22 on `PATH`. Use that Node for `pnpm` 12.6.0 (`corepack prepare pnpm@12.6.0 --activate`).
- Postgres is `docker compose up -d` (PostgreSQL 18, user/password/db `my_pet_care`, host port `5432`). This VM has no systemd. If `docker info` fails, start `dockerd` with the `fuse-overlayfs` storage driver (`/etc/docker/daemon.json`) and `iptables-legacy`.
- `pnpm dev` starts all five processes. Owner & Pet Manager exits unless `JWT_PUBLIC_KEY_PATH`, `PLATFORM_SERVICE_SECRET`, `AUTH_BASE_URL` (`http://127.0.0.1:3004`), and `COMMUNITY_BASE_URL` (`http://127.0.0.1:3005`) are set. Generate the Ed25519 pair under `$HOME/.my-pet-care` as described in `docs/maintainer-guide.md`. The dev server logs are in tmux session `pet-care-dev`.
- Readiness is `GET /health` → `{"status":"ok"}` on ports 3001–3005. Startup checks Postgres and does not apply `src/schema.ts`. `POST /owners` returns 500 until the `owners` table exists. `DATABASE_URL=postgresql://my_pet_care:my_pet_care@localhost:5432/owner_pet_manager pnpm test:opm` creates those tables and runs the persistence test.
- `pnpm typecheck` and `pnpm --filter @my-pet-care/platform-service-authenticator test` do not need Postgres.
