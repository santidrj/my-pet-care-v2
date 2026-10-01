#!/bin/sh
set -eu

MPC_DIR="${MPC_DIR:-/var/lib/mpc}"
export MPC_DIR
export PGHOST="${PGHOST:-postgres}"
export PGUSER="${PGUSER:-my_pet_care}"
export PGPASSWORD="${PGPASSWORD:-my_pet_care}"
export PGPORT="${PGPORT:-5432}"

echo "waiting for postgres"
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d owner_pet_manager >/dev/null 2>&1; do
  sleep 1
done

ensure_database() {
  name="$1"
  exists="$(
    psql -d owner_pet_manager -tAc "SELECT 1 FROM pg_database WHERE datname = '${name}'" |
      tr -d '[:space:]'
  )"
  if [ "$exists" != "1" ]; then
    psql -d owner_pet_manager -c "CREATE DATABASE ${name}"
  fi
}

ensure_database pet_health_service
ensure_database activity_manager
ensure_database authentication_service
ensure_database owner_pet_manager_test

mkdir -p "$MPC_DIR"
if [ ! -f "$MPC_DIR/authentication-private.pem" ]; then
  openssl genpkey -algorithm ED25519 -out "$MPC_DIR/authentication-private.pem"
fi
if [ ! -f "$MPC_DIR/authentication-public.pem" ]; then
  openssl pkey -in "$MPC_DIR/authentication-private.pem" -pubout \
    -out "$MPC_DIR/authentication-public.pem"
fi

if [ ! -f "$MPC_DIR/instance.json" ]; then
  umask 077
  SERVICE_SECRET="$(openssl rand -base64 32 | tr -d '\n')" \
    SETUP_SECRET="$(openssl rand -base64 32 | tr -d '\n')" \
    node /app/docker/write-instance.mjs
fi

cp /app/config/shared.json "$MPC_DIR/shared.json"
touch "$MPC_DIR/reset-links.txt"
chmod a+r "$MPC_DIR/authentication-private.pem" \
  "$MPC_DIR/authentication-public.pem" \
  "$MPC_DIR/instance.json" \
  "$MPC_DIR/shared.json" \
  "$MPC_DIR/reset-links.txt"

export MPC_CONFIG_DIR="$MPC_DIR"

# A database created before drizzle's journal existed already has owners.
# Record the first migration so migrate does not try to create those tables again.
owners="$(psql -d owner_pet_manager -tAc "select to_regclass('public.owners')" | tr -d '[:space:]')"
if [ "$owners" = "owners" ]; then
  meta="$(node -e '
    const { createHash } = require("node:crypto");
    const { readFileSync } = require("node:fs");
    const folder = "/app/services/owner-pet-manager/drizzle";
    const journal = JSON.parse(readFileSync(folder + "/meta/_journal.json", "utf8"));
    const first = journal.entries[0];
    const query = readFileSync(folder + "/" + first.tag + ".sql");
    const hash = createHash("sha256").update(query).digest("hex");
    process.stdout.write(hash + "\n" + String(first.when));
  ')"
  hash="$(printf '%s\n' "$meta" | head -n 1)"
  when="$(printf '%s\n' "$meta" | tail -n 1)"
  psql -d owner_pet_manager -v ON_ERROR_STOP=1 <<SQL
create schema if not exists drizzle;
create table if not exists drizzle.__drizzle_migrations (
  id serial primary key,
  hash text not null,
  created_at bigint
);
insert into drizzle.__drizzle_migrations (hash, created_at)
select '${hash}', ${when}
where not exists (
  select 1 from drizzle.__drizzle_migrations where hash = '${hash}'
);
SQL
fi

node /app/services/owner-pet-manager/dist/migrate.js
psql -d authentication_service -v ON_ERROR_STOP=1 \
  -f /app/docker/postgres/authentication-service.sql

echo "bootstrap complete"
