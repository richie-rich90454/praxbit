# Praxbit

**The computer science learning game.**

Learn how computers work. Build what you imagine. Start knowing nothing. Learn to understand everything you build.

Praxbit is a local-first learning application for computer science and software engineering. It combines short interactive missions, authentic code execution in the browser, a persistent campus simulation, projects with executable checks, spaced review, and an optional local companion for real toolchains. It is not a video course with a quiz bolted on, and it is not a dashboard of generated lessons.

## Status

Praxbit is a pre-release implementation. The repository contains a working learning engine, 225 authored missions across 44 tracks, three projects, a SolidJS web client, a Hono/PostgreSQL account platform, a browser execution layer, a deterministic world simulation, and a TypeScript companion CLI. Production hosting, native store builds, and a live AI provider require external provisioning and are not verified by this repository alone.

The honest current limits are listed in [Known limitations](#known-limitations). Do not treat a feature listed as implemented below as production-verified unless the verification column or the operations documentation says so.

## What is implemented

| Area | Current implementation | Verification |
| --- | --- | --- |
| Learning engine | Skill graph with prerequisite validation, mission state machine, deterministic step evaluators, evidence model, mastery estimator, spaced review, placement, recommendations | Portable TypeScript in `packages/domain`; unit tests |
| Curriculum | 30 launch missions (12 before-code, 18 campus) plus 195 applied and advanced track missions across 44 tracks; three projects; one weekly club event | Schema, references, AST checks, negative starters, and executable reference solutions validated with zero errors |
| Web client | SolidJS screens for Learn, World, Practice, Projects, Club, Settings, Placement, and mission play | Typecheck and Playwright suites when the database and API are running |
| Code execution | Browser JavaScript worker, sandboxed HTML/CSS preview, Pyodide Python, SQLite via sql.js, isomorphic-git, deterministic Linux/terminal simulation, static analysis | Implemented as browser adapters; not a server-side security boundary |
| World | Deterministic campus state with nine systems, versioned actions, recovery flags, PixiJS rendering plus an accessible system list | Domain tests and browser rendering |
| Accounts and sync | Hono service layer, PostgreSQL migrations, opaque session tokens, CSRF, idempotent sync operations, world version conflicts, export and deletion | Integration tests require PostgreSQL 16+ |
| Offline | IndexedDB persistence through Dexie, queued sync outbox, local guest progress, conflict reporting | Implemented; multi-device behavior requires a running server |
| PWA | Vite PWA manifest and service worker, installable shell | Build output; not store-published |
| Companion | `praxbit doctor`, `open`, `test`, `export`; local path confinement and consent | Typecheck, build, unit tests, and manual `doctor`/`open`/`test` runs |
| AI tutor | Optional server-side OpenAI-compatible gateway with quotas, preference gate, timeout, and bounded context | Requires an external provider key; not verified against a live provider here |
| Clubs | Club UI, service and repository code, invite codes, weekly event submissions, and leaderboard | Implemented; integration coverage requires PostgreSQL; no live club-scale verification |

## Architecture at a glance

```text
apps/web (SolidJS, Vite, PWA, Capacitor config)
  ├── packages/domain       skill graph, missions, mastery, review, world, progression
  ├── packages/contracts    zod schemas for content, evidence, world, API
  ├── packages/client      Dexie persistence, sync outbox, API client, capabilities
  ├── packages/execution   browser workers, WASM runtimes, simulated terminal
  └── packages/game        PixiJS campus rendering

apps/server (Hono on Node.js)
  ├── packages/contracts    request/response contracts
  ├── packages/domain       shared learning and simulation rules
  └── PostgreSQL 16+        accounts, sessions, evidence, progress, worlds, projects, clubs

apps/companion (Node.js CLI)
  ├── packages/contracts    content and API schemas
  └── fixed local toolchains, with consent and path confinement
```

Dependency rules and component responsibilities are in [docs/architecture](docs/architecture/overview.md).

## Prerequisites

- Node.js **22.12 or newer** (this working copy was checked on Node 24.13; CI is configured for Node 22 and 24).
- pnpm matching the `packageManager` field (`pnpm@12.14.0`). Corepack is the simplest way to get it.
- PostgreSQL **16 or newer** for accounts, integration tests, and the server.
- A modern browser with WebAssembly, Web Workers, IndexedDB, and service worker support for the full web experience.
- Optional local toolchains for the companion: Python, Java, Go, Rust, .NET, GCC/G++.

The web client can run without PostgreSQL for content-only screens. Accounts, sync, clubs, and server-side AI hints require the API.

## Install

```bash
corepack enable
pnpm install --frozen-lockfile
```

If you are changing dependencies intentionally, use `pnpm install` and commit the updated `pnpm-lock.yaml`. Do not use `npm install` or `yarn`.

## Environment

The deployment method is a direct clone of this repository with one `.env` file in the project root. For a public deployment, copy the production template:

```bash
# macOS or Linux
cp .env.production.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.production.example .env
```

For direct local HTTP development, copy `.env.example` and set `COOKIE_SECURE=0`, `TRUST_PROXY=0`, and `PUBLIC_ORIGIN=http://localhost:8787`. Edit `.env` and set at least `DATABASE_URL`. The server reads this file automatically at startup, and `pnpm db:migrate` reads it through the same loader. Shell variables take precedence over `.env`.

The server reads environment variables directly; it does not use a separate deployment directory. Required for the API:

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgres://` or `postgresql://` connection string |
| `HOST` | no | Bind address, default `127.0.0.1`; use `0.0.0.0` only for direct access without a proxy |
| `PORT` | no | HTTP port, default `8787` |
| `NODE_ENV` | no | `development`, `test`, or `production` |
| `DB_POOL_SIZE` | no | 2–4, default 3 |
| `CONTENT_DIR` | no | Directory containing `skills.json`; otherwise resolved from the repository |
| `WEB_DIST` | no | Built web directory; otherwise `apps/web/dist` |
| `PUBLIC_ORIGIN` | production | Primary canonical origin for absolute links, for example `https://praxbit.bisz.dev`; it does not restrict incoming `Host` names |
| `CORS_ORIGINS` | no | Comma-separated allowed origins; leave empty for same-origin deployment |
| `ADMIN_HANDLES` | no | Comma-separated lowercase handles promoted to admin at startup |
| `COOKIE_SECURE` | production | `1` behind HTTPS; `0` for direct HTTP development |
| `TRUST_PROXY` | behind proxy | `1` to trust `X-Forwarded-For`; only when a trusted proxy sets it |
| `BODY_LIMIT_BYTES` | no | 16384–2097152, default 1048576 |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | no | All three enable the AI tutor gateway |
| `AI_TIMEOUT_MS` | no | 1000–60000, default 12000 |

`PRAXBIT_ENV_FILE` can point at a different environment file when a process manager requires it. The default is `.env` in the project root.

The production template is `.env.production.example`. `.env.example` is the base template for local development.

## Database

Create a dedicated database and role. Then edit `DATABASE_URL` in the project-root `.env` and run migrations. The migration command reads `.env` automatically.

```bash
createdb praxbit
pnpm db:migrate
```

Roll back the last migration only when you understand its data loss:

```bash
pnpm db:rollback
```

For tests, use a separate database. Do not point integration tests at production.

```bash
createdb praxbit_test
DATABASE_URL=postgres://praxbit:password@127.0.0.1:5432/praxbit_test pnpm db:migrate
DATABASE_URL=postgres://praxbit:password@127.0.0.1:5432/praxbit_test pnpm test:integration
```

The server seeds achievement and club-event reference rows at startup. There is no general-purpose demo-data seeder. Accounts are created through the registration endpoint or the Settings screen. Test fixtures live in the test suites, not in a production seed script.

## Development

```bash
pnpm dev
```

This runs the Vite dev server on `http://127.0.0.1:5173` and the Hono API on `http://127.0.0.1:8787`. Vite proxies `/api` to the API. Start PostgreSQL and run migrations first if you need accounts or sync.

Useful focused commands:

```bash
pnpm dev:web
pnpm dev:server
pnpm --filter @praxbit/companion start -- doctor
```

## Build and run

```bash
pnpm build
pnpm start
```

Open `http://localhost:8787`. The Hono process serves both the API and the built web application, including the service worker and the single-page fallback. Only one process is required on Windows, macOS, or Linux. If the build output is missing, `pnpm start` builds it first.

The build produces the static web client in `apps/web/dist`, the server bundle in `apps/server/dist`, and the companion in `apps/companion/dist/main.js`. The server build is a Node bundle; do not run `tsx watch` or Vite in production.

For a fresh clone, the cross-platform bootstrap runs install, migration, and build:

```bash
pnpm bootstrap
pnpm start
```

`pnpm bootstrap --skip-install` skips dependency installation, and `--skip-build` skips the build. Neither flag skips migrations. See [docs/operations](docs/operations/deployment.md) for Windows, macOS, Linux, process management, Caddy, Nginx, backups, and rollback.

## Test and quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration     # PostgreSQL required
pnpm test:e2e             # builds, migrates a disposable schema, and runs all browsers
pnpm test:e2e:no-ai       # same suite with AI environment variables removed
pnpm test:a11y            # Playwright @a11y
pnpm test:wcag            # Playwright @wcag22
pnpm test:wcag:report     # per-criterion WCAG evidence table
pnpm test:visual          # Playwright @visual
pnpm test:security
pnpm content:validate
pnpm content:report
pnpm verify:hosting -- --base http://127.0.0.1:8787
pnpm build
```

`pnpm test` runs the unit, content, and security projects. `pnpm test:integration`, `test:e2e`, `test:a11y`, `test:wcag`, `test:visual`, and `test:security` have their own prerequisites described in `CONTRIBUTING.md`. The load test is separate:

```bash
pnpm --filter @praxbit/server start   # with PostgreSQL and env set
pnpm test:perf --url http://127.0.0.1:8787 --duration 20
```

It tests 20 and 40 concurrent learners by default, reports p50/p95/error rate, and probes duplicate mission submissions and competing world updates only when `PRAXBIT_LOAD_TOKEN` is set. It never invents results for endpoints it cannot reach.

## Content validation

```bash
pnpm content:validate
```

The validator loads every mission, project, track, skill, placement question, achievement, and club event; checks schemas, unique ids, prerequisites, asset references, evaluator requirements, and safe paths; and runs reference solutions where a runtime is available. CSS computed-style checks that cannot be faithfully evaluated outside a browser are reported as deferred, not as passes. See [docs/curriculum/authoring.md](docs/curriculum/authoring.md).

## PWA and Capacitor

The web app is installable as a PWA. `apps/web/vite.config.ts` configures the manifest and service worker; `apps/web/capacitor.config.ts` configures the native shell. No Android or iOS platform directories are committed, and no store signing or device verification has been performed.

```bash
pnpm --filter @praxbit/web build
pnpm cap:sync
```

`cap:sync` requires an existing Capacitor platform. Add one with the Capacitor CLI if you are intentionally building a native client. Do not claim a store build from a synced web directory alone. Offline API behavior, deep links, and native secure storage still need device testing.

## Local companion

The companion is optional. It detects installed toolchains, exports starter files, runs approved local tests after explicit consent, and wraps the result with toolchain versions. It is not a remote execution service and cannot attest ranked competition results.

```bash
pnpm --filter @praxbit/companion typecheck
pnpm --filter @praxbit/companion build
node apps/companion/dist/main.js doctor
node apps/companion/dist/main.js open campus.page-with-no-identity --dir ./work/campus-page
node apps/companion/dist/main.js test ./work/campus-page
node apps/companion/dist/main.js export ./work/campus-page/report.json --dir ./work/results
```

The companion writes only inside the chosen `--dir`, rejects absolute paths and `..` escapes, refuses existing symlinks at the destination, requires console consent unless `--yes` is passed, and runs only a fixed set of local toolchain commands. See [apps/companion/README.md](apps/companion/README.md).

## Deployment

The supported deployment is a direct clone of this repository, one project-root `.env`, and one Node.js process. It works on Windows, macOS, and Linux. PostgreSQL 16+ must be installed separately and reachable through `DATABASE_URL`.

```bash
git clone <repository-url> praxbit
cd praxbit
cp .env.production.example .env
# Edit DATABASE_URL. Keep HOST=127.0.0.1, COOKIE_SECURE=1, and TRUST_PROXY=1
# when Caddy or Nginx terminates TLS for both hostnames.
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm start
```

On Windows PowerShell, create the environment file with `Copy-Item .env.production.example .env`. Use `pnpm bootstrap` to run install, migration, and build in one step.

Both `https://praxbit.biszweb.club` and `https://praxbit.bisz.dev` serve the same application behind Caddy or Nginx. `PUBLIC_ORIGIN=https://praxbit.bisz.dev` is the primary canonical origin for absolute links; it does not restrict incoming `Host` names. Cookies are host-only, so sessions do not cross the two hostnames. Do not describe them as shared sessions.

The server binds `HOST` and `PORT` from `.env` and serves the web build from `apps/web/dist`. For direct HTTP development, use `HOST=0.0.0.0`, `COOKIE_SECURE=0`, and `TRUST_PROXY=0`. For public HTTPS, keep the process on `127.0.0.1:8787` and let the proxy handle TLS.

Proxy, process-management, and backup files are provided for operators:

- `infra/caddy/Caddyfile` and `infra/caddy/Caddyfile.example`
- `infra/nginx/praxbit.conf` and `infra/nginx/praxbit.conf.example`
- `infra/systemd/praxbit.service`
- `infra/pm2/ecosystem.config.cjs`
- `infra/backup/backup-postgres.sh` and `restore-postgres.sh`

Validate a running deployment. The script starts nothing; it checks both hostnames, health and readiness, SPA routes with dotted IDs, Pyodide MIME types, API 404 separation, CSP and security headers, HSTS on HTTPS, the service worker, and third-party references:

```bash
pnpm verify:hosting -- --base http://127.0.0.1:8787
pnpm verify:hosting -- --base https://praxbit.bisz.dev
```

See [docs/operations/deployment.md](docs/operations/deployment.md) for exact Caddy and Nginx validation commands, DNS `A`/`AAAA` expectations, TLS checks, firewall rules, systemd and PM2 operation, and rollback.

All browser assets are served from the application origin. Fonts, Pyodide, sql.js, and Git runtimes are bundled into the build; the app makes no CDN requests. An optional AI tutor calls the provider configured in `.env` only when a signed-in learner enables it.

No live deployment has been performed against a public production host from this working copy. The configuration is ready for an operator to apply; DNS, certificates, firewall changes, and service restarts are not automated here. Resource targets are budgets to measure, not measured guarantees.

## Licensing

- Source code: MIT. See [LICENSE](LICENSE).
- Original educational content under `content/`: CC BY-NC-SA 4.0. See [content/LICENSE](content/LICENSE). Commercial use of the content requires separate permission.
- Brand, logo, mascot, and artwork: all rights reserved. The source and content licenses do not grant trademark or brand rights.
- Third-party dependencies retain their own licenses. See [docs/architecture/dependencies.md](docs/architecture/dependencies.md).

This repository does not claim to have received legal review. Confirm jurisdiction-specific obligations before public distribution or commercial use.

## Known limitations

These are real constraints, not a backlog disguised as a feature list.

- **Production verification is incomplete.** The PostgreSQL integration suite, a direct-clone deployment smoke test, and the full-stack browser suite pass locally, including `pnpm start`, dotted SPA routes, the API, Pyodide MIME types, authenticated sync, projects, clubs, and account deletion. Multi-host Caddy and Nginx configurations for `praxbit.biszweb.club` and `praxbit.bisz.dev` are included and locally verified with Host headers. A public host with live DNS, TLS, production credentials, real traffic, and real data volumes has not been provisioned from this working copy.
- **No server-side learner code execution.** JavaScript runs in a Web Worker, HTML/CSS in sandboxed iframes, Python in Pyodide, SQL in sql.js, and Git in isomorphic-git. These are best-effort browser isolation, not a hardened multi-tenant sandbox. The server never executes arbitrary learner programs.
- **AI is optional.** The gateway is covered by a PostgreSQL integration test against a local OpenAI-compatible mock, including success, malformed upstream responses, and the disabled-preference boundary. No live provider key is committed, so provider-specific behavior, cost, latency, and output quality must be tested with your own account. The AI is not the authoritative grader.
- **Native store builds are not shipped.** The installable PWA, Capacitor configuration, secure credential fallback, deep-link handler, local notification scheduler, and platform capability adapters exist. Android/iOS project generation, signing, store metadata, and device testing require Android Studio/Xcode and store accounts.
- **Curriculum depth is assessed, not exhaustive.** Every language and framework named in the plan now has a five- or four-mission progression with a transfer step, and HTML, CSS, and JavaScript have dedicated tracks. Java, C, C++, C#, Go, Rust, Kotlin, Swift, Ruby, Zig, Lua, and the framework/server packs use AST, structural, and companion-verified local toolchain checks rather than browser execution. They are assessed foundations, not complete reference manuals. TypeScript, JavaScript, HTML, CSS, Python through Pyodide, SQL through SQLite, and Git use their real runtimes. The interface labels each runtime truthfully, and structural checks declare a local verification command.
- **Twenty-one CSS checks run in the browser, not the Node validator.** `pnpm content:validate` passes with zero errors after executing 796 checks. The remaining 21 computed-style checks are deferred because jsdom cannot compute cascade and layout faithfully; `tests/browser/css-checks.spec.ts` executes all of them against real rendered pages in Chromium, Firefox, and WebKit, so a deferred check is never treated as a pass and none is left unverified.
- **Projects are small.** Three projects exist with executable stage checks. They are not a substitute for a full project-based curriculum.
- **Club and competition flows depend on the API.** The UI and service code exist, and the PostgreSQL integration suite covers club membership and verified events. No live club-scale verification has been performed. Local results are not trusted for ranked competition.
- **Accessibility has an internal WCAG 2.2 AA audit, not third-party certification.** Automated axe checks cover every primary route, the project workspace, mission briefing and completion, keyboard focus, landmarks, heading order, zoom, reflow, text spacing, target size, forced colors, and reduced motion in Chromium, Firefox, and WebKit. The per-criterion audit is in [docs/product/wcag-2.2-aa-audit.md](docs/product/wcag-2.2-aa-audit.md). A vendor screen-reader matrix and formal certification remain external.
- **Performance is measured locally, not on production hardware.** On the Windows development host (Node 24, local PostgreSQL), the real-endpoint load test passed at 20 and 40 concurrent learners with zero errors. At 20 concurrent learners the process used about 123 MB resident; at 40 it used about 160 MB, under the documented 200 MB active budget. Scenario p95 ranged from 11–59 ms at 20 and 15–70 ms at 40. Treat these as local baselines, not capacity guarantees; measure your host alongside existing services.
- **Browser coverage has limits.** Functional, runtime, offline, full-stack, accessibility, WCAG, and visual suites run in Chromium, Firefox, and WebKit across desktop, tablet, and mobile viewports. Pixel regression covers the three Chromium viewport projects with Windows and Linux baselines; Firefox and WebKit are verified functionally and through axe, not through per-engine screenshot baselines. iOS Pyodide memory limits and low-end Android performance are not verified.
- **No email, password reset, OAuth, or parental-consent flow.** Accounts use handles and passwords. There is no email verification or recovery channel. Do not collect personal information from children without the required safeguards.
- **No public chat or direct messaging.** Clubs use invite codes and structured weekly events. Moderation tooling is foundational, not a complete trust-and-safety system.

## Documentation map

- [ENGINEERING.md](ENGINEERING.md) — code rules, boundaries, error handling, quality gate.
- [DESIGN.md](DESIGN.md) — palette, type, spacing, radius, motion, accessibility.
- [CURRICULUM.md](CURRICULUM.md) — teaching model, skill graph, evidence, mastery, review.
- [SECURITY.md](SECURITY.md) — trust boundaries, auth, untrusted code, AI, privacy.
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, review, checks, content authoring.
- [docs/architecture](docs/architecture/overview.md) — components, execution, world, sync, decisions.
- [docs/api](docs/api/README.md) — versioned API reference.
- [docs/operations](docs/operations/deployment.md) — deployment, backups, monitoring, incidents.
- [docs/product](docs/product/onboarding.md) — onboarding, navigation, progression, ethics, and accessibility.
- [WCAG 2.2 AA internal audit](docs/product/wcag-2.2-aa-audit.md) — per-criterion evidence and external boundaries.
- [docs/curriculum](docs/curriculum/authoring.md) — authoring and review.
