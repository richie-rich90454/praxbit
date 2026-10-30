# Contributing

Thank you for improving Praxbit. This project is a learning product, not a demo. Contributions must preserve correctness, accessibility, privacy, and the ability to operate on a small shared server.

## Before you start

- Read [ENGINEERING.md](ENGINEERING.md), [DESIGN.md](DESIGN.md), [SECURITY.md](SECURITY.md), and [CURRICULUM.md](CURRICULUM.md) for the area you are changing.
- Search existing issues and pull requests before starting a large change.
- For a new mission, project, or track, open an issue with the learning objective, target skills, interaction, runtime, and assessment plan first. A mission without a validated objective is not ready to author.
- Do not commit credentials, provider keys, production database URLs, session tokens, or learner data. Use the project-root `.env.example` and keep the real `.env` untracked.
- Do not edit another package's public contract to make a local build pass. Fix the source and regenerate the dependent output.
- Do not change the product name, palette, fonts, navigation model, or licensing without an explicit decision recorded in `docs/architecture/decisions.md`.

## Setup

Prerequisites: Node.js 22.12+, pnpm from the `packageManager` field, and PostgreSQL 16+ if you need accounts or integration tests.

```bash
corepack enable
pnpm install --frozen-lockfile
```

Create a development database, copy `.env.example` to `.env`, and run migrations:

```bash
createdb praxbit_dev
cp .env.example .env
# Set DATABASE_URL in .env.
pnpm db:migrate
```

Start the app:

```bash
pnpm dev
```

The web client is at `http://127.0.0.1:5173`; the API is at `http://127.0.0.1:8787`. Vite proxies `/api` to the API.

## Branches and commits

- Branch from `main`. Use a short descriptive name: `fix/world-version-conflict`, `content/sql-join-review`, `docs/operations-backup`.
- Keep commits focused. One logical change per commit is better than a large mixed commit.
- Write an imperative subject under about 72 characters: `Add world version conflict test`, not `Added stuff`.
- Explain why in the body when the reason is not obvious. Reference the issue or decision record.
- Do not force-push a shared branch. Do not rewrite history that others have based work on.
- Do not commit generated build output, `dist/`, `node_modules/`, Playwright reports, test results, or local environment files.
- The primary agent or maintainer handles the final commit and push. Contributors should leave the worktree ready for review.

## Pull request expectations

A pull request is ready for review only when:

- The user-facing behavior is implemented, not mocked or hidden behind a button with no effect.
- The relevant empty, loading, error, offline, and keyboard states work.
- Formatting, lint, typecheck, tests, content validation, and build pass.
- New behavior has a test at the appropriate level.
- Architectural boundaries are preserved.
- Input is validated at the trust boundary.
- Server authorization is checked, not assumed from the client.
- Accessibility and reduced motion were reviewed.
- Performance is appropriate for the 2 vCPU / 2 GB target.
- Documentation is updated for changed commands, environment variables, APIs, limits, or behavior.
- No placeholder, TODO, or fake completeness is presented as finished.

Include in the pull request:

1. What changed and why.
2. How you verified it, with exact commands and results.
3. Screenshots for visual changes at desktop, tablet, and mobile sizes.
4. Any known limitation, external provisioning requirement, or unverified path.
5. The tests you did not run and why.

Do not write “tested” without naming the command. Do not claim a production integration was verified without external infrastructure.

## Mandatory checks

Run the checks relevant to your change. The full gate is:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm exec vitest run --project content
pnpm content:validate
pnpm build
```

Additional gates:

```bash
DATABASE_URL=postgres://localhost/praxbit_test pnpm db:migrate
DATABASE_URL=postgres://localhost/praxbit_test pnpm test:integration
pnpm test:security
pnpm test:e2e
pnpm test:e2e:no-ai
pnpm test:a11y
pnpm test:wcag
pnpm test:visual
pnpm content:report
pnpm verify:hosting -- --base http://127.0.0.1:8787
```

`test:e2e` creates a disposable `praxbit_e2e` schema in the database from `DATABASE_URL`, migrates it, and starts the production server on `127.0.0.1:4173`. It requires PostgreSQL and installed Playwright browsers:

```bash
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

If a check fails for a reason unrelated to your change, say so in the pull request with the exact failure. Do not disable the check, skip the test, or lower the threshold to get green.

## Code review

Reviewers check:

