# Deployment

Praxbit deploys from a direct clone of this repository with one project-root `.env` and one Node.js process. The same steps work on Windows, macOS, and Linux. The Hono process serves the API and the built web application, so a reverse proxy is optional unless you need TLS or a public hostname. No service manager is required; `pnpm start` runs the process directly.

This pass adds configuration for two public hostnames, `praxbit.biszweb.club` and `praxbit.bisz.dev`. It does not perform a live deployment, change DNS, issue a certificate, or restart a remote service.

## Topology

```text
Browser
  -> Caddy or Nginx on :443, certificate for both hostnames
       -> Hono on 127.0.0.1:8787
            -> apps/web/dist            static web application and service worker
            -> /api/v1/*                JSON API
            -> PostgreSQL 16+           local or external
            -> optional AI provider     external HTTPS
```

Both hostnames proxy every path to the same Node process. There is no static file server and no `/api` exception: `/`, `/assets/*`, `/pyodide/*`, `/sw.js`, `/healthz`, `/readyz`, and `/api/*` all reach Hono so its CSP and security headers are preserved.

Do not add Redis, Kafka, Kubernetes, a container runtime requirement, a second JVM, or a persistent compiler service for this deployment. Do not run arbitrary learner code on the server.

## Public hostnames and PUBLIC_ORIGIN

`PUBLIC_ORIGIN` is the primary canonical origin for absolute links and outbound references, for example `https://praxbit.bisz.dev`. It does not restrict which `Host` values the server accepts, and the current server does not rewrite responses to it. Use it as the canonical origin when an operator or feature needs an absolute URL. Both configured hostnames serve the same application and database.

Cookies are host-only. `praxbit_session` and `praxbit_csrf` are set without a `Domain` attribute, so a session created on `https://praxbit.biszweb.club` is not sent to `https://praxbit.bisz.dev`, and the reverse is also true. A learner signs in separately on each hostname. Do not claim shared sessions or single sign-on across the two names. If shared sessions are required later, design an explicit cross-domain authentication flow; do not casually set a parent-domain cookie.

`CORS_ORIGINS` stays empty. Each hostname serves both the web client and the API, so browser requests are same-origin.

## Prerequisites

- Node.js 22.12 or newer.
- pnpm 12.14.0 through Corepack.
- PostgreSQL 16 or newer, running and reachable from the application host.
- A writable checkout of this repository.
- A reverse proxy: Caddy 2.x or Nginx. The examples are in `infra/caddy` and `infra/nginx`.

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

Create the production environment file:

```bash
cp .env.production.example .env
chmod 600 .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.production.example .env
```

Edit `.env` in the project root. At minimum:

```dotenv
DATABASE_URL=postgresql://praxbit:replace-this-password@127.0.0.1:5432/praxbit
HOST=127.0.0.1
PORT=8787
NODE_ENV=production
PUBLIC_ORIGIN=https://praxbit.bisz.dev
COOKIE_SECURE=1
TRUST_PROXY=1
CORS_ORIGINS=
```

`HOST=127.0.0.1` keeps the Node port off the public interfaces. The proxy is the only public listener. Set `COOKIE_SECURE=1` because the browser reaches both hostnames over HTTPS. Set `TRUST_PROXY=1` because the trusted proxy overwrites `X-Forwarded-For`. Leave `CORS_ORIGINS` empty.

For direct local HTTP development, copy `.env.example` instead and use `COOKIE_SECURE=0`, `TRUST_PROXY=0`, and `PUBLIC_ORIGIN=http://localhost:8787`. That mode does not test the production TLS path.

Install, migrate, build, and start:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm start
```

`pnpm start` builds the web and server bundles when they are missing. `pnpm bootstrap` performs install, migration, and build in one cross-platform command. Use `pnpm bootstrap --skip-install` or `--skip-build` when those steps are already complete; migrations always run.

The server loads `.env` from the project root automatically. `pnpm db:migrate` and `pnpm db:rollback` use the same loader. Shell variables take precedence over the file. Set `PRAXBIT_ENV_FILE` to use a different file.

Open `http://127.0.0.1:8787` only through an SSH tunnel or on the host itself. The process serves:

