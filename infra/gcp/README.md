# Google Cloud launch target

Checkpoint 1 still creates and verifies the portable image and PostgreSQL contracts locally only.
Infrastructure provisioning is deferred until the database and job contracts are complete, so no
empty production resources accrue cost.

The approved `asia-south1` topology is:

- public Cloud Run web service, request billing, minimum instances `0`;
- private Cloud Run report worker called only by OIDC-authenticated Cloud Tasks;
- Cloud SQL PostgreSQL 17 Enterprise, private IP, automated backups and point-in-time recovery;
- Cloud Tasks queue containing opaque report IDs and deterministic task names;
- private regional Cloud Storage buckets for reports and deployment artifacts;
- Secret Manager, Artifact Registry, Cloud Logging, Monitoring, and Error Reporting.

The local logical-restore procedure is in `docs/runbooks/postgres-restore.md`; it does not claim Cloud
SQL backup/PITR readiness. Provisioning code arrives in the infrastructure checkpoint after service
accounts, database names, queue contracts, retention, recovery objectives, and budget alerts have
tests or acceptance checks. Do not create resources manually without recording the change in
infrastructure as code.
