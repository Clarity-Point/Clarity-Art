#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# == 3 ]] || fail 'Usage: clarity-backup.sh COMPOSE_PROJECT OUTPUT.tar.gpg GPG_FINGERPRINT'
project=$1
output=$2
recipient=$3
[[ $project =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 'Invalid Compose project name.'
[[ $recipient =~ ^[a-fA-F0-9]{40,64}$ ]] || fail 'Use the full GPG key fingerprint.'
[[ ! -e "$output" ]] || fail 'The backup destination already exists.'
[[ -d "$(dirname -- "$output")" ]] || fail 'Create the destination directory first.'

scratch=$(mktemp -d)
sealed=$(mktemp -- "$(dirname -- "$output")/.clarity-backup.XXXXXXXX")
cleanup() { rm -rf -- "$scratch"; rm -f -- "$sealed"; }
trap cleanup EXIT

db=$(docker compose -p "$project" ps --status running --quiet db)
[[ -n "$db" && "$db" != *$'\n'* ]] || fail 'Exactly one running source database is required.'
running_backend() {
  docker compose -p "$project" ps --status running --quiet backend
}
writers=$(running_backend)
[[ -z "$writers" ]] || fail 'Stop all backend writers during the maintenance window.'

volume=$(docker volume ls --filter "label=com.docker.compose.project=$project" \
  --filter 'label=com.docker.compose.volume=image_data' --format '{{.Name}}')
[[ -n "$volume" && "$volume" != *$'\n'* ]] || fail 'Exactly one project image_data volume is required.'
db_image=$(docker inspect --format '{{.Image}}' "$db")
docker exec "$db" sh -ceu 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$scratch/db.dump"
docker run --rm --network none --read-only \
  --mount "type=volume,src=$volume,dst=/images,readonly" "$db_image" \
  tar -C /images -cf - . > "$scratch/images.tar"

writers=$(running_backend)
[[ -z "$writers" ]] || fail 'A backend writer restarted during copying. Repeat the backup.'
{
  printf 'format=1\ncreated_at=%s\nsource_project=%s\n' "$(date -u +%FT%TZ)" "$project"
  printf 'database_image=%s\n' "$db_image"
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$db_image" |
    sed '/^$/d; s/^/database_repo_digest=/'
  printf 'database_version='
  docker exec "$db" sh -ceu 'psql -At -U "$POSTGRES_USER" "$POSTGRES_DB" -c "SHOW server_version_num"'

  printf 'schema_migration='
  docker exec "$db" sh -ceu 'psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" "$POSTGRES_DB" -c "$1"' sh \
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1'
  for service in backend frontend; do
    ids=$(docker compose -p "$project" ps --all --quiet "$service")
    for container in $ids; do
      image_id=$(docker inspect --format '{{.Image}}' "$container")
      printf '%s_image=%s\n' "$service" "$image_id"
      docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" |
        sed "/^$/d; s/^/${service}_repo_digest=/"
    done
  done
} > "$scratch/metadata.txt"

(
  cd "$scratch"
  sha256sum metadata.txt db.dump images.tar > SHA256SUMS
  tar -cf - metadata.txt SHA256SUMS db.dump images.tar
) | gpg --batch --yes --trust-model always --recipient "$recipient" --output "$sealed" --encrypt
# A hard link publishes the encrypted bundle atomically and fails if output appeared meanwhile.
ln -T -- "$sealed" "$output"
printf 'Backup saved to %s\n' "$output"
