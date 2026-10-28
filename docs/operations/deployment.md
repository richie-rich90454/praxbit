# Deployment

Praxbit targets one lightweight Hono process on a shared VPS, static files through the existing Caddy or Nginx, PostgreSQL 16+, and no server-side learner compilation. The templates in `infra/` are examples. They have not been applied to a production host from this repository.

## Topology

```text
Internet
  -> existing Caddy or Nginx (TLS, static files, /api proxy)
       -> /opt/praxbit/current/apps/web/dist        static Vite build
       -> 127.0.0.1:8787                            one Hono Node.js process
            -> PostgreSQL 16+                       local or external
            -> optional AI provider                 external HTTPS

systemd: praxbit.service
  - unprivileged user praxbit
  - EnvironmentFile=/etc/praxbit/praxbit.env
  - MemoryHigh=256M, MemoryMax=384M, CPUQuota=80%
  - Restart=on-failure
```

Do not add Redis, Kafka, Kubernetes, a Docker daemon requirement, a second JVM, a persistent compiler service, or a local LLM for the initial deployment. Do not run arbitrary learner code on this host.

## Host assumptions

The production host is expected to have:

- 2 vCPUs and 2 GB RAM.
- Existing Spring Boot and Node.js services.
- An existing Caddy or Nginx installation and TLS certificates.
- Node.js 22.12+ available as `/usr/bin/node`.
- PostgreSQL 16+ reachable with a dedicated role and database.
- `systemd`, `curl`, `tar`, `rsync` (for off-box backups), and standard PostgreSQL client tools.

Measure the host before deploying. The memory values in the unit are a ceiling, not a promise that the host has room. If PostgreSQL runs on the same host, leave additional headroom and consider an external database.

## Build the artifact

Build in CI, not on the production host:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Create a flat artifact containing:

```text
apps/server/dist/main.js
apps/web/dist/
apps/companion/dist/main.js   (optional)
content/                      (if CONTENT_DIR points inside the release)
package.json
```

Example:

```bash
tar -czf praxbit-release.tar.gz \
  apps/server/dist \
  apps/web/dist \
  apps/companion/dist \
  content \
  package.json
```

The deploy script requires a flat artifact. Do not wrap everything in an extra top-level directory.

## First-time setup

Create the service account and directories:

```bash
sudo useradd --system --home /opt/praxbit --shell /usr/sbin/nologin praxbit
sudo install -d -o praxbit -g praxbit -m 0755 /opt/praxbit /opt/praxbit/releases
sudo install -d -o root -g praxbit -m 0750 /etc/praxbit
sudo install -d -o praxbit -g praxbit -m 0700 /var/backups/praxbit
```

Install the environment file:

```bash
sudo install -o root -g praxbit -m 0640 \
  infra/env/praxbit.env.example /etc/praxbit/praxbit.env
sudo editor /etc/praxbit/praxbit.env
```

Replace every placeholder. Do not copy a real environment file into the repository.

Install the unit:

```bash
sudo install -o root -g root -m 0644 infra/systemd/praxbit.service /etc/systemd/system/praxbit.service
sudo systemctl daemon-reload
sudo systemctl enable praxbit
```

The first start needs a release at `/opt/praxbit/current` and migrations already applied. Do not enable and start before those steps if the health check would fail.

## Database migrations

Migrations are explicit and are not run by `deploy.sh`.

1. Take a backup before a schema change that can lose or rewrite data.
2. Run migrations from a controlled checkout or CI runner with the same `DATABASE_URL` the server uses.
3. Verify the server starts and `/readyz` returns `200`.
4. Deploy the matching application artifact.

```bash
DATABASE_URL=postgres://praxbit:…@db-host:5432/praxbit pnpm db:migrate
```

Do not run `pnpm db:rollback` on production without understanding the down migration and having a backup. Prefer forward-only, expand/contract migrations:

1. Add the new nullable column or table.
2. Deploy code that writes both shapes and reads the old one.
3. Backfill.
4. Switch reads.
5. Remove the old shape in a later release.

The migration directory is `database/migrations`. Do not edit a migration that has shipped.

## Proxy

Use the existing proxy. The examples are:

- `infra/caddy/Caddyfile.example`
- `infra/nginx/praxbit.conf.example`

Key requirements:

