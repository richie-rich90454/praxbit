# Curriculum

Praxbit teaches computer science through short, concrete work. The curriculum is not a list of technologies to click through. Every published mission must state what the learner should understand, require evidence of that understanding, and show what the learner can do next.

## Teaching philosophy

1. **Understanding is the outcome.** XP and levels acknowledge work, but mastery is estimated from evidence. A learner can finish a mission and still have low mastery of its concept; that is useful information, not a failure.
2. **Start with the machine, not the syntax.** The first twelve missions use machines, instructions, memory, decisions, repetition, tracing, files, networks, and testing without requiring a code editor. Syntax is introduced when it explains something the learner already understands.
3. **Practice should be honest.** A hint reduces the independence weight of the evidence. Copying an answer produces a completion, not mastery. The interface says so calmly and without shame.
4. **Transfer is the strongest signal.** Recognition questions are weak evidence. Solving an unfamiliar case, debugging a plausible mistake, or explaining why a rule works are stronger.
5. **Errors are instructional.** A wrong answer should produce a specific misconception response, not a generic red cross. The learner should know what belief led them astray and what to try next.
6. **AI is a collaborator, not an authority.** AI-generated code and explanations must be reviewed with tests, evidence, and explicit acceptance. The product never treats model output as correctness.
7. **Responsibility is part of engineering.** Security, privacy, deployment, and consequence are taught as engineering decisions, not as a compliance lecture.
8. **Respect the learner's time.** A useful session can be five minutes. There are no punitive streaks, energy gates, or rewards for staying online.

## Teaching cycle

A mission moves through a small state machine:

```text
not-started -> introducing -> exploring -> attempting
                                      -> assistance
                                      -> evaluating -> feedback -> completed -> review-scheduled
```

- **Introduce** the situation and the concept in plain language.
- **Explore** the machine, artifact, repository, or code before being asked to produce an answer.
- **Attempt** the work. The attempt is recorded so the server can associate evidence with it.
- **Assist** with up to four escalating hints. Using a hint changes the evidence assistance level; it does not block completion.
- **Evaluate** deterministically. The evaluator returns a pass/fail, a score, a detail message, and an answer key for misconception matching.
- **Feedback** explains what happened and why. A correct answer still gets an explanation, because recognition is not the same as understanding.
- **Complete** once. Completion is idempotent per mission version; a retry does not award XP twice.
- **Review** is scheduled at 1, 3, 7, or 14 days depending on the review history.

Practice uses the same evaluators but selects completed missions whose skills are due or weak. It is not a separate, easier content path.

## Launch mission map

The 30 launch missions are two campaigns. Sequences 1–12 are the zero-knowledge foundation. Sequences 13–30 apply the concepts to a connected campus.

| # | Mission | Primary skills |
| --- | --- | --- |
| 1 | Make it respond | `concept.computation` |
| 2 | Give better instructions | `concept.instructions` |
| 3 | Remember this | `concept.state` |
| 4 | Make a decision | `concept.conditions`, `concept.boolean` |
| 5 | Do it again | `concept.iteration` |
| 6 | One step at a time | `concept.tracing` |
| 7 | Fix the instructions | `concept.debugging` |
| 8 | Everything is information | `concept.binary`, `concept.data` |
| 9 | Find the file | `concept.filesystems` |
| 10 | Send a message | `concept.networks` |
| 11 | Break it into parts | `concept.decomposition` |
| 12 | Can we trust the result? | `concept.testing`, `concept.responsibility`, `testing.boundaries` |
| 13 | A page with no identity | `web.html`, `web.accessibility` |
| 14 | Everything is misplaced | `web.css` |
| 15 | The button does nothing | `js.events`, `js.functions` |
| 16 | Inventory went negative | `js.conditions`, `testing.boundaries` |
| 17 | Repeating the same work | `js.loops`, `js.arrays` |
| 18 | Incorrect totals | `js.types` |
| 19 | The missing property | `js.objects`, `ts.types` |
| 20 | The mysterious exception | `js.debugging` |
| 21 | Changes nobody can find | `git.basics` |
| 22 | Two developers disagree | `git.branches` |
| 23 | The broken request | `http.basics`, `api.validation` |
| 24 | The duplicate order | `api.validation`, `concept.state` |
| 25 | The AI says it is fixed | `ai.review`, `api.validation`, `testing.boundaries` |
| 26 | A failing service | `ops.processes` |
| 27 | Permission denied | `ops.permissions` |
| 28 | The deployment is broken | `ops.deployment` |
| 29 | Nothing works together | `testing.integration`, `api.validation`, `concept.state` |
| 30 | The campus incident | `engineering.incident` |

