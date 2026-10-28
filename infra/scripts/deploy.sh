#!/usr/bin/env bash
# Deploy a prebuilt Praxbit release. Build in CI; this script never runs Vite,
# TypeScript watchers, package installs, or migrations.
#
# Artifact contract (a directory or a flat .tar.gz):
#   apps/server/dist/main.js
#   apps/web/dist/index.html
#   content/                  (optional if CONTENT_DIR points elsewhere)
#
# Environment:
#   RELEASE_ARTIFACT   required, path to the artifact
#   APP_ROOT           default /opt/praxbit
#   SERVICE            default praxbit
#   HEALTH_URL         default http://127.0.0.1:8787/readyz
#   HEALTH_ATTEMPTS     default 30 checks
#   HEALTH_DELAY        default 2 seconds between checks
#   KEEP_RELEASES      default 5
#   GIT_SHA            optional, recorded in the release directory name
#   RELEASE_CHECKSUM   optional SHA-256 of the artifact

set -euo pipefail
umask 022

: "${RELEASE_ARTIFACT:?RELEASE_ARTIFACT is required}"

APP_ROOT="${APP_ROOT:-/opt/praxbit}"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_LINK="${APP_ROOT}/current"
SERVICE="${SERVICE:-praxbit}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/readyz}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-30}"
HEALTH_DELAY="${HEALTH_DELAY:-2}"

for command_name in tar curl systemctl readlink; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Required command is missing: ${command_name}" >&2
        exit 1
    fi
done

if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
fi

mkdir -p "$RELEASES_DIR"

LOCK_FILE="${APP_ROOT}/deploy.lock"
exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
    if ! flock -n 9; then
        echo "Another deployment is already running." >&2
        exit 1
    fi
fi

release_id="$(date -u +%Y%m%dT%H%M%SZ)"
if [ -n "${GIT_SHA:-}" ]; then
    short_sha="$(printf '%s' "$GIT_SHA" | tr -cd 'A-Za-z0-9' | cut -c1-12)"
    if [ -n "$short_sha" ]; then
        release_id="${release_id}-${short_sha}"
    fi
fi

release_dir="${RELEASES_DIR}/${release_id}"
staging_dir="${RELEASES_DIR}/.staging-${release_id}"
current_next="${APP_ROOT}/current.next"

cleanup_staging() {
    rm -rf "$staging_dir"
    rm -f "$current_next"
}
trap cleanup_staging EXIT

if [ -e "$release_dir" ]; then
    echo "Release directory already exists: ${release_dir}" >&2
    exit 1
fi

echo "Preparing release ${release_id}"

if [ ! -e "$RELEASE_ARTIFACT" ]; then
    echo "Artifact not found: ${RELEASE_ARTIFACT}" >&2
    exit 1
fi

if [ -n "${RELEASE_CHECKSUM:-}" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
        printf '%s  %s\n' "$RELEASE_CHECKSUM" "$RELEASE_ARTIFACT" | sha256sum -c -
    else
        echo "RELEASE_CHECKSUM was provided but sha256sum is unavailable." >&2
        exit 1
    fi
fi

mkdir -p "$staging_dir"
if [ -d "$RELEASE_ARTIFACT" ]; then
    cp -a "$RELEASE_ARTIFACT/." "$staging_dir/"
elif [ -f "$RELEASE_ARTIFACT" ]; then
    tar -xzf "$RELEASE_ARTIFACT" -C "$staging_dir"
else
    echo "Artifact must be a directory or a .tar.gz file." >&2
    exit 1
fi

if [ ! -f "$staging_dir/apps/server/dist/main.js" ]; then
    echo "Artifact is missing apps/server/dist/main.js. The artifact must be flat, not nested in a top-level directory." >&2
    exit 1
fi
if [ ! -f "$staging_dir/apps/web/dist/index.html" ]; then
    echo "Artifact is missing apps/web/dist/index.html." >&2
    exit 1
fi

chmod -R u=rwX,go=rX "$staging_dir"
mv "$staging_dir" "$release_dir"

previous_release=""
if [ -L "$CURRENT_LINK" ]; then
    previous_release="$(readlink -f "$CURRENT_LINK" || true)"
fi

ln -s "$release_dir" "$current_next"
mv -Tf "$current_next" "$CURRENT_LINK"

health_check() {
    attempt=1
    while [ "$attempt" -le "$HEALTH_ATTEMPTS" ]; do
        if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
            return 0
        fi
        sleep "$HEALTH_DELAY"
        attempt=$((attempt + 1))
    done
    return 1
}

echo "Switched current to ${release_dir}"
echo "Restarting ${SERVICE}"

if ! $SUDO systemctl restart "$SERVICE"; then
    echo "systemctl restart failed. Attempting rollback." >&2
    if [ -n "$previous_release" ] && [ -d "$previous_release" ]; then
        ln -s "$previous_release" "$current_next"
        mv -Tf "$current_next" "$CURRENT_LINK"
        if $SUDO systemctl restart "$SERVICE" && health_check; then
            echo "Rollback succeeded. Current release is ${previous_release}." >&2
            exit 1
        fi
        echo "Rollback restart or health check failed. Manual attention required." >&2
        exit 2
    fi
    if $SUDO systemctl stop "$SERVICE"; then
        echo "No previous release was available. ${SERVICE} was stopped." >&2
    fi
    exit 1
fi

if ! health_check; then
    echo "Health check failed at ${HEALTH_URL}. Attempting rollback." >&2
    if [ -n "$previous_release" ] && [ -d "$previous_release" ]; then
        ln -s "$previous_release" "$current_next"
        mv -Tf "$current_next" "$CURRENT_LINK"
        if $SUDO systemctl restart "$SERVICE" && health_check; then
            echo "Rollback succeeded. Current release is ${previous_release}." >&2
            exit 1
        fi
        echo "Rollback restart or health check failed. Manual attention required." >&2
        exit 2
    fi
    if $SUDO systemctl stop "$SERVICE"; then
        echo "No previous release was available. ${SERVICE} was stopped." >&2
    fi
    exit 1
fi

echo "Health check passed. Release ${release_id} is live."

current_target="$(readlink -f "$CURRENT_LINK" || true)"
kept=0
while IFS= read -r old_release; do
    [ -z "$old_release" ] && continue
    kept=$((kept + 1))
    if [ "$kept" -gt "$KEEP_RELEASES" ] && [ "$old_release" != "$current_target" ]; then
        rm -rf "$old_release"
        echo "Removed old release ${old_release}"
    fi
done < <(ls -1dt "${RELEASES_DIR}"/20* 2>/dev/null || true)

echo "Deployment complete. Migrations, if any, must be run separately and before this script."
