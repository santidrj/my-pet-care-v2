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
- `pnpm dev` starts all five processes. Authentication Service exits unless `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY` or `JWT_PUBLIC_KEY_PATH`, `PLATFORM_SERVICE_SECRET`, `PLATFORM_SETUP_SECRET`, `RESET_LINK_TEMPLATE` (one `{token}`), and `OWNER_PET_MANAGER_BASE_URL` (`http://127.0.0.1:3001`) are set. `MAIL_SINK=file:<path>` appends reset links; unset makes delivery fail. Owner & Pet Manager, Pet Health Service, Activity Manager, and the Community stub also exit unless `PLATFORM_SERVICE_SECRET`, `PLATFORM_SETUP_SECRET`, and `AUTH_BASE_URL` (`http://127.0.0.1:3004`) are set. Owner & Pet Manager still needs `JWT_PUBLIC_KEY_PATH` and `COMMUNITY_BASE_URL` (`http://127.0.0.1:3005`). Generate the Ed25519 pair under `$HOME/.my-pet-care` as described in `docs/maintainer-guide.md`. The dev server logs are in tmux session `pet-care-dev`.
- Readiness is `GET /health` → `{"status":"ok"}` on ports 3001–3005. Startup checks Postgres and does not apply migrations. `POST /owners` returns 500 until the `owners` table exists. Apply Owner & Pet Manager migrations with `DATABASE_URL=postgresql://my_pet_care:my_pet_care@localhost:5432/owner_pet_manager pnpm --filter @my-pet-care/owner-pet-manager db:migrate`. Generate new ones after schema edits with `pnpm --filter @my-pet-care/owner-pet-manager db:generate`. Run Postgres persistence tests with `pnpm test:opm:persistence` (targets `owner_pet_manager_test`, never the dev database; applies the same migrations). `DATABASE_URL=postgresql://my_pet_care:my_pet_care@localhost:5432/authentication_service pnpm test:auth` creates the Authentication Service tables and runs its tests.
- `pnpm typecheck` and `pnpm --filter @my-pet-care/platform-service-authenticator test` do not need Postgres.