The campus campaign changes the persistent world. Mission outcomes set recovery flags and system states that the World screen reads. A mission can be replayed, but the world action is versioned and must not be applied twice by a retry.

## Skill graph

Skills are nodes with a stable id, a name, a description, a kind, parents, and interests. Kinds are `concept`, `language`, `framework`, `engineering`, and `mathematics`.

Core concept chain:

```text
computation -> instructions -> state -> conditions -> boolean
                                |          |
                                |          +-> iteration -> tracing -> debugging -> testing -> responsibility -> ai-limits
                                +-> binary -> data
                                +-> filesystems
                                +-> networks -> security
                                +-> decomposition -> algorithms
```

Language and engineering skills attach to those concepts. For example, `js.functions` depends on `js.variables` and `concept.instructions`; `api.validation` depends on `http.basics` and `js.conditions`; `engineering.incident` depends on integration testing, AI review, and deployment.

The graph is validated for duplicate ids, missing parents, self-parents, cycles, and orphan concepts. A mission is eligible when its prerequisite skills have enough mastery or were explicitly skipped by placement. Eligibility is a threshold, not a locked linear path; a learner can choose another eligible track.

## Evidence model

Every step produces an `EvidenceSubmission`:

| Field | Meaning |
| --- | --- |
| `id` | Unique evidence id |
| `missionId`, `missionVersion` | What produced it; version mismatches are rejected |
| `category` | `prediction`, `construction`, `debugging`, `testing`, `explanation`, `transfer`, or `review` |
| `outcome` | `success` or `failure` |
| `assistance` | `independent`, `hint-1` … `hint-4` |
| `independence` | 0–1, derived from hints |
| `stepId` | The step that produced it |
| `attemptId` | Optional attempt association |
| `createdAt` | ISO timestamp |
| `detail` | Short human-readable note, not a full solution |

Category weights in the default estimator:

| Category     | Weight |
| ------------ | ------ |
| Prediction   | 0.08   |
| Construction | 0.12   |
| Debugging    | 0.16   |
| Testing      | 0.13   |
| Explanation  | 0.10   |
| Transfer     | 0.20   |
| Review       | 0.08   |

Assistance factors: independent `1.0`, hint-1 `0.8`, hint-2 `0.6`, hint-3 `0.4`, hint-4 `0.2`. The estimator uses the smaller of the assistance factor and the submitted independence value.

## Mastery heuristic

For a skill, the estimator sums weighted evidence:

```text
weight = categoryWeight * min(assistanceFactor, independence) * skillWeight
points = sum(success weights) - failurePenalty * sum(failure skillWeights)
score  = clamp01(1 - exp(-scale * max(0, points)))
```

Defaults: `scale = 1.1`, `failurePenalty = 0.02`, recent-failure window = 30 days. The result is rounded to four decimals. Labels are `learning` below 0.4, `developing` from 0.4, `confident` from 0.7, and `secure` from 0.85.

Mission skills carry full weight. Concept ancestors of a mission skill carry up to 0.25 weight, so a JavaScript lesson contributes to the underlying concept without pretending it is a full concept assessment.

### Limits of the heuristic