- `/` and the single-page fallback for every client route.
- `/assets/*`, `/pyodide/*`, `sw.js`, the manifest, and other build files.
- `/healthz` and `/readyz`.
- `/api/v1/*`.

## Process management

The simplest supported operation is:

```bash
pnpm start
```

Run it from the repository root so the default web, content, and environment paths resolve. The process reads `.env` itself. Running as root is allowed; no application-level user check exists. If you run as root, protect the checkout and `.env` with filesystem permissions appropriate to your host.

### systemd

The optional unit is `infra/systemd/praxbit.service`. It assumes the checkout is `/opt/praxbit/current`; edit `WorkingDirectory`, `PRAXBIT_ENV_FILE`, and `ExecStart` if yours differs.

```bash
sudo cp infra/systemd/praxbit.service /etc/systemd/system/praxbit.service
sudo systemctl daemon-reload
sudo systemctl enable --now praxbit
sudo systemctl status praxbit
sudo journalctl -u praxbit -f
```

The service runs as root because this repository explicitly allows root. It sends `SIGTERM` and allows 20 seconds for shutdown. It has no application dependency on systemd; the same process runs under PM2 or a terminal multiplexer.

### PM2

PM2 is optional. The configuration is `infra/pm2/ecosystem.config.cjs`; it resolves the repository root from its own location and runs `pnpm start` there.

```bash
npm install --global pm2
pm2 start infra/pm2/ecosystem.config.cjs
pm2 save
pm2 startup
```

`pm2 startup` prints a command that must be run as root to install the boot hook. Use `pm2 logs praxbit`, `pm2 restart praxbit`, and `pm2 delete praxbit` for routine operation. Do not run the systemd unit and PM2 for the same port at the same time.

### Manual supervisor

`pnpm start` in `tmux`, `screen`, or supervisord is also supported. No repository file requires systemd.

## HTTPS and reverse proxies

Requirements for either proxy:

