#!/bin/sh
set -eu

if [ "${1:-}" = "bootstrap" ]; then
  shift
  exec /app/docker/bootstrap.sh "$@"
fi

secrets="${MPC_SECRETS_FILE:-/var/lib/mpc/secrets.env}"
if [ -f "$secrets" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$secrets"
  set +a
fi

exec "$@"
