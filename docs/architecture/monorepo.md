# Monorepo layout

The workspace is defined by `pnpm-workspace.yaml` with `apps/*` and `packages/*`. The repository uses a single lockfile and a shared strict TypeScript base.

```text
apps/
  web/          SolidJS + Vite client, PWA, Capacitor configuration
  server/       Hono API, services, repositories, PostgreSQL access
  companion/    Local TypeScript CLI
packages/
  contracts/    zod schemas and shared API/content types
  domain/       Portable skill graph, missions, mastery, review, world, progression
  client/       IndexedDB, sync outbox, API client, platform capabilities
  execution/    Worker, iframe, WASM, Git, and simulated execution adapters
  game/         PixiJS campus renderer
  content-validator/  Content loading, validation, and reference-solution checks
content/        Authored missions, tracks, projects, skills, placement, achievements, events
content-solutions/  Reference solutions; never bundled into the learner app
database/       node-pg-migrate migrations
tests/          Unit, content, integration, security, browser tests
docs/           Architecture, API, operations, product, curriculum
infra/          systemd, proxy, backup, deploy, environment templates
scripts/        Build and load-test entry points
```

## Applications

### `apps/web`

- Entry: `src/index.tsx`; router and shell: `src/app/`.
- Screens: `src/features/{learning,missions,practice,world,projects,clubs,settings}`.
- Content loading: `src/content/index.ts` uses Vite `import.meta.glob` to bundle mission JSON, then parses it with contracts. A bad manifest fails the build at module load.
- Local persistence and sync: `src/platform/services.ts` constructs `PraxbitDatabase`, `ApiClient`, and `SyncManager`.
- Execution: `src/platform/` for Pyodide and Git; `packages/execution` for JavaScript, HTML/CSS, SQL, and simulated terminal.
- Rendering: `src/design/` for the logo, Pip, and design primitives; `packages/game` for PixiJS.
- PWA/Capacitor: `vite.config.ts`, `capacitor.config.ts`, `public/icon.svg`.

The web app must remain usable as static files. It must not require a Node server to render a cached lesson.

### `apps/server`

- `src/config.ts` validates environment configuration.
- `src/http/` contains middleware, error mapping, validation helpers, and rate limiting.
- `src/routes/` mounts HTTP routes.
- `src/services/` contains application orchestration (auth, evidence, completion, world, projects, clubs, AI, account).
- `src/repositories/` contains parameterized SQL and row mapping.
- `src/content/` loads the catalog, seeds reference rows, and maps runtime labels.
- `src/db/` owns the pool and transaction helper.
- `src/security/` owns password hashing and token helpers.

The server build is bundled to `dist/main.js`. Production runs that file with Node; it does not run `tsx`, Vite, or a TypeScript watcher.

### `apps/companion`

- `src/cli.ts` parses commands and options.
- `src/commands/` implements `doctor`, `open`, `test`, and `export`.
- `src/project/` loads content and detects project types.
- `src/security/` implements path confinement, consent, and the fixed command allowlist.
- `scripts/build-companion.mjs` bundles to `dist/main.js` with a Node shebang.

The companion is not part of the web request path. It must not be used to claim server-verified scores.

## Packages

### `packages/contracts`

Exports the content schemas (`MissionSchema`, `ProjectSchema`, `SkillSchema`, `TrackSchema`, `PlacementDocumentSchema`, `AchievementsDocumentSchema`, `ClubEventSchema`), evidence and progress schemas, world schemas, and the API request/response schemas in `src/api/index.ts`.

Do not put database queries, HTTP handlers, or domain decisions here.

### `packages/domain`

Exports:

- `SkillGraph` with O(1) skill lookup, ancestor traversal, eligibility checks, cycle validation, and topological order.
- `MissionStateMachine` with explicit phases and transitions.
- Step evaluators for all interaction kinds.
- Evidence drafting and misconception matching.
- `MasteryEstimator` and `ReviewScheduler`.
- Placement grading and mission recommendation.
- Progression levels and achievement rules.
- Deterministic world state and actions.

This package is the shared source of truth. If a rule changes, change it here and update both callers.

### `packages/client`

Exports the Dexie database schema, local progress/preferences/world/draft/project/attempt/outbox tables, the API client, the sync manager, and platform capability detection.

The sync manager is deliberately small: queue an operation, flush a bounded batch, apply the server snapshot, remove accepted rows, retain conflicts with their error. It does not invent merge rules.

### `packages/execution`

Defines `CodeRunner`, `ExecutionRequest`, `ExecutionResult`, `RuntimeCapability`, and `RUNTIME_CAPABILITIES`. Concrete adapters live under `browser/`, `wasm/`, and `simulated/`. The execution layer does not know about user accounts, persistence, or HTTP.

### `packages/game`

Provides the PixiJS campus renderer and animation helpers. It receives world state and a selection callback. The accessible list lives in the web screen, not in the canvas.

### `packages/content-validator`

Loads all content, checks schemas and cross-references, runs reference solutions where possible, and reports errors, warnings, executed checks, and deferred checks. It is a build/quality tool, not a runtime dependency of the web app.

## Build order

`pnpm build` builds the web client, then the server, then the companion. The web build bundles the domain, contracts, client, execution, game, and content. The server build bundles contracts and domain but reads `content/` at startup. The companion build bundles contracts and the small amount of domain it uses.

## Configuration boundaries

- Web: `VITE_*` variables only, and none are currently required. Never put a server key in a Vite variable.
- Server: environment variables parsed by `apps/server/src/config.ts`.
- Companion: CLI options and a small number of environment variables (`PRAXBIT_LOAD_TOKEN` is for the load script, not the companion).
- Content: `CONTENT_DIR` for the server; Vite globs for the web.

## Generated and ignored files

`node_modules/`, `dist/`, coverage, Playwright reports, test results, and local environment files are not source. Do not edit generated output. `pnpm-lock.yaml` is source and must stay frozen in CI.
