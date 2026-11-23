#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# == 1 || $# == 2 ]] || fail 'Usage: clarity-restore-test.sh BACKUP.tar.gpg [BACKEND_IMAGE]'
backend=${2:-}
if [[ -n "$backend" ]]; then
  docker image inspect "$backend" >/dev/null 2>&1 || fail 'Load the chosen backend image before restoring.'
fi
[[ -f "$1" ]] || fail 'Backup file is missing.'
scratch=$(mktemp -d)
project="clarity-restore-$(openssl rand -hex 8)"
volume="$project-images"
db="$project-db"
data="$project-postgres"
app="$project-app"
created_network=
created_volume=
created_db=
created_data=
created_app=
complete=
cleanup() {
  rm -rf -- "$scratch"
  if [[ -z "$complete" ]]; then
    if [[ -n "$created_app" ]] && ! docker rm -fv "$app" >/dev/null; then printf 'Remove test backend %s manually.\n' "$app" >&2; fi
    if [[ -n "$created_db" ]] && ! docker rm -fv "$db" >/dev/null; then printf 'Remove test database %s manually.\n' "$db" >&2; fi
    if [[ -n "$created_data" ]] && ! docker volume rm "$data" >/dev/null; then printf 'Remove test volume %s manually.\n' "$data" >&2; fi
    if [[ -n "$created_volume" ]] && ! docker volume rm "$volume" >/dev/null; then printf 'Remove test volume %s manually.\n' "$volume" >&2; fi
    if [[ -n "$created_network" ]] && ! docker network rm "$project" >/dev/null; then printf 'Remove test network %s manually.\n' "$project" >&2; fi
  fi
}
trap cleanup EXIT
gpg --batch --output "$scratch/bundle.tar" --decrypt -- "$1"

python3 - "$scratch" <<'PY'
from pathlib import Path, PurePosixPath
import hashlib
import sys
import tarfile

root = Path(sys.argv[1])
files = {"metadata.txt", "SHA256SUMS", "db.dump", "images.tar"}
with tarfile.open(root / "bundle.tar", "r:") as archive:
    entries = archive.getmembers()
    if len(entries) != len(files) or {entry.name for entry in entries} != files:
        sys.exit("Unexpected backup contents.")
    for entry in entries:
        if not entry.isfile():
            sys.exit("Expected a regular file in the backup bundle.")
        archive.extract(entry, root, set_attrs=False)
checksums = {}
for line in (root / "SHA256SUMS").read_text().splitlines():
    digest, name = line.split("  ", 1)
    checksums[name] = digest
if set(checksums) != files - {"SHA256SUMS"}:
    sys.exit("Incomplete backup manifest.")
for name, digest in checksums.items():
    with (root / name).open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
            sys.exit("Backup checksum mismatch.")
if "format=1" not in (root / "metadata.txt").read_text().splitlines():
    sys.exit("Unsupported backup format.")
version = next((line.removeprefix("database_version=") for line in (root / "metadata.txt").read_text().splitlines() if line.startswith("database_version=")), "")
if not version.isdecimal() or int(version) // 10000 != 16:
    sys.exit("The backup must be from PostgreSQL 16.")
with tarfile.open(root / "images.tar", "r:") as archive:
    names = set()
    for entry in archive:
        path = PurePosixPath(entry.name)
        if path.is_absolute() or ".." in path.parts or path in names or not (entry.isfile() or entry.isdir()):
            sys.exit("Unexpected entry in the image archive.")
        names.add(path)
PY

if docker container inspect "$db" >/dev/null 2>&1 ||
   docker network inspect "$project" >/dev/null 2>&1 ||
   docker container inspect "$app" >/dev/null 2>&1 ||
   docker volume inspect "$volume" >/dev/null 2>&1 ||
   docker volume inspect "$data" >/dev/null 2>&1; then
  fail 'Restore target already exists.'
fi
docker network create --internal "$project" >/dev/null
created_network=true
docker volume create "$volume" >/dev/null
created_volume=true
docker volume create "$data" >/dev/null
created_data=true
image=postgres:16-alpine
recorded=$(sed -n '/^database_repo_digest=/{s/^database_repo_digest=//;p;q;}' "$scratch/metadata.txt")
if [[ $recorded =~ ^(docker\.io/library/)?postgres@sha256:[a-f0-9]{64}$ ]] &&
   docker image inspect "$recorded" >/dev/null 2>&1; then
  image=$recorded
fi
pass=$(openssl rand -hex 24)
docker run -d --name "$db" --network "$project" \
  --mount "type=volume,src=$data,dst=/var/lib/postgresql/data" \
  -e POSTGRES_USER=clarity -e POSTGRES_DB=clarity -e POSTGRES_PASSWORD="$pass" "$image" >/dev/null
created_db=true
for ((attempt=1; attempt<=45; attempt++)); do
  if docker exec "$db" pg_isready -h 127.0.0.1 -U clarity -d clarity >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$db" pg_isready -h 127.0.0.1 -U clarity -d clarity >/dev/null ||
  fail 'Test database did not become ready.'
docker exec -i "$db" pg_restore -U clarity -d clarity --no-owner --no-acl --exit-on-error --single-transaction \
  < "$scratch/db.dump"
docker run --rm -i --network none --mount "type=volume,src=$volume,dst=/images" "$image" \
  sh -ceu 'test -z "$(ls -A /images)"; tar -C /images -xf -' < "$scratch/images.tar"
if [[ -n "$backend" ]]; then
  docker run --detach --name "$app" --network "$project" --pull never \
    -e "DATABASE_URL=postgresql://clarity:$pass@$db:5432/clarity" \
    -e JWT_SECRET="$(openssl rand -hex 32)" -e RUN_MIGRATIONS=false \
    -e AI_BASE_URL= -e AI_API_KEY= -e OPENROUTER_API_KEY= -e SMTP_URL= \
    -e IMAGE_STORAGE_DIR=/app/data/images \
    --mount "type=volume,src=$volume,dst=/app/data/images,readonly" "$backend" >/dev/null
  created_app=true
  for ((attempt=1; attempt<=60; attempt++)); do
    if docker exec "$app" node -e 'fetch("http://127.0.0.1:3100/health/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if ((attempt > 60)); then fail 'Restored backend did not become ready.'; fi
fi
complete=true
printf 'network=%s\ndatabase=%s\ndatabase_volume=%s\nimages=%s\n' "$project" "$db" "$data" "$volume"
if [[ -n "$backend" ]]; then printf 'backend=%s\n' "$app"; fi