- It is a **heuristic estimate**, not a psychometric measurement or a credential.
- It cannot distinguish a lucky guess from understanding, or a copied answer from independent work.
- Evidence is produced by the client and accepted by the server. A determined learner can forge submissions. The server checks mission versions and attempt ownership, not the truth of the claim.
- It does not model forgetting beyond the review schedule, item difficulty, or learner fatigue.
- Category weights are authored defaults, not empirically calibrated. They should be reviewed against real learner data before being presented as precise.
- `secure` does not mean “expert”. It means the current evidence is strong for this skill in this product.
- Ranked competition requires independent verification. Local or client-submitted results are never sufficient.

Do not add an LLM as the sole judge of correctness or mastery. Deterministic evaluators and explicit rubrics remain authoritative.

## Spaced review

The review scheduler uses intervals of **1, 3, 7, and 14 days**.

- A new review starts at index 0, due in 1 day, whether the first outcome was success or failure.
- A successful review advances one interval, capped at 14 days.
- A failed review moves back one interval, floored at 1 day.
- Due reviews are sorted by due date. Missing a review does not punish the learner; it simply remains due.
- A completed mission advances reviews for its skills. A review-category evidence submission also advances them.

Practice selects due reviews first, then weak skills, then interest-aligned missions. Session lengths are short (1 mission), medium (2), and longer (4). The estimate is the sum of authored mission minutes, not a promise.

## Hints

Every mission and every step may define exactly four hints. The escalation is intentional:

1. Point at the relevant observation.
2. Name the relationship or rule.
3. Apply the rule to a near case.
4. Give the concrete next action without hiding the reasoning.

Hints are not a solution dump. Using all four is allowed; the resulting evidence is weighted at 0.2 independence. A learner can still complete the mission, but mastery reflects the assistance. The UI must not shame the learner for asking.

## Misconceptions

A mission defines at least two misconceptions. Each has an id, a description, a step id, an optional answer key, feedback, and an optional follow-up skill.

When an answer matches a known misconception, the feedback names the incorrect belief and gives a corrective experiment. When it does not match, the evaluator gives a general next step. Misconceptions are teaching material, not a hidden penalty list.

## Transfer

Transfer evidence asks the learner to apply a rule to a case that was not used in the lesson. It carries the highest category weight (0.20). The first independent transfer success earns the `achievement.first-transfer` achievement. A transfer question is not a memory test with different nouns; it must require the same underlying rule in a new surface.

## Placement

Placement is a short diagnostic, currently eight multiple-choice questions covering variables, loops, HTML, HTTP, Git, boundary testing, idempotency, and one additional concept. Correct answers record the associated skill as skipped. The recommendation thresholds are:

| Correct | Recommended start                       |
| ------- | --------------------------------------- |
| 7+      | `campus.the-mysterious-exception`       |
| 5+      | `campus.page-with-no-identity`          |
| 3+      | `before-code.everything-is-information` |
| 0+      | `before-code.make-it-respond`           |

Placement skips prerequisite checks for the skills it marks. It is advisory: the learner can still open any track. It is not a proctored exam and should not be described as one.

## Applied and advanced tracks

Beyond the 30 launch missions, the repository contains 90 missions in applied and advanced tracks. The full catalogue has 41 tracks and 120 missions.

| Domain | Tracks | Missions |
| --- | --- | --- |
| Language foundations | TypeScript (3), Python (5), Java (2), C (2), C++ (2), C# (2), Go (2), Rust (2), Kotlin (2), Swift (2), Ruby (2), Zig (2), Lua (2) | 30 |
| Frontend frameworks | React, Vue, SolidJS, Angular, Svelte (2 each) | 10 |
| Backend frameworks | Node services (3), Express, Fastify, NestJS, Spring Boot, ASP.NET Core, FastAPI, Django (2 each) | 17 |
| Build systems and data | CMake (2), Cargo (2), Database engineering (4) | 8 |
| Existing applied tracks | SQL and data (3), Algorithms (3), Security (2), AI engineering (3), DevOps (2) | 13 |
| Advanced applied tracks | Advanced algorithms (3), Systems and architecture (3), DevOps practice (2), AI practice (2), Native and offline (2) | 12 |

