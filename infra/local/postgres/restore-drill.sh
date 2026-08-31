#!/usr/bin/env bash
set -euo pipefail

source_database="${SOURCE_DATABASE_NAME:-numerology}"
target_database="numerology_restore_validation"
database_host="${DATABASE_HOST:-127.0.0.1}"
database_port="${DATABASE_PORT:-5432}"
database_user="${DATABASE_USER:-numerology}"
backup_path="$(mktemp /tmp/numerology-checkpoint-1-restore-XXXXXX.dump)"
target_created=false

cleanup() {
  if [[ "$target_created" == "true" ]]; then
    actual_target="$(runuser -u postgres -- psql -Atqc "SELECT datname FROM pg_database WHERE datname = '$target_database'")"
    if [[ "$actual_target" == "$target_database" ]]; then
      runuser -u postgres -- dropdb "$target_database"
    fi
  fi
  rm -f "$backup_path"
}
trap cleanup EXIT

if [[ "$(runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_database WHERE datname = '$target_database'")" == "1" ]]; then
  echo "Restore target already exists; inspect it before retrying." >&2
  exit 17
fi

export PGPASSWORD="${PGPASSWORD:-numerology}"

pg_dump \
  --host "$database_host" \
  --port "$database_port" \
  --username "$database_user" \
  --dbname "$source_database" \
  --format custom \
  --no-owner \
  --no-privileges \
  --file "$backup_path"

sha256sum "$backup_path"
runuser -u postgres -- createdb --owner "$database_user" "$target_database"
target_created=true

pg_restore \
  --host "$database_host" \
  --port "$database_port" \
  --username "$database_user" \
  --dbname "$target_database" \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  "$backup_path"

table_count="$(psql --host "$database_host" --port "$database_port" --username "$database_user" --dbname "$target_database" --tuples-only --no-align --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")"
migration_count="$(psql --host "$database_host" --port "$database_port" --username "$database_user" --dbname "$target_database" --tuples-only --no-align --command "SELECT count(*) FROM public.schema_migrations")"

echo "restored_tables=$table_count restored_migrations=$migration_count"
[[ "$table_count" == "9" ]]
[[ "$migration_count" == "1" ]]
echo "restore_drill=passed cleanup=pending"
