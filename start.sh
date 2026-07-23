#!/usr/bin/env bash
#
# One-command local setup for «Точка Ясности».
# Starts PostgreSQL, prepares the backend database, and launches both
# dev servers (backend and frontend).

set -euo pipefail

echo "Starting «Точка Ясности» development environment..."

# Require Docker for the PostgreSQL container.
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Please start Docker first." >&2
  exit 1
fi

# 1. Database
echo "Starting the PostgreSQL container..."
docker compose up -d db

# 2. Dependencies (npm workspaces install all three packages at once).
echo "Installing dependencies..."
npm install

# 3. Backend database: apply migrations, generate the client, seed demo data.
echo "Preparing the database..."
npm run prisma:generate --workspace backend
(cd backend && npx prisma migrate deploy)
npm run prisma:seed --workspace backend

# 4. Launch all dev servers.
echo "Launching backend and frontend..."
npm start