- Terminate TLS with a certificate that covers both `praxbit.biszweb.club` and `praxbit.bisz.dev`.
- Forward all paths to `127.0.0.1:8787`; do not serve `apps/web/dist` directly.
- Set `Host`, `X-Forwarded-Proto`, and `X-Forwarded-Host` from the request. Set `X-Forwarded-For` to the client address and overwrite untrusted incoming values; preserve a chain only when another trusted proxy is in front.
- Keep the `/api` path prefix.
- Keep the request body limit at or below `BODY_LIMIT_BYTES` (default 1 MiB).
- Do not add a second CSP or duplicate the headers Hono already sends. Hono owns CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy`, and conditional HSTS. The proxy examples add HSTS only on the HTTPS listener and replace any duplicate they set.
- Do not cache `/api/*` responses.

### Caddy

`infra/caddy/Caddyfile` is ready for the two hostnames. `Caddyfile.example` is the same configuration with operator notes. Caddy obtains and renews the certificate automatically after DNS and ports 80/443 work.

```bash
sudo install -d -o caddy -g caddy /var/log/caddy
sudo cp infra/caddy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

If Caddy already serves other sites, append the site block to the existing `/etc/caddy/Caddyfile` instead of replacing the file. Check the formatted output before reload:

```bash
caddy fmt --diff /etc/caddy/Caddyfile
```

Access logs are written to `/var/log/caddy/praxbit-access.log` with 20 MB rotation, five retained files, and 30 days of retention. The log format is JSON and includes the request path, status, and client address, not request bodies, cookies, or authorization headers.

### Nginx

`infra/nginx/praxbit.conf` is ready for the two hostnames. `praxbit.conf.example` is the same configuration with operator notes. It is intended for the `http` context, for example `/etc/nginx/conf.d/praxbit.conf`.

Obtain a certificate before installing the TLS server block, because `nginx -t` loads the certificate files. If Nginx is already running and port 80 is free during a short maintenance window:

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone --cert-name praxbit.bisz.dev \
  -d praxbit.biszweb.club -d praxbit.bisz.dev
sudo systemctl start nginx
```

If stopping Nginx is not acceptable, use the Certbot Nginx plugin or a webroot challenge instead. The certificate path in the configuration is `/etc/letsencrypt/live/praxbit.bisz.dev/`; keep `--cert-name praxbit.bisz.dev` or edit both `ssl_certificate` lines.

Install and validate:

```bash
sudo cp infra/nginx/praxbit.conf /etc/nginx/conf.d/praxbit.conf
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx
```

`nginx -t` must pass before a reload. If it reports a missing certificate, finish the Certbot step or correct the paths. If the host has IPv6 disabled, remove the `listen [::]:80` and `listen [::]:443` lines first. The configuration proxies every location, keeps upstream connections alive, limits request bodies to 1 MB, sets connect/send/read timeouts, and adds HSTS only in the HTTPS server block. Access logs go to `/var/log/nginx/praxbit-access.log`; the distribution's `/etc/logrotate.d/nginx` rotates them.

### DNS

Create an `A` record for both names pointing at the host's IPv4 address. Create `AAAA` records only if the host has working IPv6. Both names must reach the same application host or load balancer; do not split them across databases.

Before cutover, lower the TTL to 300 seconds. Check from outside the host:

```bash
dig +short A praxbit.biszweb.club
dig +short AAAA praxbit.biszweb.club
dig +short A praxbit.bisz.dev
dig +short AAAA praxbit.bisz.dev
```

Remove stale `AAAA` records rather than leaving clients to time out on an address that does not work. Caddy needs both names to resolve before it can issue one certificate covering both. Nginx needs the certificate to include both names in its subject alternative names.

### TLS checks

```bash
for host in praxbit.biszweb.club praxbit.bisz.dev; do
  curl -fsS -D - -o /dev/null "https://$host/healthz"
done

openssl s_client -connect praxbit.bisz.dev:443 -servername praxbit.bisz.dev </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates -ext subjectAltName
```

The certificate must list both DNS names and must not be expired. Renewal is handled by Caddy or Certbot; confirm the timer or cron job exists. An expired certificate looks like a total outage to learners.

### Firewall

Expose only 80 and 443. Keep the Node port on loopback and keep PostgreSQL private.

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8787/tcp
sudo ufw status verbose
sudo ss -ltnp | grep -E ':(80|443|8787|5432)\b'
```

On firewalld systems:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

Also restrict the cloud provider's security group to 80 and 443. `ss` should show Hono on `127.0.0.1:8787`, not `0.0.0.0:8787` or `[::]:8787`. PostgreSQL should listen on loopback or a private network, never the public interface.

## Verify a deployment

`scripts/verify-hosting.mjs` starts nothing. It sends `--resolve`-style `Host` headers, checks both hostnames, and fails with an actionable message. The checks cover:

- `/healthz` and `/readyz`.
- `/learn`, a dotted mission ID, and a dotted project ID.
- Pyodide `.mjs` and `.wasm` MIME types.
- API 404 separation from the SPA fallback.
- CSP and security headers, with duplicate detection.
- HSTS on HTTPS and its absence over HTTP.
- The service worker.
- Third-party references in the served `index.html`.

Against a local built server:

```bash
pnpm build
COOKIE_SECURE=0 pnpm start
pnpm verify:hosting -- --base http://127.0.0.1:8787
```

On Windows PowerShell, set the override before starting:

```powershell
$env:COOKIE_SECURE = "0"
pnpm start
pnpm verify:hosting -- --base http://127.0.0.1:8787
```

`COOKIE_SECURE=0` is required for the loopback HTTP check because the script fails if HSTS is sent over HTTP. Do not use that override on the public deployment.

Against the public proxy after DNS and TLS work:

```bash
pnpm verify:hosting -- --base https://praxbit.bisz.dev
```

Both hostnames are checked by default. Override them with one or more `--host` values:

```bash
pnpm verify:hosting -- --base https://203.0.113.10 --host praxbit.bisz.dev
```

HTTPS checks validate the certificate for each `--host` name. The script exits nonzero on the first summary with any failure and prints the failing path and the likely cause.

Manual checks that still matter:

- A guest can open a mission and keep progress after refresh.
- A test account can register, sign in, start an attempt, submit evidence, sync, and load the world.
- The browser console has no content-security-policy errors for scripts, workers, Pyodide, or the sandboxed preview.
- Sign in on `praxbit.bisz.dev`, then confirm the other hostname asks for a separate sign-in. That is expected host-only cookie behavior, not a bug.

Exercise the login and sync path; do not declare success from the health check alone.

## Browser end-to-end tests

`pnpm test:e2e` builds the web and server bundles, then runs Playwright against the production Hono process and PostgreSQL. It does not use `vite preview`:

```bash
pnpm test:e2e
pnpm test:e2e:no-ai
```

`pnpm test:e2e:no-ai` clears every `AI_*` variable before building and running the suite. Both commands require a reachable `DATABASE_URL` from the process environment or the project root `.env`.

The harness drops and recreates a disposable `praxbit_e2e` schema inside that database, applies `database/migrations` with `search_path=praxbit_e2e`, then starts the server on `127.0.0.1:4173` with `NODE_ENV=test`, `COOKIE_SECURE=0`, and `TRUST_PROXY=0`. Server startup seeds the content reference tables. Never point the harness at a database where a schema named `praxbit_e2e` must survive: it is destroyed on every run. The database role needs permission to create and drop schemas.

The Playwright projects share the schema and run with one worker. Accounts, clubs, and projects are created with timestamp-based names so tests stay isolated without truncating shared tables. Use `--project=desktop` for a single-browser run, or `--grep @visual` and `--grep @a11y` for the tagged suites.

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

## Updating a deployment

Pull the new revision, install dependencies, migrate, build, and restart the process:

```bash
git pull
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
```

Restart through the supervisor:

```bash
sudo systemctl restart praxbit
# or
pm2 restart praxbit
```

Keep the previous checkout or build until the new one passes `/readyz` and a login-and-sync check.

## Rollback

Check out the previous commit or release, run `pnpm install --frozen-lockfile`, `pnpm build`, and restart the process. The database schema may not be backward-compatible; restore the backup or roll forward with a fix when it is not.

For the proxy, keep the previous `Caddyfile` or `praxbit.conf` before editing. Validate the restored file with `caddy validate` or `nginx -t`, then reload.

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

Local baseline on the development host (Windows, Node 24, local PostgreSQL, real endpoint mix): the load test passed at 20 concurrent learners (about 123 MB resident, scenario p95 11–59 ms, zero errors) and at 40 concurrent learners (about 160 MB resident, scenario p95 15–70 ms, zero errors). Re-run `node scripts/load-test.mjs` on the target host and record the result before setting capacity expectations.

## Logs

The server writes structured JSON to standard output. Use the process manager or service wrapper to retain and rotate it. Do not log request bodies, cookies, or authorization headers. Proxy access logs are configured separately and also omit those values.

## What is not automated

- No live deployment was performed in this pass. The configuration is ready, but DNS, certificates, firewall changes, and service restarts are operator actions.
- No public production host or DNS record is provisioned by this repository.
- No TLS certificate is issued by this repository.
- No Windows service, macOS launch agent, or container image is installed by this repository.
- No PostgreSQL high-availability or failover is configured.
