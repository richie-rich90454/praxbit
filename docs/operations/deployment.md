# Deployment

Praxbit deploys from a direct clone of this repository with one project-root `.env` and one Node.js process. The same steps work on Windows, macOS, and Linux. The Hono process serves the API and the built web application, so a reverse proxy is optional unless you need TLS or a public hostname. No service manager is required; `pnpm start` runs the process directly.

## Topology

```text
Browser
  -> Hono process on HOST:PORT
       -> apps/web/dist            static web application and service worker
       -> /api/v1/*                JSON API
       -> PostgreSQL 16+           local or external
       -> optional AI provider     external HTTPS
```

Do not add Redis, Kafka, Kubernetes, a container runtime requirement, a second JVM, or a persistent compiler service for this deployment. Do not run arbitrary learner code on the server.

## Prerequisites

- Node.js 22.12 or newer.
- pnpm 12.14.0 through Corepack.
- PostgreSQL 16 or newer, running and reachable from the application host.
- A writable checkout of this repository.

Windows, macOS, and Linux all support the same Node.js and PostgreSQL clients. Install PostgreSQL with the platform installer or package manager, then create a role and database:

```sql
CREATE ROLE praxbit LOGIN PASSWORD 'replace-this-password';
CREATE DATABASE praxbit OWNER praxbit;
```

The commands below use `createdb` and `psql`, which are included with PostgreSQL on every platform.

## First deployment

```bash
git clone <repository-url> praxbit
cd praxbit
```

Create the environment file:

```bash
# macOS or Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Edit `.env` in the project root. At minimum:

```dotenv
DATABASE_URL=postgresql://praxbit:replace-this-password@127.0.0.1:5432/praxbit
HOST=0.0.0.0
PORT=8787
NODE_ENV=production
PUBLIC_ORIGIN=http://localhost:8787
COOKIE_SECURE=0
```

Set `COOKIE_SECURE=1` only when the browser reaches the site over HTTPS. Set `TRUST_PROXY=1` only when a trusted reverse proxy sets `X-Forwarded-For`. Leave `CORS_ORIGINS` empty for same-origin deployment.

Install, migrate, build, and start:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm start
```

`pnpm bootstrap` performs install, migration, and build in one cross-platform command. Use `pnpm bootstrap --skip-install` or `--skip-build` when those steps are already complete; migrations always run.

The server loads `.env` from the project root automatically. `pnpm db:migrate` and `pnpm db:rollback` use the same loader. Shell variables take precedence over the file. Set `PRAXBIT_ENV_FILE` to use a different file.

Open `http://localhost:8787`. The process serves:

- `/` and the single-page fallback for every client route.
- `/assets/*`, `sw.js`, the manifest, and other build files.
- `/healthz` and `/readyz`.
- `/api/v1/*`.

## Platform notes

### Windows

Use PowerShell for the copy command. Run the server from the repository root so the default paths resolve. If the process must survive sign-out, run it under Task Scheduler, NSSM, or another service wrapper with the repository root as the working directory. The server handles `SIGINT` and `SIGTERM` where the process manager provides them.

### macOS

Use `brew install postgresql@16` or the official installer. Run the process under `launchd` or a process manager when it must survive logout. The repository commands are otherwise identical.

### Linux

Use the distribution packages or the official PostgreSQL repository. Run the process from the repository root. Root is allowed; the application does not drop privileges or require a dedicated user. For long-running operation, use a process supervisor of your choice, such as PM2, supervisord, or a terminal multiplexer.

## Process management

The simplest supported operation is:

```bash
pnpm start
```

Run it from the repository root so the default web, content, and environment paths resolve. If the process must survive logout or reboot, use a cross-platform supervisor of your choice, such as PM2, supervisord, or a terminal multiplexer.

The process reads `.env` itself. Running as root is allowed; no application-level user check exists. If you run as root, protect the checkout and `.env` with filesystem permissions appropriate to your host.

## HTTPS and reverse proxies

For a public site, terminate TLS at Caddy, Nginx, Cloudflare, or another trusted proxy and forward all traffic to `127.0.0.1:8787`. The Node process already serves static files, so the proxy does not need a separate static root.

Requirements:

- Forward the original host and protocol.
- Set `TRUST_PROXY=1` and `COOKIE_SECURE=1` when the proxy terminates TLS.
- Do not cache `/api/*` responses.
- Keep request bodies under `BODY_LIMIT_BYTES`.
- Preserve the `/api` path prefix.

The example files remain useful:

- `infra/caddy/Caddyfile.example`
- `infra/nginx/praxbit.conf.example`

Validate and reload the proxy with its own tooling. This repository does not issue certificates.

## Database migrations

1. Take a backup before a schema change that can lose or rewrite data.
2. Run `pnpm db:migrate` with the deployment `.env`.
3. Verify `/readyz`.
4. Start or restart the matching application build.

```bash
pnpm db:migrate
```

Rollback is explicit and destructive:

```bash
pnpm db:rollback
```

Do not run a rollback without understanding the down migration and having a backup. Prefer forward-only, expand/contract migrations.

The migration directory is `database/migrations`. Do not edit a migration that has shipped.

## Verify a deployment

- `curl -fsS http://127.0.0.1:8787/healthz` returns `{ "status": "ok" }`.
- `curl -fsS http://127.0.0.1:8787/readyz` returns `{ "status": "ready" }`.
- The root page returns the built application, not a directory listing or API 404.
- A client route such as `/learn` returns the application shell.
- A guest can open a mission and keep progress after refresh.
- A test account can register, sign in, start an attempt, submit evidence, sync, and load the world.
- The browser console has no content-security-policy errors for scripts, workers, Pyodide, or the sandboxed preview.

Exercise the login and sync path; do not declare success from the health check alone.

## Updating a deployment

Pull the new revision, install dependencies, migrate, build, and restart the process:

```bash
git pull
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm start
```

For a process supervisor, restart through that supervisor. Keep the previous checkout or build until the new one passes `/readyz` and a login-and-sync check.

## Rollback

Check out the previous commit or release, run `pnpm install --frozen-lockfile`, `pnpm build`, and restart the process. The database schema may not be backward-compatible; restore the backup or roll forward with a fix when it is not.

## Backups

Use `infra/backup/backup-postgres.sh` on Linux or the equivalent `pg_dump` command on any platform:

```bash
pg_dump --format=custom --file=praxbit.dump "$DATABASE_URL"
pg_restore --clean --if-exists --dbname="$DATABASE_URL" praxbit.dump
```

A backup is not verified until it has been restored into a disposable database. Keep backups outside the repository and outside the web root.

## Resource budget

| Resource | Target | How to check |
| --- | --- | --- |
| Hono idle RSS | 100–150 MB preferred | Task Manager, Activity Monitor, `ps` |
| Hono active RSS | under 200 MB preferred | load test plus platform monitoring |
| PostgreSQL pool | 2–4 connections | `DB_POOL_SIZE`; `pg_stat_activity` |
| CPU | under 80% of one core in normal use | platform monitoring |
| Disk | release, build output, and backups with headroom | `df -h`, Explorer, Finder |

These are budgets, not measured guarantees. Record the actual numbers.

## Logs

The server writes structured JSON to standard output. Use the process manager or service wrapper to retain and rotate it. Do not log request bodies, cookies, or authorization headers. Proxy access logs are configured separately.

## What is not automated

- No public production host or DNS record is provisioned.
- No TLS certificate is issued by this repository.
- No Windows service, macOS launch agent, or container image is installed by this repository.
- No PostgreSQL high-availability or failover is configured.
