# Community collaborator stub

Local/CI stand-in for the future Community collaborator that Owner & Pet Manager calls on Owner Deactivation (ADR-0018).

## Port

`3005` (OPM `3001`, Pet Health `3002`, Activity Manager `3003`, Authentication Service `3004`).

## Endpoints (JWT not required)

| Method | Path | Behavior |
| ------ | ---- | -------- |
| `GET` | `/health` | `{ "status": "ok" }` |
| `GET` | `/owners/{ownerId}/community-ownership` | `{ "isCommunityOwner": boolean }` — default `false`; `true` when `ownerId` is listed in `COMMUNITY_OWNER_IDS` |
| `POST` | `/owners/{ownerId}/belonging-endings` | `204` no-op success |

Outbound OPM calls may send a Bearer platform JWT; this stub ignores `Authorization`.

## Env

- `PORT` (default `3005`)
- `COMMUNITY_OWNER_IDS` — comma-separated Owner UUIDs treated as Community owners
- `LOG_LEVEL` (default `info`)

## Run

```bash
pnpm --filter @my-pet-care/community-collaborator-stub dev
```
