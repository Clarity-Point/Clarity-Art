#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# == 1 ]] || { printf 'Usage: backup-smoke.sh BACKEND_IMAGE\n' >&2; exit 1; }
root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
scratch=$(mktemp -d)
source_project="clarity-backup-source-$(openssl rand -hex 5)"
restored=
restore_app=
fixture_collision_volume=
export GNUPGHOME="$scratch/gnupg"
mkdir -m 700 "$GNUPGHOME"
cleanup() {
  if [[ -n "$fixture_collision_volume" ]]; then docker volume rm "$fixture_collision_volume" >/dev/null; fi
  if [[ -n "$restore_app" ]]; then docker rm -f "$restore_app" >/dev/null; fi
  if [[ -n "$restored" ]]; then
    docker rm -fv "$restored-db" >/dev/null
    docker volume rm "$restored-images" "$restored-postgres" >/dev/null
    docker network rm "$restored" >/dev/null
  fi
  docker compose -f "$scratch/compose.yml" -p "$source_project" down -v --remove-orphans >/dev/null
  gpgconf --kill gpg-agent
  rm -rf -- "$scratch"
}
trap cleanup EXIT
jq -n --arg image "$1" --arg secret "$(openssl rand -hex 32)" --arg db "$(openssl rand -hex 24)" '
  {services: {
    db: {image: "postgres:16-alpine", environment: {POSTGRES_USER: "clarity", POSTGRES_DB: "clarity", POSTGRES_PASSWORD: $db},
      healthcheck: {test: ["CMD", "pg_isready", "-h", "127.0.0.1", "-U", "clarity"], interval: "1s", retries: 30}},
    backend: {image: $image, environment: {DATABASE_URL: ("postgresql://clarity:" + $db + "@db:5432/clarity"),
      JWT_SECRET: $secret, COOKIE_SECURE: "false", IMAGE_STORAGE_DIR: "/app/data/images"},
      depends_on: {db: {condition: "service_healthy"}}, volumes: ["image_data:/app/data/images"]},
    frontend: {image: "postgres:16-alpine", command: ["sleep", "infinity"]}
  }, volumes: {image_data: {}}, networks: {default: {internal: true}}}
' > "$scratch/compose.yml"
export COMPOSE_FILE="$scratch/compose.yml"
compose() { docker compose -p "$source_project" "$@"; }
wait_ready() {
  local id=$1
  for ((attempt=1; attempt<=60; attempt++)); do
    if docker exec "$id" node -e 'fetch("http://127.0.0.1:3100/health/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  docker logs "$id" >&2
  return 1
}
compose up -d db backend
id=$(compose ps --quiet backend)
wait_ready "$id"
docker exec -i "$id" node - seed < "$root/tests/tooling/backup-smoke.cjs"
gpg --quiet --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'Restore fixture <restore@example.test>' rsa2048 encr 1d
fingerprint=$(gpg --batch --with-colons --fingerprint restore@example.test | awk -F: '$1=="fpr" && !seen++ {print $10}')
backup="$scratch/verified.tar.gpg"
if "$root/scripts/clarity-backup.sh" "$source_project" "$backup" "$fingerprint"; then
  printf 'Backup accepted active backend writes\n' >&2; exit 1
fi
compose stop backend
"$root/scripts/clarity-backup.sh" "$source_project" "$backup" "$fingerprint"

mkdir "$scratch/corrupt"
gpg --quiet --batch --decrypt "$backup" | tar -C "$scratch/corrupt" -xf -
printf 'bad' >> "$scratch/corrupt/images.tar"
tar -C "$scratch/corrupt" -cf - metadata.txt SHA256SUMS db.dump images.tar |
  gpg --batch --trust-model always --recipient "$fingerprint" --output "$scratch/corrupt.gpg" --encrypt
if "$root/scripts/clarity-restore-test.sh" "$scratch/corrupt.gpg"; then
  printf 'Restore accepted mismatched checksums\n' >&2; exit 1
fi

# A valid manifest containing an invalid SQL dump fails after provisioning.
gpg --quiet --batch --decrypt "$backup" | tar -C "$scratch/corrupt" -xf -
printf 'invalid database archive' > "$scratch/corrupt/db.dump"
(
  cd "$scratch/corrupt"
  sha256sum metadata.txt db.dump images.tar > SHA256SUMS
  tar -cf - metadata.txt SHA256SUMS db.dump images.tar
) | gpg --batch --trust-model always --recipient "$fingerprint" --output "$scratch/invalid-dump.gpg" --encrypt
restore_resources() {
  docker ps -a --filter 'name=clarity-restore-' --format '{{.Names}}'
  docker volume ls --filter 'name=clarity-restore-' --format '{{.Name}}'
  docker network ls --filter 'name=clarity-restore-' --format '{{.Name}}'
}
before=$(restore_resources | sort)
if "$root/scripts/clarity-restore-test.sh" "$scratch/invalid-dump.gpg"; then
  printf 'Restore accepted an invalid database archive\n' >&2; exit 1
fi
[[ $(restore_resources | sort) == "$before" ]]

# Exercise the randomized target's collision guard without accepting target names in the operator command.
collision=$(openssl rand -hex 8)
fixture_collision_volume="clarity-restore-$collision-postgres"
docker volume create "$fixture_collision_volume" >/dev/null
mkdir "$scratch/bin"
cat > "$scratch/bin/openssl" <<'EOF'
#!/usr/bin/env bash
[[ $* == 'rand -hex 8' ]] || exit 1
printf '%s\n' "$RESTORE_TEST_COLLISION"
EOF
chmod 700 "$scratch/bin/openssl"
if PATH="$scratch/bin:$PATH" RESTORE_TEST_COLLISION="$collision" "$root/scripts/clarity-restore-test.sh" "$backup"; then
  printf 'Restore accepted an existing target\n' >&2; exit 1
fi
docker volume inspect "$fixture_collision_volume" >/dev/null

target=$("$root/scripts/clarity-restore-test.sh" "$backup" "$1")
restored=$(printf '%s\n' "$target" | sed -n 's/^network=//p')
[[ $restored =~ ^clarity-restore-[a-f0-9]{16}$ ]]
restore_app=$(printf '%s\n' "$target" | sed -n 's/^backend=//p')
[[ $restore_app == "$restored-app" ]]
docker exec -i "$restore_app" node - verify < "$root/tests/tooling/backup-smoke.cjs"
