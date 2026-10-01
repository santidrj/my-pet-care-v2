#!/bin/sh
set -eu

MPC_DIR="${MPC_DIR:-/var/lib/mpc}"
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

psql -d owner_pet_manager -v ON_ERROR_STOP=1 \
  -f /app/services/owner-pet-manager/sql/001_owners_pets.sql
psql -d authentication_service -v ON_ERROR_STOP=1 \
  -f /app/docker/postgres/authentication-service.sql

mkdir -p "$MPC_DIR"
if [ ! -f "$MPC_DIR/authentication-private.pem" ]; then
  openssl genpkey -algorithm ED25519 -out "$MPC_DIR/authentication-private.pem"
fi
if [ ! -f "$MPC_DIR/authentication-public.pem" ]; then
  openssl pkey -in "$MPC_DIR/authentication-private.pem" -pubout \
    -out "$MPC_DIR/authentication-public.pem"
fi

if [ ! -f "$MPC_DIR/secrets.env" ]; then
  umask 077
  service_secret="$(openssl rand -base64 32 | tr -d '\n')"
  setup_secret="$(openssl rand -base64 32 | tr -d '\n')"
  printf "PLATFORM_SERVICE_SECRET='%s'\nPLATFORM_SETUP_SECRET='%s'\n" \
    "$service_secret" "$setup_secret" >"$MPC_DIR/secrets.env"
fi

touch "$MPC_DIR/reset-links.txt"
chmod a+r "$MPC_DIR/authentication-private.pem" \
  "$MPC_DIR/authentication-public.pem" \
  "$MPC_DIR/secrets.env" \
  "$MPC_DIR/reset-links.txt"

echo "bootstrap complete"
