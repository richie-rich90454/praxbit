# Architecture decisions

These records capture durable choices. A later decision may supersede an earlier one; do not silently change a rule without recording why.

## ADR-001: pnpm workspace with strict TypeScript

**Status:** accepted

**Context:** The product needs a web client, API, shared domain, browser execution, game rendering, and a CLI without duplicating rules.

**Decision:** Use a pnpm workspace, one lockfile, a shared strict TypeScript base, and package exports that resolve to source during development. Build outputs are bundled per app.

**Consequences:** Shared rules stay in `packages/domain`. Dependency versions are reproducible with `--frozen-lockfile`. Strict settings catch nullable and index errors early. Contributors must use pnpm, not npm or Yarn.

## ADR-002: SolidJS and Vite for the web client

**Status:** accepted

**Context:** The interface needs fine-grained updates, a small opening bundle, and a static deployable build.

**Decision:** Use SolidJS with `@solidjs/router` and Vite. Use plain CSS with custom properties rather than a utility framework. Load PixiJS, Pyodide, and heavy editors only when needed.

**Consequences:** The app builds to static files and works behind Caddy or Nginx. The team must maintain its own component styles and design tokens. There is no server-side rendering requirement.

## ADR-003: One Hono Node.js process

**Status:** accepted

**Context:** The target host has 2 vCPUs, 2 GB RAM, and other services. The product is initially club-scale.

**Decision:** Run one Hono process under Node.js. Use PostgreSQL 16+ as the only required stateful service. Do not add Redis, Kafka, Kubernetes, a Docker daemon requirement, a second JVM, a persistent compiler service, or a local LLM.

**Consequences:** The process must stay lightweight and must not run learner code. Rate limits are in-process. Scaling out requires a shared rate-limit store and a review of session and job assumptions.

## ADR-004: PostgreSQL authoritative, IndexedDB local-first

**Status:** accepted

**Context:** Learners need immediate feedback and progress that survives refresh, but accounts need durable cross-device state.

**Decision:** Use Dexie/IndexedDB for local progress, drafts, world, projects, attempts, completions, and an outbox. Use PostgreSQL for accounts, sessions, evidence, progress, worlds, projects, clubs, and audit. The client applies mutations locally and syncs through a bounded operation batch.

**Consequences:** The server is authoritative for signed-in state. Conflicts are possible and must be surfaced. Guest data is local-only. There is no CRDT merge.

## ADR-005: Versioned zod contracts

**Status:** accepted

**Context:** Web, server, and companion must agree on content and API shapes.

**Decision:** Define schemas in `packages/contracts`. Parse at boundaries. Change the contract before changing implementations. Keep API versioning under `/api/v1`.

**Consequences:** Invalid content or responses fail early. Both sides must update together. A breaking API change requires a new version or a compatibility plan.

## ADR-006: Browser execution only; no server-side learner code

**Status:** accepted

**Context:** Running arbitrary learner code on the shared VPS would be unsafe and resource-intensive.

**Decision:** Execute JavaScript in a worker, HTML/CSS in a sandboxed iframe, Python in Pyodide, SQL in SQLite WASM, and Git in an in-browser repository. Use a deterministic terminal simulator for Linux exercises. Do not run learner code in the Hono process. Do not treat `node:vm` as a sandbox.

**Consequences:** Some toolchains cannot run in the browser. The companion covers local real toolchains with consent. Remote execution requires separate isolated infrastructure, which is not deployed.

## ADR-007: Deterministic world with optimistic concurrency

**Status:** accepted

**Context:** The campus must change coherently and survive retries across devices.

**Decision:** Model the world as a pure state and action function. Version every state. Require `expectedVersion` on writes. Store one world per user. Log the last 100 actions.

**Consequences:** The simulation is explainable and testable. Concurrent writes conflict instead of silently overwriting. The world is not a live background simulation.

## ADR-008: Opaque sessions, CSRF double submit, bearer for native

**Status:** accepted

**Context:** Browser and native clients need authentication without a separate identity provider.

**Decision:** Use opaque random session tokens, store only a SHA-256 hash, set an `HttpOnly` `SameSite=Lax` cookie for the browser, and require a double-submit CSRF token on cookie mutations. Native clients request a bearer token with a client header and store it in secure native storage.

**Consequences:** No JWT signing key is required. Session revocation is immediate because the database is checked. There is no email verification or recovery. A compromised token is valid until revoked or expired.

## ADR-009: Content as validated JSON, solutions separate

**Status:** accepted

**Context:** Curriculum must be reviewable, testable, and safe to bundle.

**Decision:** Author missions and projects as JSON validated by zod. Keep reference solutions in `content-solutions/`, outside learner-visible content. Use a content validator that runs reference checks where a runtime is available.

**Consequences:** Content changes are code-reviewed data changes. A mission cannot ship without a valid schema and reference solution for code steps. CSS checks that need a real browser are deferred and must be verified separately.

## ADR-010: Plain CSS design tokens, Noto, 5px radius

**Status:** accepted

**Context:** The product must have a specific, non-generic visual identity and avoid template aesthetics.

**Decision:** Use CSS custom properties for the palette, spacing, type, and radius. Use Noto Sans and Noto Sans Mono. Use 4px spacing, exactly 5px ordinary radius, no shadows or gradients, and the prohibited-pattern list in `DESIGN.md`.

**Consequences:** Design review is concrete. A utility framework is not required. Contributors must not introduce a second visual language for a feature.

## ADR-011: Private AI gateway, not an authoritative grader

**Status:** accepted

**Context:** AI can help learners, but provider keys must not reach the browser and model output is unreliable.

**Decision:** Proxy AI hints through the Hono server. Keep keys server-side. Require opt-in, a per-user quota, a timeout, bounded context, and a privacy notice. Never use the model as the sole judge of correctness or mastery.

**Consequences:** AI is optional and can be disabled. Provider failures do not block learning. Cost and privacy depend on the configured provider. There is no offline AI.

## ADR-012: Companion results are untrusted

**Status:** accepted

**Context:** A local CLI can run real toolchains but cannot prove what happened on the machine.

**Decision:** The companion detects tools, writes confined starter files, runs approved local tests after consent, and exports results with `trustedForRankedCompetition: false`. Ranked competition requires independent server verification.

**Consequences:** Local results are useful for learning and diagnostics, not for leaderboard integrity. The companion never downloads or runs remote scripts. It cannot attest a score.

## ADR-013: Split licensing

**Status:** accepted

**Context:** Source code and educational content have different reuse expectations and brand risk.

**Decision:** License source code under MIT. License original educational content under CC BY-NC-SA 4.0. Reserve brand, logo, mascot, and artwork rights. Keep third-party licenses separate.

**Consequences:** Commercial reuse of the content requires permission. The code can be reused under MIT. Trademark and endorsement rights are not granted. This is not legal advice; legal review is pending.

## Open decisions

These are not settled and must not be presented as implemented:

- Email verification, password reset, and account recovery.
- Age gating and parental consent for child accounts.
- A public club directory, chat, or direct messaging.
- Native packaging and app-store distribution.
- A verified remote execution service for ranked competitions.
- A production AI provider, cost budget, and content moderation policy.
- Commercial hosting, pricing, and data retention periods.
- A monitored security contact and formal incident-response ownership.
- Legal review of licensing, trademarks, and child privacy.
