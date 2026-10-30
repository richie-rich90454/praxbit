# Authoring standard

This document is the contract for missions, projects, tracks, skills, placement, achievements, and club events. Content is code-reviewed data, not free-form copy.

## Repository paths

```text
content/
  skills.json
  tracks.json
  placement.json
  projects.json
  achievements.json
  campaigns/<course>/<NN>-<slug>.json
  tracks/<track>/<NN>-<slug>.json
  club-events/<name>.json
content-solutions/
  <mission-id>.json
  projects.json
```

- Campaign files live under `content/campaigns/<courseId>/`.
- Applied track files live under `content/tracks/<trackId>/`.
- The numeric filename prefix is for humans; ordering comes from the manifest `sequence`.
- Reference solutions never live under `content/`. The validator rejects solution leakage.
- Do not put executable JavaScript, remote URLs, or HTML in a mission manifest except as authored data for an interaction that expects it.

## Mission manifest

A mission is validated by `MissionSchema` in `packages/contracts/src/schemas/mission.ts`. Most objects are strict: unknown fields fail validation.

| Field | Requirement |
| --- | --- |
| `id` | `course.mission-name`, lowercase words separated by dots/hyphens |
| `version` | Positive integer; bump when the assessment or lesson meaning changes |
| `sequence` | Positive integer; unique within the course |
| `courseId` | Lowercase course id, e.g. `campus`, `python-foundations` |
| `title` | 1–140 characters, sentence case |
| `summary` | 1–600 characters |
| `skills` | 1–6 skill ids that exist in `skills.json` |
| `prerequisites` | Up to 8 skill ids; may be empty |
| `difficulty` | `beginner`, `developing`, or `advanced` |
| `estimatedMinutes` | 2–30; a realistic working estimate |
| `interaction` | The primary interaction kind (see below) |
| `runtime.kind` | Honest runtime kind |
| `runtime.capabilities` | At least one capability string |
| `scenario.world` | Must be `campus` |
| `scenario.system` | A valid world system id |
| `scenario.initialState` | 1–120 characters |
| `scenario.briefing` | 1–1200 characters, concrete situation |
| `objectives` | 1–6, each with a description and 1+ step ids |
| `assets` | 1+ references: `pip:<pose>`, `scene:campus`, `system:<id>`, `icon:<slug>` |
| `hints` | Exactly 4 mission-level hints, each 1–800 characters |
| `misconceptions` | 2–8, each with step id and corrective feedback |
| `lesson.sections` | 1–5 sections, title and body |
| `lesson.vocabulary` | 1–10 terms and definitions |
| `steps` | 1–12 |
| `evaluation.kind` | Must be `steps` |
| `evaluation.passScore` | 0.5–1 |
| `rewards.experience` | 10–500 |
| `rewards.unlocks` | Up to 5 mission ids |
| `rewards.achievement` | Optional achievement id |
| `persistence.kind` | `world-action` or `none` |
| `persistence.action` | Required when kind is `world-action`; valid action id |
| `persistence.system` | Optional valid system id |
| `accessibility` | Summary, keyboard notes, screen-reader notes; all required |
| `license` | Required string; use the original-content license line |
| `tags` | At least one interest tag |

Each step has an id, title, prompt, optional evidence category, and optional four-step hints. The step id must be lowercase words with hyphens. Keep step ids stable; evidence and solutions refer to them.

## Interaction and runtime truth

| Interaction   | What it should teach              | Typical runtime                           |
| ------------- | --------------------------------- | ----------------------------------------- |
| `lesson`      | A concept and vocabulary          | `none`                                    |
| `quiz`        | Recognition or a prediction       | `none`                                    |
| `machine`     | Input/processing/output or a rule | `guided-simulation`                       |
| `order`       | Sequence and dependencies         | `none`                                    |
| `state`       | Memory and state transitions      | `guided-simulation`                       |
| `rule`        | Conditions and policy             | `static-analysis`                         |
| `loop`        | Repetition and stopping           | `guided-simulation`                       |
| `trace`       | Execution order and values        | `guided-simulation`                       |
| `debug`       | Fault isolation and repair        | `static-analysis` or `browser-javascript` |
| `binary`      | Encoding                          | `guided-simulation`                       |
| `filesystem`  | Paths and hierarchy               | `guided-simulation`                       |
| `network`     | Routes and dependencies           | `guided-simulation`                       |
| `review`      | Evidence-based review             | `static-analysis`                         |
| `code`        | Real editing and tests            | `browser-*` or `static-analysis`          |
| `git`         | Real local Git operations         | `browser-git`                             |
| `terminal`    | Constrained Linux-like operations | `simulated-linux`                         |
| `test-design` | Choosing useful cases             | `static-analysis`                         |
| `explain`     | Explaining a rule                 | `static-analysis`                         |

