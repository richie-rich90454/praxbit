# Praxbit

**The computer science learning game.**

Learn how computers work. Build what you imagine. Start knowing nothing. Learn to understand everything you build.

Praxbit is a local-first learning application for computer science and software engineering. It combines short interactive missions, authentic code execution in the browser, a persistent campus simulation, projects with executable checks, spaced review, and an optional local companion for real toolchains. It is not a video course with a quiz bolted on, and it is not a dashboard of generated lessons.

## Status

Praxbit is a pre-release implementation. The repository contains a working learning engine, 48 authored missions, three projects, a SolidJS web client, a Hono/PostgreSQL account platform, a browser execution layer, a deterministic world simulation, and a TypeScript companion CLI. Production hosting, native store builds, and a live AI provider require external provisioning and are not verified by this repository alone.

The honest current limits are listed in [Known limitations](#known-limitations). Do not treat a feature listed as implemented below as production-verified unless the verification column or the operations documentation says so.

## What is implemented

| Area | Current implementation | Verification |
| --- | --- | --- |
| Learning engine | Skill graph with prerequisite validation, mission state machine, deterministic step evaluators, evidence model, mastery estimator, spaced review, placement, recommendations | Portable TypeScript in `packages/domain`; unit tests |
| Curriculum | 30 launch missions (12 before-code, 18 campus) plus 18 additional track missions; three projects; one weekly club event | Schema, references, and executable reference solutions validated with zero warnings; deferred checks listed in Known limitations |
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

Copy the example and edit it. Never commit real credentials.

```bash
cp infra/env/praxbit.env.example .env.local
```

The server reads environment variables directly; it does not load `.env.local` itself. Export them in your shell or use your process manager. Required for the API:

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgres://` or `postgresql://` connection string |
| `HOST` | no | Bind address, default `127.0.0.1` |
| `PORT` | no | API port, default `8787` |
| `NODE_ENV` | no | `development`, `test`, or `production` |
| `DB_POOL_SIZE` | no | 2–4, default 3 |
| `CONTENT_DIR` | no | Directory containing `skills.json`; otherwise resolved from the repo or release |
| `PUBLIC_ORIGIN` | production | Public site origin |
| `CORS_ORIGINS` | no | Comma-separated allowed origins |
| `ADMIN_HANDLES` | no | Comma-separated lowercase handles promoted to admin at startup |
| `COOKIE_SECURE` | production | `1` behind HTTPS |
| `TRUST_PROXY` | behind proxy | `1` to trust `X-Forwarded-For`; only when a trusted proxy sets it |
| `BODY_LIMIT_BYTES` | no | 16384–2097152, default 262144 |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | no | All three enable the AI tutor gateway |
| `AI_TIMEOUT_MS` | no | 1000–60000, default 12000 |

The full operational template is `infra/env/praxbit.env.example`.

## Database

Create a dedicated database and role. Run migrations with the same `DATABASE_URL` the server will use.

```bash
createdb praxbit
DATABASE_URL=postgres://praxbit:password@127.0.0.1:5432/praxbit pnpm db:migrate
```

Roll back the last migration only when you understand its data loss:

```bash
DATABASE_URL=... pnpm db:rollback
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
```

The build produces the static web client in `apps/web/dist`, the server bundle in `apps/server/dist`, and the companion in `apps/companion/dist/main.js`. The server build is a Node bundle; do not run `tsx watch` or Vite in production.

Local production-style run:

```bash
DATABASE_URL=... NODE_ENV=production PORT=8787 node apps/server/dist/main.js
pnpm --filter @praxbit/web preview --port 4173
```

The web preview serves static files only. For API calls, put a reverse proxy in front or run the Vite dev server during development. See [docs/operations](docs/operations/deployment.md) for systemd, Caddy, Nginx, backups, and rollback.

## Test and quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration     # PostgreSQL required
pnpm test:e2e             # built web app + Playwright browsers
pnpm test:a11y            # Playwright @a11y
pnpm test:visual          # Playwright @visual
pnpm test:security
pnpm content:validate
pnpm build
```

`pnpm test` runs the unit, content, and security projects. `pnpm test:integration`, `test:e2e`, `test:a11y`, `test:visual`, and `test:security` have their own prerequisites described in `CONTRIBUTING.md`. The load test is separate:

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

Deployment is documented, not automated against a live host in this repository. The target is a single Hono process on a shared 2 vCPU / 2 GB VPS, static files through the existing Caddy or Nginx, PostgreSQL 16+, and no server-side learner compilation. Use:

- `infra/systemd/praxbit.service`
- `infra/caddy/Caddyfile.example` or `infra/nginx/praxbit.conf.example`
- `infra/scripts/deploy.sh`
- `infra/backup/backup-postgres.sh` and `restore-postgres.sh`
- [docs/operations](docs/operations/deployment.md)

No deployment has been performed against a production host from this working copy. Resource targets are budgets to measure, not measured guarantees.

## Licensing

- Source code: MIT. See [LICENSE](LICENSE).
- Original educational content under `content/`: CC BY-NC-SA 4.0. See [content/LICENSE](content/LICENSE). Commercial use of the content requires separate permission.
- Brand, logo, mascot, and artwork: all rights reserved. The source and content licenses do not grant trademark or brand rights.
- Third-party dependencies retain their own licenses. See [docs/architecture/dependencies.md](docs/architecture/dependencies.md).

This repository does not claim to have received legal review. Confirm jurisdiction-specific obligations before public distribution or commercial use.

## Known limitations

These are real constraints, not a backlog disguised as a feature list.

- **Production verification is incomplete.** The API route surface is implemented, and the PostgreSQL integration suite passed locally against a disposable cluster. Formatting, linting, type checking, unit, content, security, and browser suites also passed locally, and the production web and server bundles build. A real deployment behind a proxy, with production credentials and production data volumes, remains unverified.
- **No server-side learner code execution.** JavaScript runs in a Web Worker, HTML/CSS in sandboxed iframes, Python in Pyodide, SQL in sql.js, and Git in isomorphic-git. These are best-effort browser isolation, not a hardened multi-tenant sandbox. The server never executes arbitrary learner programs.
- **AI is optional and unverified here.** The gateway is implemented, but no live provider key is committed. Provider behavior, cost, latency, and output quality must be tested with your own account. The AI is not the authoritative grader.
- **Native applications are not shipped.** Capacitor configuration exists; Android/iOS projects, signing, store metadata, push notifications, deep-link verification, and device testing do not.
- **Curriculum breadth is limited.** There are 48 missions. Python has three, SQL three, TypeScript one, Hono one. Java, Go, Rust, and C appear as skill-graph concepts without mission tracks. Do not present those languages as fully supported.
- **Some content checks are deferred.** `pnpm content:validate` passes with zero errors and zero warnings after executing 119 checks. Ten CSS computed-style checks are deferred because jsdom cannot compute layout faithfully. The browser suite exercises the project CSS path, but not every deferred mission check; verify those in a real browser.
- **Projects are small.** Three projects exist with executable stage checks. They are not a substitute for a full project-based curriculum.
- **Club and competition flows depend on the API.** The UI and service code exist, and the PostgreSQL integration suite covers club membership and verified events. No live club-scale verification has been performed. Local results are not trusted for ranked competition.
- **Accessibility is implemented, not certified.** Semantic landmarks, keyboard paths, focus styles, reduced motion, text scaling, and screen-reader notes exist. A formal WCAG audit and assistive-technology matrix have not been completed.
- **Performance is not production-measured.** The service budgets (idle RSS 100–150 MB, active under 200 MB, pool 2–4) are targets. The load test is provided; results depend on the host and must be recorded.
- **Browser coverage is narrow.** Playwright runs Chromium. Firefox and Safari/WebKit behavior, iOS Pyodide memory limits, and low-end Android performance are not verified.
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
- [docs/product](docs/product/onboarding.md) — onboarding, navigation, progression, ethics.
- [docs/curriculum](docs/curriculum/authoring.md) — authoring and review.
