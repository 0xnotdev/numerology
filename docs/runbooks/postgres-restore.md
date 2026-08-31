# PostgreSQL restore validation runbook

Checkpoint 1 validates logical backup and restore locally. Cloud SQL automated backups, point-in-time
recovery, RPO, and RTO evidence belong to the infrastructure checkpoint and are not claimed here.

For the standard WSL PostgreSQL development environment, run the guarded acceptance drill as root:

```powershell
wsl -d Ubuntu-24.04 -u root -- bash "/mnt/d/numerology app/platform/infra/local/postgres/restore-drill.sh"
```

The script refuses a pre-existing validation database, creates its backup under `/tmp`, verifies the
nine-table/one-migration Checkpoint 1 contract, and removes only the exact temporary artifacts it made.

## Preconditions

- Use PostgreSQL 17 client tools.
- Restore only into a new isolated database named `numerology_restore_validation`.
- Never restore production personal data into a developer machine. Use synthetic or approved sanitized
  data.
- Record the PostgreSQL version, migration journal state, backup SHA-256, operator, start/end time, and
  validation result in the incident or release record.

## Create a logical backup

From the repository root, with `DATABASE_URL` pointing to the intended source:

```powershell
New-Item -ItemType Directory -Force .local-backups | Out-Null
pg_dump --dbname $env:DATABASE_URL --format custom --no-owner --no-privileges --file .local-backups/checkpoint-1.dump
Get-FileHash .local-backups/checkpoint-1.dump -Algorithm SHA256
```

Keep `.local-backups` outside source control and protect it as confidential whenever it contains
non-synthetic records.

## Restore into isolation

The following target is deliberately explicit. Confirm that it does not exist before creating it:

```powershell
psql --dbname postgresql://numerology:numerology@127.0.0.1:5432/postgres --command "SELECT datname FROM pg_database WHERE datname = 'numerology_restore_validation'"
createdb --host 127.0.0.1 --port 5432 --username numerology numerology_restore_validation
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname postgresql://numerology:numerology@127.0.0.1:5432/numerology_restore_validation .local-backups/checkpoint-1.dump
```

If the target already exists, stop. Inspect it and choose whether to retain it; this runbook never drops
or overwrites a database automatically.

## Validate the restored database

```powershell
psql --dbname postgresql://numerology:numerology@127.0.0.1:5432/numerology_restore_validation --command "TABLE public.schema_migrations"
psql --dbname postgresql://numerology:numerology@127.0.0.1:5432/numerology_restore_validation --command "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
```

Acceptance requires the migration journal and the nine Checkpoint 1 tables to be present, no restore
errors, and application decryption of an approved synthetic canary with the matching local key set.
Run the repository integration suite separately against `numerology_test`; its reset guard intentionally
refuses the restore-validation database.

After evidence is captured, the isolated database may be removed only by an operator who has verified
the exact database name and no longer needs the restore artifact.