Do not claim a runtime that does not exist. `browser-python` is Pyodide, not CPython on the server. `browser-sql` is SQLite, not PostgreSQL. `simulated-linux` is a simulation, not a Linux host. `static-analysis` does not execute code.

A code step for a language without an in-browser runtime uses `static-analysis` and structural tests (`static` or `regex`). The editor is plain text, the mission runtime must be `static-analysis`, and the lesson and accessibility notes must say that the source is not compiled or executed. Do not label such a step `browser-java`, `browser-rust`, or any other runtime that does not exist. Java, C, C++, C#, Go, Rust, Kotlin, Swift, Ruby, Zig, Lua, and framework source packs follow this rule. TypeScript, JavaScript, HTML, CSS, Python, SQL, and Git use their real browser runtimes.

## Step evaluation

The evaluator is chosen by step kind. The authored data must make the intended answer unambiguous.

- Quiz/debug: a `correctId` that exists in the options/fixes.
- Machine: at least `minRuns`, a prediction quiz, and a transfer quiz.
- Order/loop/network/filesystem: a correct sequence or path that matches the items.
- State/trace: a target state or final snapshot with every watched value.
- Rule: a `correctRuleId` that exists in the rules.
- Review: findings with at least one correct and one incorrect, plus a correct verdict.
- Code: 1–12 tests of a supported kind for the language. Use `function`, `dom`, `css`, or `sql` when the runtime executes the work; use `ast` for JavaScript and TypeScript structure; use `static`, `regex`, or `json` only when the work is deliberately structural.
- Git: checks that the seed repository can actually satisfy.
- Terminal: objectives whose checks match the initial simulation and a valid solution.
- Test design/explain: a correct selected set, not a single trick option.

Alternative valid solutions should be considered. If the evaluator accepts only one arrangement, the prompt must make that arrangement required. Do not author a “choose any order” task with a single exact sequence.

## Code verification modes

Every code step must say what its tests actually prove. `verification` is optional in the schema and is inferred from the test kinds when omitted:

| Mode | Meaning |
| --- | --- |
| `execution` | At least one test runs the learner's work: `function`, `dom`, `css`, or `sql`. |
| `ast` | At least one `ast` test parses JavaScript or TypeScript and inspects real syntax nodes. |
| `structural` | Only `static`, `regex`, or `json` tests run. This proves text or data shape, not behavior. |
| `simulation` | The check runs inside a guided or simulated runtime. Use only with `guided-simulation` or `simulated-linux`. |

The validator enforces these rules:

- A step whose tests are only `static`, `regex`, or `json` must declare `verification: "structural"` and must include `localVerification`.
- `localVerification` is `{ "command": "...", "description": "..." }`. The command is an honest way to verify the work outside Praxbit, such as `javac Answer.java`. The description states what the command proves. The validator does not run it.
- Do not declare `execution` unless an executable test kind is present.
- An `ast` declaration requires at least one AST test.
- JavaScript and TypeScript steps must use `function` or `ast` tests. Substring and regex tests alone are rejected because they cannot distinguish real syntax from comments and strings.
- A `structural` declaration must not include executable or AST tests.
- A `simulation` declaration must match the mission runtime.

## AST tests

An `ast` test parses a JavaScript or TypeScript file with the TypeScript compiler and counts real syntax nodes. Comments and string contents are not nodes, so a comment that says `eval(...)` does not count as an `eval` call.

| Node | Matches | `name` matches |
| --- | --- | --- |
| `function-declaration` | Function declarations, including exported declarations | The function name |
| `function-call` | Call expressions | The callee text or its final property name, such as `console.log` or `log` |
| `import` | Static import declarations | The module specifier and every imported or local binding |
| `class-declaration` | Class declarations, including exported declarations | The class name |
| `return-statement` | Return statements | Not used |
| `if-statement` | If statements | Not used |
| `for-statement` | `for`, `for...in`, and `for...of` loops | Not used |
| `variable-declaration` | Variable declarations, including destructuring bindings | Each bound identifier |

`require` needs at least one matcher. `min` defaults to 1. `forbid` is optional and fails when a matching node is present. A file that does not parse fails the test with the parser diagnostic.

```json
{
    "kind": "ast",
    "description": "Declares slugify and never calls eval.",
    "file": "answer.ts",
    "language": "typescript",
    "require": [
        { "node": "function-declaration", "name": "slugify" },
        { "node": "return-statement", "min": 1 }
    ],
    "forbid": [{ "node": "function-call", "name": "eval" }]
}
```

AST tests prove structure, not behavior. When the language has an execution runtime, pair the AST test with a `function` test that checks a real result.

## Track and mission standards

The validator enforces these minimums and reports every shortfall with the track or mission id:

