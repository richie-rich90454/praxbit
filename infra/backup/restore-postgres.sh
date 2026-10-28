#!/usr/bin/env bash
# Restore a pg_dump custom-format backup into a target database.
# This is destructive: it runs pg_restore --clean --if-exists.
# Set RESTORE_DATABASE_URL to the target, never to production by accident.

set -euo pipefail
umask 077

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required (the target database, not the backup source)}"

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <praxbit-YYYYMMDDTHHMMSSZ.dump>" >&2
    exit 1
fi

dump_path="$1"
if [ ! -f "$dump_path" ]; then
    echo "Backup file not found: ${dump_path}" >&2
    exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
    echo "pg_restore is not installed or not on PATH." >&2
    exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
    echo "psql is not installed or not on PATH." >&2
    exit 1
fi

checksum_path="${dump_path}.sha256"
if [ -f "$checksum_path" ]; then
    checksum_dir="$(dirname "$dump_path")"
    checksum_name="$(basename "$checksum_path")"
    if command -v sha256sum >/dev/null 2>&1; then
        (cd "$checksum_dir" && sha256sum -c "$checksum_name")
    elif command -v shasum >/dev/null 2>&1; then
        expected="$(awk '{print $1}' "$checksum_path")"
        actual="$(shasum -a 256 "$dump_path" | awk '{print $1}')"
        if [ "$expected" != "$actual" ]; then
            echo "Checksum mismatch for ${dump_path}." >&2
            exit 1
        fi
        echo "${dump_path}: OK"
    else
        echo "No SHA-256 tool is available to verify ${checksum_path}." >&2
        exit 1
    fi
elif [ "${ALLOW_UNCHECKED_RESTORE:-false}" != "true" ]; then
    echo "No checksum file found at ${checksum_path}. Set ALLOW_UNCHECKED_RESTORE=true only for a controlled drill." >&2
    exit 1
fi

if ! pg_restore --list "$dump_path" >/dev/null; then
    echo "The file is not a readable pg_dump custom-format archive." >&2
    exit 1
fi

if [ -n "${DATABASE_URL:-}" ] && [ "$RESTORE_DATABASE_URL" = "$DATABASE_URL" ] && [ "${ALLOW_PRODUCTION_RESTORE:-false}" != "true" ]; then
    echo "RESTORE_DATABASE_URL equals DATABASE_URL. Refusing to restore over the configured production database." >&2
    echo "Use a separate drill database, or set ALLOW_PRODUCTION_RESTORE=true only with explicit authorization." >&2
    exit 1
fi

target_name="$(psql "$RESTORE_DATABASE_URL" --no-password --tuples-only --no-align --command='SELECT current_database()')"
if [ -z "$target_name" ]; then
    echo "Could not determine the target database name." >&2
    exit 1
fi

echo "Target database: ${target_name}"
echo "This will drop and recreate objects in that database from: ${dump_path}"

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
    if [ ! -t 0 ]; then
        echo "Non-interactive restore requires RESTORE_CONFIRM=yes after verifying the target." >&2
        exit 1
    fi
    read -r -p "Type the target database name (${target_name}) to continue: " confirmation
    if [ "$confirmation" != "$target_name" ]; then
        echo "Confirmation did not match. Nothing was restored." >&2
        exit 1
    fi
fi

pg_restore \
    --dbname="$RESTORE_DATABASE_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --exit-on-error \
    --single-transaction \
    "$dump_path"

if ! psql "$RESTORE_DATABASE_URL" --no-password --tuples-only --no-align --command='SELECT 1' >/dev/null; then
    echo "Restore finished but the verification connection failed." >&2
    exit 1
fi

table_count="$(psql "$RESTORE_DATABASE_URL" --no-password --tuples-only --no-align \
    --command="SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'")"
echo "Restore verification: connection OK, ${table_count} public tables present."

if [ -n "${RESTORE_EXPECT_TABLE:-}" ]; then
    present="$(psql "$RESTORE_DATABASE_URL" --no-password --tuples-only --no-align \
        --set=expected_table="$RESTORE_EXPECT_TABLE" \
        --command="SELECT to_regclass('public.' || quote_ident(:'expected_table')) IS NOT NULL")"
    if [ "$present" != "t" ]; then
        echo "Expected table '${RESTORE_EXPECT_TABLE}' is missing after restore." >&2
        exit 1
    fi
    echo "Expected table present: ${RESTORE_EXPECT_TABLE}"
fi

echo "Restore finished. Record the restore duration and verification result in the operations log."