- **Correctness:** Does the change do what it claims? Are edge cases handled? Is the failure mode safe?
- **Boundaries:** Is the logic in the right package? Does the domain stay portable? Did a browser or server dependency leak?
- **Types:** Is `unknown` narrowed? Is there an unsafe cast, non-null assertion, or suppression?
- **Functions:** Are callbacks named? Are arrow functions avoided? Is the class or function small enough to read?
- **Errors:** Are errors specific and useful? Is a failed write retried safely? Is local data preserved?
- **Security:** Is authorization checked? Is input validated? Are secrets absent? Is learner code isolated?
- **Accessibility:** Are semantics, labels, focus, keyboard, contrast, and reduced motion correct?
- **Design:** Does it follow the palette, type, 4px spacing, 5px radius, and prohibited-pattern rules?
- **Tests:** Do they assert behavior, not implementation details? Is the failure case covered?
- **Honesty:** Is anything incomplete described as complete?

Review comments should be specific and actionable. If a suggestion is optional, say so. Do not approve a change with a known security, data-loss, or accessibility defect because the demo “looks fine”.

## Content authoring

Mission, project, track, skill, achievement, placement, and club-event changes are product changes. Follow [docs/curriculum/authoring.md](docs/curriculum/authoring.md).

Minimum content review:

- The learning objective is explicit and observable.
- The interaction teaches that objective; the evaluator tests it.
- Hints escalate without dumping the answer.
- At least two misconceptions have specific corrective feedback.
- Transfer is checked with a new case, not a renamed example.
- Alternative valid solutions are considered where the interaction allows them.
- Runtime claims are true: a simulated terminal is not Linux, SQLite is not PostgreSQL, and browser transpilation is not full type checking.
- Reference solutions exist under `content-solutions/` and are not present in learner-visible content.
- The mission passes `pnpm content:validate` and the content test project.
- Accessibility notes are accurate for the actual interaction.
- The content license line is present and correct.

Do not copy external course text, exercises, images, or code without a compatible license and attribution. Original content is CC BY-NC-SA 4.0; third-party assets need their own documented license.

Run:

```bash
pnpm content:tracks
pnpm content:sequences
pnpm content:validate
pnpm content:report
pnpm exec vitest run --project content
```

`content:tracks` rebuilds `content/tracks.json` from the mission directories. `content:sequences` normalizes track course ids and global sequence order. Run both after adding or moving a mission. The validator reports deferred checks separately. A deferred CSS computed-style check is not a pass; verify it in a real browser.

## Accessibility review

For every changed screen:

- Tab through the page from the skip link. Every control is reachable; focus is visible.
- Operate the primary flow with the keyboard only.
- Check headings: one `h1`, no skipped levels, useful section labels.
- Check form labels and error associations.
- Check status announcements. Do not announce every change.
- Check contrast for text and controls.
- Zoom to 200% and use the largest in-app text scale.
- Enable reduced motion and confirm no essential content depends on animation.
- Check the mobile viewport at 390×844 and a narrow 320px viewport.
- Check the accessible alternative for the world map, terminal, ordering, and code results.
- Run axe through `pnpm test:a11y` when the page has a browser test.

## Visual review

- Build and capture desktop (1440×1000), tablet (834×1112), and mobile (390×844).
- Review the actual images, not just the diff percentage.
- Confirm no gradient, shadow, glass, glow, left accent bar, all-caps heading, decorative pill, or middle-dot decoration.
- Confirm Noto Sans and Noto Sans Mono, 4px spacing rhythm, and 5px radius.
- Confirm loading, empty, error, offline, and long-content states.
- Update committed visual baselines only when the change is intentional. Explain the change in the pull request.

## Database changes

- Add a new migration; do not edit a migration that has shipped.
- Test both forward migration and rollback on a scratch database.
- Add indexes for new query patterns and verify with `EXPLAIN` when the table is non-trivial.
- Do not run destructive migrations automatically in the deploy script. Migrations are an explicit operational step with a backup.
- Add integration coverage for constraints, cascades, idempotency, and authorization.

## Documentation changes

- Update the README when setup, commands, environment variables, or limitations change.
- Update `docs/api` when a route, schema, status code, or auth requirement changes.
- Update `docs/operations` when deployment, backup, monitoring, or incident behavior changes.
- Mark unverified external provisioning explicitly. Do not turn a planned integration into a past-tense claim.
- Keep American English spelling: color, behavior, organize, recognize, initialize, license, center, labeled, modeling, canceled, analyze, authorize, prioritize, serialize, normalize, summarize, synchronize, parameterize, practice, artifact, defense, catalog.

## Licensing of contributions

By contributing source code, you agree it may be distributed under the MIT license in [LICENSE](LICENSE). By contributing original educational content under `content/`, you agree it may be distributed under CC BY-NC-SA 4.0 as described in [content/LICENSE](content/LICENSE). Do not contribute material you do not have the right to license. Brand and artwork rights remain with the project owner; a code contribution does not grant permission to use the Praxbit name or logo.

## Questions and disagreement

If a rule blocks a legitimate change, explain the constraint and propose a specific amendment. Do not silently violate a rule because it is inconvenient. Record durable architectural decisions in `docs/architecture/decisions.md` so the next contributor does not have to rediscover the reasoning.
