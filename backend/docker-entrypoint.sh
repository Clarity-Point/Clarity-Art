#!/bin/sh
# Applies pending database migrations before the server starts, so a fresh
# database is usable without a manual step.
#
# Set RUN_MIGRATIONS=false when several replicas boot at once and migrations are
# applied by a separate one-shot job instead.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] applying database migrations..."
  npx prisma migrate deploy
else
  echo "[entrypoint] RUN_MIGRATIONS=false — skipping migrations"
fi

exec "$@"