| Track kind   | Minimum missions |
| ------------ | ---------------- |
| `campaign`   | 12               |
| `language`   | 5                |
| `framework`  | 4                |
| `discipline` | 5                |

- Every non-campaign track has at least one step with `evidence: "transfer"`.
- Every mission is listed in at least one track, and every track reference resolves to a mission.
- Every assessed step (every step except `lesson`) has exactly four step hints. Mission-level hints do not replace step hints.
- Every assessed step has at least one reachable misconception. A misconception is reachable when its `answer` is a wrong option id for a quiz, rule, machine, or debug step; a test description for a code step; or when it declares an explicit `diagnostic`. Interactions that do not have enumerable options, such as order, state, trace, binary, filesystem, and network, must use `diagnostic`. Code steps may also use `testDescription`. A misconception must not match the correct answer.
- Every mission has at least one misconception with `followUpSkill`, and every follow-up skill exists in `skills.json`.

## Hints and misconceptions

- Four hints per mission, escalating from observation to a concrete next action. Each hint should help the learner think, not dump the final answer.
- Every assessed step has exactly four step hints. Do not repeat a mission hint as a step hint.
- At least two misconceptions per mission. Each must name an assessed step, describe the incorrect belief, give corrective feedback, and at least one per mission must link a follow-up skill.
- An optional `answer` key matches a wrong option for quiz, rule, machine, or debug steps. For code steps, `testDescription` names the failing test. For interactions without enumerable options, `diagnostic` records a specific failure signature. Do not put a full solution in a misconception.

## Reference solutions

Every code step and every project needs a reference solution for validation.

Mission solution: `content-solutions/<mission-id>.json`

```json
{
    "steps": {
        "format-price": {
            "files": {
                "prices.py": "def format_price(cents):\n    return f\"${cents // 100}.{cents % 100:02d}\"\n"
            }
        }
    }
}
```

Project solutions: `content-solutions/projects.json`

```json
{
    "projects": {
        "projects.inventory-service": {
            "stages": {
                "availability": { "files": { "inventory.js": "…" } },
                "quote": { "files": { "inventory.js": "…" } },
                "atomic-order": { "files": { "inventory.js": "…" } }
            }
        }
    }
}
```

- Paths must be safe relative paths and must match authored files.
- A solution file must not be referenced by the learner-visible content.
- The validator runs the solution against the tests where the runtime is available. A deferred runtime check is not a pass.
- The validator also runs each mission's authored starter files. A code step with an editable starter must fail at least one executed test before the learner edits it. Steps with no editable starter are skipped. A starter that already passes every test is reported as `starter-passes-tests`.
- Optional alternatives prove that a second valid approach is accepted. Add them under the step and keep each alternative to files that differ from the reference:

```json
{
    "steps": {
        "format-price": {
            "files": { "prices.py": "…" },
            "alternatives": [{ "files": { "prices.py": "…" } }]
        }
    }
}
```

- Keep solutions out of Git history if the repository is public and the mission is meant to be a challenge? The repository currently stores them for validation. Do not ship `content-solutions/` in the web bundle or production content directory unless you intend to expose them.

## Assets and licensing

- `pip:<pose>`: one of `observing`, `explaining`, `thinking`, `alert`, `celebrating`.
- `scene:campus`: the only supported scene.
- `system:<id>`: a valid world system.
- `icon:<slug>`: a named original icon; do not use an unmodified icon-library logo.
- Use original illustrations and text. Do not copy a course, book, screenshot, or proprietary exercise.
- If you add a third-party asset, record its source, license, and attribution. The content license does not cover it.
- The mission `license` field should read `Praxbit original content, CC BY-NC-SA 4.0` for original work.
- Do not use brand names, logos, or characters in a way that implies endorsement.
- Do not include real learner data, secrets, or private URLs in content.

## Validation commands

```bash
pnpm content:validate
pnpm content:report
pnpm exec vitest run --project content
```

`pnpm content:report` prints a per-track mission count, the required minimum, transfer coverage, and every missing standard. It exits successfully even when content violates the standards, so contributors can collect the full work list. `pnpm content:validate` prints the same issues and fails on any error.

To validate a different checkout, pass its root to the CLI:

```bash
pnpm exec tsx packages/content-validator/src/cli.ts /path/to/praxbit
```

`pnpm content:validate` loads every document, checks schemas and cross-references, runs reference solutions where possible, and reports errors, warnings, executed checks, and deferred checks. Fix every error. Review warnings; do not ignore a warning that indicates a misleading claim.

The validator may defer:

- CSS computed-style and layout checks that need a real browser.
- Python checks when Pyodide cannot load in the validation environment.

A deferred check is not a pass. Verify those interactions in the browser or a real runtime.

## Review checklist

Use [review-checklist.md](review-checklist.md) before requesting review. A content pull request should include the learning objective, the evidence it produces, the runtime, the validation output, and any deferred check.
