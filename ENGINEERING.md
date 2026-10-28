# Engineering rules

These rules are mandatory for authored application code. They exist to keep a small learning engine predictable as the product grows, and to make the server safe to operate on a shared VPS.

## TypeScript

- Strict mode is always on. `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, and `verbatimModuleSyntax`. Do not weaken these settings per package.
- No `any`. Use `unknown` at boundaries and narrow it. Use a schema or a type guard before reading a field.
- No non-null assertions (`!`) to silence the compiler. Prove the value is present with a branch, a guard, or a schema.
- No `as` casts that change a value's meaning. Narrowing from `unknown` after a runtime check is acceptable. Casting a database row to a domain object is not.
- No `@ts-ignore`, `@ts-expect-error`, or eslint-disable comments for type safety unless the suppression is proven necessary and explained in one line.
- Prefer `readonly` fields and `readonly` arrays on interfaces that cross a module boundary.
- Use discriminated unions for interaction, evidence, runtime, and sync variants. Exhaustive switches should end with a `never` check or a deliberate error.
- Imports include the `.ts` extension inside packages, matching the existing source. Package exports resolve to source during development and are bundled for production.

## Functions, not lambdas

This codebase deliberately avoids arrow functions and anonymous lambdas in authored source.

```ts
// Correct: named function expression, readable stack, explicit return type.
items.map(function toLabel(item: Item): string {
    return item.label;
});

// Incorrect: arrow function and anonymous callback.
items.map((item) => item.label);
```

- Use `function` declarations for module functions and `function name(...)` expressions for callbacks.
- Give every callback a name that says what it does: `function isDue`, `function bySequence`.
- Do not use `const handler = () => {}`, inline `() => {}`, or `array.map(x => x.id)`.
- Classes are acceptable for stateful services and domain objects. Prefer composition over inheritance. The domain classes (`MasteryEstimator`, `ReviewScheduler`, `SkillGraph`, `MissionStateMachine`) are examples: constructor-injected configuration, no base classes.
- Keep classes small and single-purpose. A service that talks to PostgreSQL should not also validate HTTP bodies or render UI.
- Do not add a class where a pure function is enough.

This is not a style preference. Explicit functions produce usable stack traces, keep diffs reviewable, and match the Java-like organization requested by the product specification.

## Formatting and linting

- Oxfmt with the repository config: four spaces, double quotes, semicolons, 100-column print width, trailing commas.
- Oxlint plus type-aware ESLint. Fix the cause; do not disable a rule for a whole file.
- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` must pass before review.
- Imports are grouped and ordered by the configured import plugin. Do not hand-sort only part of a file.

## Dependency boundaries

```text
apps/web       -> packages/contracts, packages/domain, packages/client,
                  packages/execution, packages/game
apps/server    -> packages/contracts, packages/domain
apps/companion -> packages/contracts, packages/domain (only when needed)
packages/*     -> never import from apps/*
packages/domain      -> packages/contracts only
packages/contracts   -> zod only
packages/execution   -> packages/contracts only
packages/game        -> packages/contracts, packages/domain
packages/client      -> packages/contracts, packages/domain
```

Rules:

- `packages/domain` contains portable rules and must not import Hono, SolidJS, Dexie, PixiJS, `pg`, Node filesystem APIs, or browser globals. It must run in Node, a browser worker, and a native shell.
- `packages/contracts` contains schemas and inferred types only. It must not contain business rules or I/O.
- `apps/server` may not import `apps/web` or any browser package. Do not put browser-specific logic on the server.
- `apps/web` may not import `pg`, server repositories, or server configuration.
- Cross-package communication uses exported functions, interfaces, and schemas, not deep relative paths into another package's internals.
- Do not duplicate the mastery, review, progression, evaluation, or world rules in the frontend, server, or companion. Import the domain implementation.
- New dependencies require a concrete requirement. Do not add a utility library for a function that fits in a few lines.

## Error handling

- Validate at trust boundaries: HTTP bodies and query strings with zod, content files with schemas, environment configuration with explicit parsing, and database rows with narrow mappers.
- Inside the domain, throw a specific error when an invariant is broken. Do not return a fake success value.
- On the server, convert expected failures to `AppError` with a stable machine code, an HTTP status, a human message, and optional details. Every error response includes a request id.
- Do not catch an error and continue as if nothing happened. If recovery is intentional, say what was recovered and why.
- Do not use exceptions for ordinary control flow. A completed mission is a result, not an exception.
- Client API errors are `ApiError` with status, code, request id, and details. UI code shows a useful message and keeps local state safe.
- Sync conflicts are results (`conflict`, `rejected`, `duplicate`), not thrown away. Queue failures remain in the outbox with an attempt count and the last error.
- Log operational events as structured JSON. Do not log secrets, session tokens, passwords, full learner code, or AI provider keys. Do not log a request body by default.
- A `catch` block must either recover, rethrow with context, or record a deliberate decision. Empty catches are allowed only for a secondary failure such as a rollback attempt that must not hide the original error.

