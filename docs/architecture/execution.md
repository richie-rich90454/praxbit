# Execution adapters

Praxbit executes learner work in the browser or in an explicitly simulated environment. It never executes learner code in the production Hono process.

## Interface

`packages/execution/src/interfaces` defines:

```ts
interface ExecutionRequest {
    readonly language: string;
    readonly runtimeId: string;
    readonly sourceFiles: Readonly<Record<string, string>>;
    readonly stdin?: string;
    readonly timeoutMs: number;
    readonly maximumOutputBytes: number;
}

interface ExecutionResult {
    readonly status: ExecutionStatus; // exact values: packages/execution/src/interfaces/index.ts
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly diagnostics: readonly ExecutionDiagnostic[];
}

interface CodeRunner {
    supports(request: ExecutionRequest): boolean;
    execute(request: ExecutionRequest, signal: AbortSignal): Promise<ExecutionResult>;
    dispose(): Promise<void>;
}
```

The exact status strings are defined in `packages/execution/src/interfaces/index.ts`; use the contract rather than re-typing them from this page.

`RUNTIME_CAPABILITIES` provides operator- and learner-facing labels. A runtime declares whether it is real execution, simulation, static analysis, structural analysis, guided prediction, local toolchain, or remote isolated. Do not label a simulation as real execution.

## Adapters

| Runtime id | Kind | What actually happens | Limits and caveats |
| --- | --- | --- | --- |
| `browser-javascript` | Real execution | Learner source runs in a dedicated Web Worker; tests call named functions and compare canonicalized results | 4 s default timeout, 20 KB output cap, worker terminated. Network APIs are patched to throw. Not a security boundary |
| `browser-html` | Real execution | HTML and CSS render in an iframe with `sandbox="allow-scripts"`; DOM and computed-style checks run in the frame | 5 s default timeout; opaque origin; no `allow-same-origin` |
| `browser-css` | Real execution | CSS is applied in the same sandbox and computed styles are checked | Same iframe caveats |
| `browser-typescript` | Real execution / transpilation | TypeScript is transpiled in the browser and behavioral tests run | Syntax diagnostics only; full type checking is a companion/local-toolchain concern |
| `browser-python` | Real execution | Pyodide WebAssembly loads on demand and runs Python in a worker | First load downloads and caches the runtime; 30 s outer timeout; network helpers are not blocked in the worker |
| `browser-sql` | Real execution | SQL runs against SQLite compiled to WebAssembly via `sql.js` | SQLite semantics, not PostgreSQL. No server database |
| `browser-git` | Real execution | `isomorphic-git` with an in-browser filesystem; commits, branches, and merges are real inside that repository | Local repository only; no automatic remote fetch |
| `simulated-linux` | Simulation | A constrained filesystem, service, process, and symlink model interprets a fixed command vocabulary | It is not Linux and does not run commands |
| `static-analysis` | Static analysis | Structure, patterns, and configuration checks without execution | Cannot prove runtime behavior |
| `guided-simulation` | Guided prediction | Interactive state or ordering simulation for toolchains that cannot run safely in the browser | Learner-facing label must say simulated |

The web app chooses an adapter based on the mission step and language. `run-checks.ts` dispatches JavaScript, HTML/CSS, SQL, and Python tests and converts outcomes into a `StepResponse`.

## JavaScript worker

`javascript.worker.ts`:

- Receives source, tests, and an output limit.
- Replaces `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, and `navigator.sendBeacon` with throwing functions.
- Captures `console.log`, `console.error`, and the like into bounded stdout/stderr.
- Evaluates the source, resolves each named function, calls it with the authored arguments, and compares a canonical JSON representation.
- Reports a timeout as a failed outcome, not a pass.

The worker is same-origin. It is best-effort isolation for a learning exercise, not a hardened multi-tenant sandbox. Do not put long-lived secrets in web storage, and do not describe this as safe execution of hostile code.

## HTML/CSS iframe

`buildPreviewDocument` creates a complete document with the learner's HTML and CSS plus a small harness. The frame uses `sandbox="allow-scripts"` only. The harness checks selectors, text, counts, attributes, and computed styles inside the frame and posts a result to the parent. The parent terminates the check on timeout.

Do not add `allow-same-origin`, `allow-forms`, `allow-popups`, or `allow-top-navigation`. The opaque origin is the main protection for the app's cookies and DOM.

## Python

Pyodide is loaded from `/pyodide/` on demand. The Vite build copies the Pyodide distribution; the service worker excludes that directory from precache to avoid a giant install. A worker keeps the runtime alive for the session and executes each test by loading the learner source and calling the named function.

The outer runner enforces a 30-second timeout and terminates the worker. Python network access is not explicitly blocked in the current worker. The browser origin policy and the absence of server secrets limit the impact, but this is not a claim of isolation. Treat Python exercises as trusted local learning code, not as an adversarial sandbox.

## SQL

`sql.js` loads a WebAssembly SQLite build. The runner:

- Creates an in-memory database.
- Applies the authored schema and seed SQL.
- Executes the learner query.
- Compares rows exactly where the test asks for exact rows, or runs a verification query.
- Returns a diagnostic for a SQL error.

SQLite and PostgreSQL differ in types, functions, constraints, and concurrency. Missions that teach PostgreSQL-specific behavior must not use the SQLite runtime without saying so.

## Git

`apps/web/src/platform/git-runner.ts` builds an in-memory repository with `@isomorphic-git/lightning-fs`. Seed commits and branches come from the mission. The runner supports a small command vocabulary (`status`, `log`, `branch`, `checkout`, `add`, `commit`, `merge`, `diff`, `show`, `reset`, `stash`, and similar). It checks branch, file content, log messages, and merge commits.

The repository is real but local to the browser tab. There is no remote, no credentials, and no server-side Git execution.

## Simulated terminal

`packages/execution/src/simulated/terminal.ts` models:

- Current directory and a flat file list with modes.
- Running or failed services with logs.
- Symlinks.
- Processes.
- A transcript.

Commands operate only on that model. Checks verify service state, file modes, symlinks, and command output. The UI must label the terminal as a simulation. It must not imply that the learner operated a real Linux host, changed real permissions, or restarted a real service.

## Local companion

The companion is the only path to real local toolchains, and it is opt-in:

- It detects installed runtimes with fixed version commands.
- It writes starter files only inside the chosen directory, after consent.
- It runs only a fixed set of project test commands, after showing the exact commands and receiving consent.
- It bounds output and time.
- It writes results with `trustedForRankedCompetition: false`.

The companion cannot prove that the learner did the work. It is not an attestation service.

## Adding a runtime

1. Add a `RuntimeCapability` with an honest kind, offline flag, and description.
2. Implement `CodeRunner` or a focused function with explicit timeout and output limits.
3. Add a contract runtime kind if the content schema needs it.
4. Update runtime labels in the web app and server.
5. Add positive, negative, timeout, and output-limit tests.
6. Document the isolation boundary and what the runtime cannot do.
7. Do not add a server-side execution path on the shared VPS.
