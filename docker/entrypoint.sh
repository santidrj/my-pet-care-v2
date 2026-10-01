#!/bin/sh
set -eu

if [ "${1:-}" = "bootstrap" ]; then
  shift
  exec /app/docker/bootstrap.sh "$@"
fi

exec "$@"