## Idempotency and concurrency

- Every mutating sync operation carries a client-generated `operationId`, unique per user. The server stores the result and returns `duplicate` on replay.
- Mission completion is unique per user, mission, and mission version. A retry must not award experience twice.
- World actions carry `expectedVersion`. A stale write returns `409 world_version_conflict` with the current version; the client must refresh rather than overwrite.
- Project revisions carry `baseRevision`. A mismatch is a conflict with the current revision.
- Database mutations that touch multiple tables run in a transaction. Use `withTransaction`; do not manage `BEGIN`/`COMMIT` in route handlers.
- Prefer database constraints for uniqueness and range checks. Application checks alone are not enough under concurrency.
- Do not hold a transaction open across an external network call such as an AI request, file download, or email.

## Performance philosophy

Priority order:

1. Correctness.
2. Readability.
3. Maintainability.
4. Appropriate algorithmic complexity.
5. Low CPU use.
6. Low memory use.
7. Throughput.
8. Latency.
9. Efficient network use.
10. Efficient database access.

- Do not introduce micro-optimizations without a measurement. Record the measurement and the before/after.
- Keep the opening page light. Load CodeMirror, PixiJS, Pyodide, and other heavy runtimes only when a screen needs them. The existing dynamic import of `@praxbit/game` on the World screen is the pattern.
- Use the server for accounts, synchronization, clubs, verified results, persistence, and the optional AI gateway. Use the client for rendering, local simulation, practice selection, skill lookup, editing, browser execution, local persistence, and review scheduling.
- Use one Node.js process initially. Do not add Redis, Kafka, Kubernetes, a Docker daemon requirement, a second JVM, a persistent compiler service, or a local LLM without measured justification and an explicit architecture decision.
- Database pool size is 2–4. Queries are indexed and bounded. Use pagination on lists. Avoid N+1 queries.
- The server must not execute arbitrary learner code. CPU-heavy work belongs in a browser worker or a separately isolated runner, not in the request process.
- Measure before claiming a target: Node RSS, heap, CPU, event-loop delay, request p50/p95, query latency, connection use, browser frame time, lesson load time, execution duration, and AI latency/cost. Use `scripts/load-test.mjs` for HTTP load and record the host conditions.

## Testing

- Unit tests cover domain invariants and pure functions.
- Content tests validate mission manifests and reference solutions.
- Integration tests use PostgreSQL 16 and a dedicated test database.
- Browser tests cover real user flows in Chromium at desktop, tablet, and mobile sizes.
- Accessibility tests use axe plus manual keyboard checks.
- Visual tests use committed screenshots and a small diff threshold.
- Security tests cover authorization, CSRF, path handling, replay, and resource limits.
- Property-based tests are appropriate for the mastery estimator, review scheduler, and world invariants.
- A test that does not assert behavior is not a test. A script that prints success without running the check is forbidden.

## Pull request completion gate

A change is complete only when all of the following are true:

- The user-facing behavior works, including the empty, loading, error, offline, and keyboard states that apply.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and the relevant tests pass.
- `pnpm build` passes when the change affects a build output.
- Architectural boundaries are preserved; no app imports leak into packages.
- Runtime input is validated at the boundary.
- Authorization is checked on the server for every protected resource.
- Security boundaries are respected; no secret or token is exposed to the client or learner code.
- Accessibility has been considered and the change does not remove focus visibility, labels, or reduced-motion behavior.
- Performance is appropriate for the 2 vCPU / 2 GB target.
- Documentation is updated when behavior, commands, environment variables, or limits change.
- No placeholder, mock, or empty handler is presented as complete.

## Repository layout

```text
apps/web            SolidJS client, PWA, Capacitor configuration
apps/server         Hono API, PostgreSQL repositories and migrations
apps/companion      Local TypeScript CLI
packages/contracts  zod schemas and shared API types
packages/domain     Portable learning, mastery, review, world rules
packages/client     IndexedDB persistence, sync, API client, capabilities
packages/execution  Browser and simulated execution adapters
packages/game       PixiJS campus renderer
content             Authored missions, tracks, projects, skills, events
database            node-pg-migrate migrations
docs                Architecture, API, operations, product, curriculum
infra               systemd, proxy, backup, deploy templates
scripts             Build and load-test entry points
tests               Unit, content, integration, security, browser suites
```

Do not edit generated output, lockfiles by hand, or another package's public contract to make a local build pass. Fix the source and regenerate.