Runtime labels are part of the content contract:

- TypeScript uses browser transpilation and behavioral tests.
- JavaScript uses an isolated browser worker.
- HTML and CSS render in a sandboxed preview frame.
- Python runs in Pyodide WebAssembly.
- SQL runs in SQLite WebAssembly; PostgreSQL-specific behavior is taught separately and labeled.
- Git uses isomorphic-git.
- Java, C, C++, C#, Go, Rust, Kotlin, Swift, Ruby, Zig, Lua, and the framework/server packs use `static-analysis` with structural checks. The editor is plain text, and the lesson and accessibility notes say the source is not compiled or executed.
- The terminal is a deterministic Linux-like simulation.

The framework packs teach components, state, routing, data boundaries, middleware, validation, authorization, dependency injection, source layout, and deployment-facing trade-offs. The advanced tracks apply algorithms, operating-system and compiler ideas, distributed failure, DevOps diagnosis, retrieval and structured AI output, and offline/native boundaries. They are assessed foundations, not replacements for a full reference manual.

SQL missions use SQLite semantics in the browser. PostgreSQL behavior, indexes, transaction isolation, dialect differences, and Redis caching are taught as reviewed artifacts rather than executed against a PostgreSQL server.

## Depth and external limits

Be explicit with learners and contributors:

- **Depth is the remaining curriculum constraint.** Each language and framework pack is a focused two- or three-mission foundation. A learner who wants a complete language reference, a semester-length operating-systems course, or a production distributed-systems lab will need additional material. The tracks teach enough to build, test, review, and reason about real code; they do not claim exhaustive coverage.
- **Only three projects** exist: an accessible HTML status board, a JavaScript inventory service, and a SQL query lab. They have executable stage checks, but there is no large multi-session project.
- **Native store builds are not shipped.** Capacitor configuration and the offline/native curriculum exist; Android and iOS projects, signing, store metadata, push notifications, and device testing require platform build environments.
- **Club competition** has one weekly structured event. There is no season, team formation flow, or large verified competition set.
- **Language breadth is not a marketing number.** Every listed language now has a track, but a track is supported only when it has a coherent progression, assessed exercises, prerequisite relationships, content validation, and truthful runtime support. The static-analysis tracks do not pretend to execute code.

## Authoring contract

A mission manifest is valid only when it includes:

- `id` matching `course.mission-name`, a positive `version`, and a positive `sequence`.
- A `courseId`, title, summary, 1–6 skills, up to 8 prerequisites, difficulty, and estimated minutes (2–30).
- An interaction kind and a runtime kind with at least one capability. The runtime must truthfully describe what executes.
- For a language without an in-browser runtime, a code step uses `static-analysis` with `static` or `regex` tests. Do not label it with a browser runtime that does not exist.
- A campus scenario with a system, initial state, and briefing.
- 1–6 objectives with step ids, 1–12 steps, exactly four mission hints, and at least two misconceptions.
- A lesson with 1–5 sections and at least one vocabulary term.
- A deterministic evaluation (`steps`, pass score 0.5–1) and rewards.
- Persistence (`world-action` with a valid action/system, or `none`).
- Accessibility summary, keyboard notes, and screen-reader notes.
- A license string and at least one interest tag.
- A reference solution for every code step and project, stored under `content-solutions/`, never inside the learner-visible content.
- No solution text, answer keys, or hidden reference output in the mission JSON beyond the evaluator fields the schema requires.

The validator checks the schema, unique ids, skill graph integrity, prerequisite references, track membership, project stage checks, world action references, asset names, safe paths, and reference solutions where a runtime is available. CSS computed-style checks that need a real browser are reported as deferred, not as passes.

See [docs/curriculum/authoring.md](docs/curriculum/authoring.md) for the review checklist and commands.
