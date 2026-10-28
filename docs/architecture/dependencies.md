# Third-party dependencies

The MIT license in the repository root applies to Praxbit's source code. It does not relicense third-party packages, fonts, or assets. Each dependency keeps its own license.

This table lists the main direct dependencies and the license commonly declared by the upstream project. Verify the exact version's metadata before distribution; a transitive dependency can differ.

| Dependency | Role | Upstream license |
| --- | --- | --- |
| `solid-js`, `@solidjs/router` | Web UI and routing | MIT |
| `vite`, `vite-plugin-solid`, `vite-plugin-pwa` | Web build and PWA | MIT |
| `hono`, `@hono/node-server`, `@hono/zod-validator` | API framework and Node adapter | MIT |
| `zod` | Runtime schemas | MIT |
| `pg` | PostgreSQL client | MIT |
| `node-pg-migrate` | Database migrations | MIT |
| `dexie` | IndexedDB wrapper | Apache-2.0 |
| `pixi.js` | Campus rendering | MIT |
| `pyodide` | Python WebAssembly runtime | MPL-2.0 |
| `sql.js` | SQLite WebAssembly | MIT |
| `isomorphic-git`, `@isomorphic-git/lightning-fs` | Browser Git | MIT |
| `@codemirror/*` | Code editor | MIT |
| `@xterm/xterm`, `@xterm/addon-fit` | Terminal UI | MIT |
| `@capacitor/*` | Native shell | MIT |
| `@fontsource/noto-sans`, `@fontsource/noto-sans-mono` | Fonts | SIL Open Font License 1.1 |
| `typescript` | Type checker | Apache-2.0 |
| `tsx`, `esbuild` | Development and bundling | MIT |
| `vitest` | Unit and integration tests | MIT |
| `@playwright/test` | Browser tests | Apache-2.0 |
| `fast-check` | Property-based tests | MIT |
| `oxlint`, `oxfmt` | Lint and format | MIT |

## Check the lockfile

The authoritative list is generated from the installed tree:

```bash
pnpm licenses list
pnpm licenses list --prod
```

Review the output for:

- Copyleft licenses that impose obligations on distribution.
- Packages with no license field.
- Packages whose license changed between versions.
- Assets bundled into the web build that are not covered by the source license.

The Python runtime (Pyodide) and SQLite build are distributed inside the web build. Their licenses and notices must remain with the distribution. Font files are distributed under the SIL Open Font License; keep the license notice.

## Services

| Service                 | License or terms                                 |
| ----------------------- | ------------------------------------------------ |
| PostgreSQL              | PostgreSQL License                               |
| Caddy                   | Apache-2.0                                       |
| Nginx                   | BSD-2-Clause                                     |
| An external AI provider | The provider's terms, not an open-source license |

A hosted AI provider receives learner question text and optional code. Its terms and data-retention policy apply to that request. Do not enable a provider without reviewing its terms.

## Content and assets

- Original educational content under `content/` is CC BY-NC-SA 4.0. See `content/LICENSE`.
- Brand, logo, Pip, and artwork are all rights reserved.
- Do not add an image, icon set, audio clip, or course text unless its license permits this use and the attribution is recorded.
- Do not use an icon library's unmodified logo as the product logo.

## Not legal advice

This inventory is an engineering aid, not a legal opinion. The project has not completed legal review. Before public distribution, commercial use, or app-store submission, verify the licenses, notices, attribution requirements, and trademark position with qualified counsel.