- Serve `/opt/praxbit/current/apps/web/dist` as static files.
- `try_files {path} /index.html` for the SPA fallback.
- Proxy `/api/*` to `127.0.0.1:8787` while preserving the `/api` prefix.
- Set `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-For`, and `X-Real-IP`.
- Cache hashed assets for a long time; do not cache `/api/*`.
- Set security headers. Add a Content-Security-Policy only after testing the bundle, Pyodide worker, and sandboxed previews.
- Do not replace unrelated server blocks or upstreams.

Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Deploy a release

```bash
RELEASE_ARTIFACT=/tmp/praxbit-release.tar.gz \
GIT_SHA="$GITHUB_SHA" \
HEALTH_URL=https://praxbit.example/readyz \
bash infra/scripts/deploy.sh
```

The script:

1. Takes a lock.
2. Copies or extracts the artifact into a new release directory.
3. Verifies `apps/server/dist/main.js` and `apps/web/dist/index.html`.
4. Switches `/opt/praxbit/current` atomically.
5. Restarts only the `praxbit` service.
6. Polls the health URL.
7. Rolls back the symlink and restarts the previous release on failure.
8. Keeps the last `KEEP_RELEASES` releases (default 5).

It never prints environment values, never runs migrations, and never touches another service.

If the service fails to restart and no previous release exists, the script stops `praxbit` and exits nonzero. That is safer than leaving a broken release serving traffic.

## Verify a deployment

- `curl -fsS http://127.0.0.1:8787/healthz` returns `{ "status": "ok" }`.
- `curl -fsS http://127.0.0.1:8787/readyz` returns `{ "status": "ready" }`.
- The public site loads with a fresh cache and the service worker updates.
- A guest can open a cached mission and keep progress after refresh.
- A test account can register, sign in, start an attempt, submit evidence, sync, and load the world.
- `systemctl status praxbit` is active, and `journalctl -u praxbit` has no repeated errors.
- `systemctl show praxbit -p MemoryCurrent` and `systemd-cgtop` show the process within budget.
- Existing services on the host remain healthy. Check their health endpoints and memory after the deploy.

Do not declare success from the health check alone. Exercise the login and sync path.

## Rollback

Automatic rollback happens when restart or health check fails. Manual rollback:

```bash
sudo -u praxbit readlink -f /opt/praxbit/current
ls -1dt /opt/praxbit/releases/*
sudo -u praxbit ln -sfn /opt/praxbit/releases/<previous> /opt/praxbit/current.next
sudo -u praxbit mv -Tf /opt/praxbit/current.next /opt/praxbit/current
sudo systemctl restart praxbit
curl -fsS http://127.0.0.1:8787/readyz
```

Rollback caveats:

- A database migration may not be backward-compatible. If the old code cannot read the new schema, restore the backup or roll forward with a fix.
- Do not roll back by deleting the current release before switching the symlink.
- Do not force-push or rewrite a release directory.
- Record the failed release id and the reason.

## Resource budget

| Resource | Target | How to check |
| --- | --- | --- |
| Hono idle RSS | 100–150 MB preferred | `ps -o pid,rss,cmd -C node`, `systemctl show -p MemoryCurrent` |
| Hono active RSS | under 200 MB preferred | Load test plus `systemd-cgtop` |
| PostgreSQL pool | 2–4 connections | `DB_POOL_SIZE`; `pg_stat_activity` |
| CPU | under 80% of one core in normal use | `systemd-cgtop`, `pidstat` |
| Disk | release + backups + journal with headroom | `df -h`, `du -sh` |
| Journal | bounded | configure `SystemMaxUse` in `journald.conf` |

These are budgets from the product plan, not measured production guarantees. Record the actual numbers from your host. If memory approaches the ceiling, reduce the release size, cache, or concurrency; do not raise the limit without checking the other services.

## Logs

The service logs structured JSON to journald. Read recent logs:

```bash
journalctl -u praxbit -n 200 --no-pager
journalctl -u praxbit -f
```

Bound journal disk use in `/etc/systemd/journald.conf`, for example `SystemMaxUse=200M`, then restart journald during a maintenance window. Do not delete another service's logs.

Proxy access logs are configured separately. Keep retention finite and do not log request bodies, cookies, or authorization headers.

## What is not automated

- No production deployment has been performed from this repository.
- No TLS certificate is issued by this repository; use the existing proxy's ACME setup.
- No external uptime monitor is provisioned.
- No container image is published.
- No app-store build is produced.
- No PostgreSQL high-availability or failover is configured.
