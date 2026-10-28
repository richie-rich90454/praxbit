#!/usr/bin/env bash
# Back up the Praxbit PostgreSQL database with pg_dump custom format.
# Run as a user that can read DATABASE_URL and write BACKUP_DIR. Never echo it.

set -euo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/praxbit}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
OFFBOX_TARGET="${OFFBOX_TARGET:-}"
OFFBOX_REQUIRED="${OFFBOX_REQUIRED:-false}"

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
    echo "RETENTION_DAYS must be a non-negative integer." >&2
    exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
    echo "pg_dump is not installed or not on PATH." >&2
    exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
    echo "pg_restore is not installed or not on PATH." >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_name="praxbit-${timestamp}.dump"
dump_path="${BACKUP_DIR}/${dump_name}"
checksum_path="${dump_path}.sha256"

echo "Starting PostgreSQL backup: ${dump_name}"

if ! pg_dump \
    --dbname="$DATABASE_URL" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --no-password \
    --lock-wait-timeout=30s \
    --file="$dump_path"; then
    rm -f "$dump_path"
    echo "pg_dump failed. No backup was retained." >&2
    exit 1
fi

chmod 600 "$dump_path"

if [ ! -s "$dump_path" ]; then
    rm -f "$dump_path"
    echo "The dump is empty. No backup was retained." >&2
    exit 1
fi

# A custom-format dump should list cleanly before it is considered usable.
if ! pg_restore --list "$dump_path" >/dev/null; then
    rm -f "$dump_path"
    echo "The dump failed pg_restore --list validation. No backup was retained." >&2
    exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
    (cd "$BACKUP_DIR" && sha256sum "$dump_name" > "${dump_name}.sha256")
elif command -v shasum >/dev/null 2>&1; then
    (cd "$BACKUP_DIR" && shasum -a 256 "$dump_name" > "${dump_name}.sha256")
else
    echo "Neither sha256sum nor shasum is available; cannot record a checksum." >&2
    exit 1
fi
chmod 600 "$checksum_path"

size="$(wc -c < "$dump_path" | tr -d ' ')"
echo "Local backup complete: ${dump_path} (${size} bytes)"
echo "Checksum: ${checksum_path}"

if [ -n "$OFFBOX_TARGET" ]; then
    if ! command -v rsync >/dev/null 2>&1; then
        echo "OFFBOX_TARGET is set but rsync is not installed." >&2
        exit 1
    fi
    if ! rsync -a --checksum "$dump_path" "$checksum_path" "$OFFBOX_TARGET/"; then
        echo "Off-box copy failed. The local backup remains at ${dump_path}." >&2
        exit 1
    fi
    echo "Off-box copy complete."
elif [ "$OFFBOX_REQUIRED" = "true" ] || [ "$OFFBOX_REQUIRED" = "1" ]; then
    echo "OFFBOX_REQUIRED is set but OFFBOX_TARGET is empty. The local backup remains, but the run is a failure." >&2
    exit 1
else
    echo "Off-box copy not configured. Set OFFBOX_TARGET (for example an rsync destination) for production."
fi

# Retention applies only to files this script owns.
find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'praxbit-*.dump' -o -name 'praxbit-*.dump.sha256' \) \
    -mtime "+${RETENTION_DAYS}" -print -delete

echo "Backup finished."
