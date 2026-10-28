# Backup and restore

The backup scripts use PostgreSQL custom-format dumps, SHA-256 checksums, retention, and an optional off-box copy. They do not encrypt the dump themselves. Store backups on an encrypted volume or an encrypted off-box destination.

## Backup

```bash
DATABASE_URL=postgres://praxbit:…@db-host:5432/praxbit \
BACKUP_DIR=/var/backups/praxbit \
RETENTION_DAYS=14 \
OFFBOX_TARGET=backup-host:/srv/backups/praxbit \
OFFBOX_REQUIRED=true \
bash infra/backup/backup-postgres.sh
```

What the script does:

1. Requires `DATABASE_URL`.
2. Creates `BACKUP_DIR` with mode 0700.
3. Runs `pg_dump --format=custom --compress=9 --no-owner --no-privileges --no-password --lock-wait-timeout=30s`.
4. Rejects an empty dump.
5. Validates the archive with `pg_restore --list`.
6. Writes a SHA-256 checksum file with the dump basename.
7. Copies the dump and checksum to `OFFBOX_TARGET` with `rsync -a --checksum` when configured.
8. Deletes files older than `RETENTION_DAYS` that match `praxbit-*.dump` or `praxbit-*.dump.sha256`.

Environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | required | Source database |
| `BACKUP_DIR` | `/var/backups/praxbit` | Local backup directory |
| `RETENTION_DAYS` | `14` | Local retention in days; must be a non-negative integer |
| `OFFBOX_TARGET` | empty | rsync destination, for example `host:/path` |
| `OFFBOX_REQUIRED` | `false` | When `true` or `1`, an unset or failed off-box copy fails the run |

The script never prints `DATABASE_URL` or the password. The connection string is still a process argument to `pg_dump`; run the script as a dedicated user and restrict process visibility. Prefer a `.pgpass`/service file if your environment treats process arguments as sensitive.

## Scheduling

Use the scheduler provided by the host: cron on Linux, Task Scheduler on Windows, or launchd on macOS. Run the backup as the account that can read the environment and write the backup directory.

Cron example:

```cron
30 2 * * * cd /path/to/praxbit && ./infra/backup/backup-postgres.sh >> /var/log/praxbit-backup.log 2>&1
```

On Windows, create a scheduled task that runs `pwsh -File` with the equivalent `pg_dump` command, or run the shell script through Git Bash. On macOS, use a launch agent.

Install the scripts outside the release so an update cannot remove them:

```bash
sudo install -o root -g root -m 0755 infra/backup/backup-postgres.sh /usr/local/sbin/praxbit-backup
sudo install -o root -g root -m 0755 infra/backup/restore-postgres.sh /usr/local/sbin/praxbit-restore
```

Do not put the database password in the scheduler definition. Use a root-owned environment file readable only by the backup account, or a `.pgpass` file with mode 0600.

## Off-box copy

The local copy is not a disaster-recovery backup if the VPS disk fails. Configure `OFFBOX_TARGET` to a different host or object storage.

- The script supports `rsync`. It does not support S3, B2, or rclone directly; use an rsync target or a separate synchronization job with its own credentials.
- Use an encrypted destination. The dump contains learner handles, password hashes, evidence, and club data.
- Do not put an off-box credential in the script or repository. Use a restricted key and the backup user's SSH configuration.
- Verify the off-box copy by listing and checksumming it, not by assuming rsync succeeded.

If off-box copy is not configured, the script prints a warning. Set `OFFBOX_REQUIRED=true` in production so a missing destination fails the run.

## Restore

Restoring is destructive. The script runs `pg_restore --clean --if-exists --single-transaction`.

```bash
RESTORE_DATABASE_URL=postgres://praxbit:…@scratch-host:5432/praxbit_restore \
RESTORE_CONFIRM=yes \
RESTORE_EXPECT_TABLE=users \
bash infra/backup/restore-postgres.sh /var/backups/praxbit/praxbit-20261028T023000Z.dump
```

Safety behavior:

- Requires `RESTORE_DATABASE_URL`; it never falls back to `DATABASE_URL`.
- Requires a checksum file unless `ALLOW_UNCHECKED_RESTORE=true`.
- Validates the archive with `pg_restore --list`.
- Refuses if `RESTORE_DATABASE_URL` exactly equals `DATABASE_URL`, unless `ALLOW_PRODUCTION_RESTORE=true`.
- Prints the target database name and asks for confirmation unless `RESTORE_CONFIRM=yes`.
- Runs in a single transaction, so a failed restore does not leave a half-applied schema.
- Verifies a connection and counts public tables.
- Optionally checks `RESTORE_EXPECT_TABLE` with `to_regclass`.

Create the target database first. The dump does not include `CREATE DATABASE`:

```bash
createdb -h scratch-host -U praxbit praxbit_restore
```

## Restoration testing

A backup is not verified until it has been restored. Run a drill at least monthly and before a risky migration.

1. Choose a backup from the expected retention window.
2. Copy it to a scratch host or a disposable database.
3. Verify the checksum.
4. Restore with the script.
5. Run `SELECT count(*)` on core tables: `users`, `auth_sessions`, `learning_evidence`, `mission_completions`, `worlds`, `clubs`, `event_submissions`.
6. Start a staging API against the restored database with `CONTENT_DIR` pointing at the matching release.
7. Sign in with a test account, load `/me`, sync an empty batch, load the world, and export the account.
8. Record the restore duration, backup timestamp, table counts, and any discrepancy.
9. Destroy the scratch database after the drill unless it is the designated recovery target.

Do not test restores by overwriting production. If a production restore is the only option in an incident, follow the incident runbook and obtain explicit authorization.

## Recovery expectations

- **RPO:** the time since the last successful backup. With a daily 02:30 backup, up to about 24 hours can be lost. Increase frequency if the club activity justifies it.
- **RTO:** the time to provision a database, restore the dump, update `DATABASE_URL`, restart the service, and verify. Measure it in a drill; do not assume.
- The application does not store learner projects or evidence only on the server. Guests have no server backup at all.
- A backup does not restore a deleted account's local device data, AI provider state, or proxy logs.

## Retention and deletion

Retention is a policy decision, not only a disk decision. Backups may contain data that was deleted from the live database. If you promise deletion, define a backup retention window and document that older backups expire. The current script retains dumps for `RETENTION_DAYS`; it does not rewrite historical dumps to remove a user.

## Encryption

The script does not encrypt the dump. Choose one:

- Store backups on an encrypted volume (LUKS, encrypted cloud disk).
- Send them to an encrypted off-box destination.
- Wrap the dump with `age` or `gpg` in a separate job and store the key outside the host.

Do not claim backups are encrypted unless the storage layer or a wrapper actually provides it.
