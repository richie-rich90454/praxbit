# Architecture overview

Praxbit is a pnpm monorepo with a SolidJS web client, a Hono API, portable TypeScript domain packages, a local companion CLI, authored JSON content, and PostgreSQL persistence.

## Component relationships

```text
                         content/  content-solutions/
                             |             |
                             v             v
  apps/web  ----------> packages/contracts <---------- apps/server
     |                        ^   ^                       |
     |                        |   |                       |
     +--> packages/domain ----+   +---- packages/domain <-+
     |         ^
     +--> packages/client ----+
     +--> packages/execution -+
     +--> packages/game ------+

  apps/companion ----> packages/contracts
                  ----> packages/domain (only for shared rules)
```

- `packages/contracts` is the shared vocabulary. It contains zod schemas and inferred types for content, evidence, world state, and the HTTP API. It has no I/O and no business rules.
- `packages/domain` contains the learning engine and deterministic world rules. It depends only on `packages/contracts` and runs in Node, the browser, and a native shell.
- `packages/client` contains browser persistence, the sync outbox, the HTTP client, and platform capability detection. It depends on contracts and domain.
- `packages/execution` contains the browser execution adapters and their interfaces. It depends on contracts; it does not import the web app or the server.
- `packages/game` contains the PixiJS campus renderer. It depends on contracts and domain for state types and health calculations.
- `apps/web` composes the packages into screens. It does not own learning rules; it calls domain functions.
- `apps/server` composes contracts and domain into HTTP services and PostgreSQL repositories. It does not import the web app, browser runtimes, or Dexie.
- `apps/companion` is a separate local process. It reads content manifests, writes confined starter files, runs approved local tests after consent, and exports untrusted results. It does not call the production API in the current implementation.
- `content/` is authored JSON. `content-solutions/` is reference material used by validation and must never be shipped to learners.

## Dependency rules

```text
apps/web       -> contracts, domain, client, execution, game
apps/server    -> contracts, domain
apps/companion -> contracts, domain
packages/*     -> never apps/*
contracts      -> zod
domain         -> contracts
client         -> contracts, domain
execution      -> contracts
game           -> contracts, domain
```

Hard rules:

- No package imports from `apps/`.
- No server dependency (`hono`, `pg`, Node filesystem, Node crypto) in `packages/domain`.
- No browser dependency (`solid-js`, Dexie, PixiJS, DOM globals) in `packages/domain`.
- No duplicated mastery, evaluation, review, progression, or world rules in the web client or server. Both call the domain.
- No deep relative import into another package's `src` internals. Use the package export map.
- Contracts change first; implementations follow. A response shape change requires a versioned contract update, client update, server update, and tests.

## Runtime relationships

```text
Browser
  SolidJS screen
    -> domain evaluator (feedback, local evidence draft)
    -> execution adapter (worker / iframe / WASM)
    -> IndexedDB (draft, progress, outbox)
    -> ApiClient (CSRF for cookie auth, bearer for native)
       -> /api/v1
          -> Hono middleware (request id, security headers, auth, CSRF, rate limit)
             -> route -> service -> repository -> PostgreSQL

Server startup
  -> load environment configuration
  -> create PostgreSQL pool (2–4 connections)
  -> load and validate content catalog
  -> seed achievement and club-event reference rows
  -> promote configured admin handles
  -> serve HTTP
```

The server is one Node.js process. PostgreSQL is the only required service. There is no Redis, Kafka, Kubernetes, Docker daemon requirement, second JVM, persistent compiler service, or local model inference.

## Data ownership

| State | Authoritative copy | Local copy | Conflict rule |
| --- | --- | --- | --- |
| Progress, mastery, reviews | PostgreSQL when signed in | IndexedDB | Server snapshot wins on sync; local outbox retains rejected operations |
| Guest progress | IndexedDB | Same | Local only until account migration |
| World | PostgreSQL when signed in | IndexedDB | `expectedVersion`; stale action is a conflict |
| Projects | PostgreSQL revisions when signed in | IndexedDB | `baseRevision`; stale revision is a conflict |
| Mission completion | PostgreSQL when signed in | IndexedDB completions | Unique per user, mission, version; duplicate returns existing |
| Drafts | IndexedDB | Same | Device-local; not a verified artifact |
| Content | Repository JSON | Bundled into web build; loaded by server | Validated at build/startup |

The client may show optimistic state, but it must not present a local mutation as server-verified. The sync result is the authority for signed-in state.

## Failure model

- The web app must keep working for cached content when the API is unavailable.
- Writes queue in IndexedDB and retry; a rejection remains visible with its last error.
- A world or project conflict is a normal result, not a crash. The client refreshes and explains what changed.
- The API validates configuration at startup and fails closed if required values are missing or invalid.
- Database failures return a structured error; the process does not exit on a single query failure.
- AI provider failures are isolated from learning and grading. The hint endpoint returns an error; the mission still works.
- The companion never claims remote verification. Local toolchain failure is reported, not converted into success.

## Related documents

- [Monorepo layout](monorepo.md)
- [Learning engine](learning-engine.md)
- [Execution adapters](execution.md)
- [World simulation](world.md)
- [Synchronization protocol](sync.md)
- [Offline-first behavior](offline-first.md)
- [Decisions](decisions.md)
- [Third-party dependencies](dependencies.md)
