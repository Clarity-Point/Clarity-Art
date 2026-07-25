#!/usr/bin/env bash
#
# One-command local setup for «Точка Ясности».
# Starts PostgreSQL, prepares the database, and launches both dev servers.
#
# This runs the app on the host with only PostgreSQL in Docker. To run
# everything in containers instead:  docker compose -f docker-compose.dev.yml up

set -euo pipefail

cd "$(dirname "$0")"

echo "Starting «Точка Ясности» development environment..."

# Require Docker for the PostgreSQL container.
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Please start Docker first." >&2
  exit 1
fi

# The backend refuses to boot without a real JWT_SECRET, so fail here with a
# useful message rather than midway through startup.
if [ ! -f backend/.env ]; then
  echo "Creating backend/.env from the template..."
  cp backend/.env.example backend/.env
fi
if ! grep -qE '^JWT_SECRET=.+' backend/.env; then
  echo "Generating a JWT_SECRET in backend/.env..."
  secret="$(openssl rand -hex 32)"
  # BSD and GNU sed disagree about -i, so rewrite through a temp file.
  sed "s|^JWT_SECRET=.*|JWT_SECRET=${secret}|" backend/.env > backend/.env.tmp
  mv backend/.env.tmp backend/.env
fi
[ -f frontend/.env ] || cp frontend/.env.example frontend/.env

# 1. Database — the dev stack publishes it on the host (default port 5433) and
#    does not demand the production secrets.
echo "Starting the PostgreSQL container..."
docker compose -f docker-compose.dev.yml up -d db

echo "Waiting for PostgreSQL to accept connections..."
for _ in $(seq 1 30); do
  if docker compose -f docker-compose.dev.yml exec -T db pg_isready -q 2> /dev/null; then break; fi
  sleep 1
done

# 2. Dependencies (npm workspaces install both packages at once).
echo "Installing dependencies..."
npm install

# 3. Backend database: generate the client, apply migrations, seed demo data.
echo "Preparing the database..."
npm run prisma:generate --workspace backend
(cd backend && npx prisma migrate deploy)
npm run prisma:seed --workspace backend

# 4. Launch both dev servers.
echo "Launching backend and frontend..."
npm start
