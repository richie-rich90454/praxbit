# Learning engine

The learning engine is portable TypeScript in `packages/domain`. It has no framework, database, or browser dependency. The web app uses it for immediate feedback and local state; the server uses it for authoritative mastery, review, and world updates.

## Components

```text
content JSON
  -> contracts schemas
  -> ContentCatalog (skills, tracks, missions, projects, placement, achievements, events)
  -> SkillGraph + MissionStateMachine + evaluateStep
  -> EvidenceSubmission
  -> MasteryEstimator + ReviewScheduler
  -> Progress + recommendations + achievements
```

### Skill graph

`SkillGraph` indexes skills by id in a `Map`. Lookup is average O(1). Prerequisite checks walk the direct parents, O(d). Validation walks every node and edge, O(V + E), and detects duplicates, self-parents, missing parents, and cycles. `topologicalOrder` is available for authoring and diagnostics.

A mission is eligible when every prerequisite skill has mastery at or above 0.6, or the skill was skipped by placement. The recommendation engine does not require a strict linear path.

### Mission state machine

`MissionStateMachine` enforces the phases:

```text
not-started -> introducing -> exploring -> attempting
                                      -> assistance
                                      -> evaluating -> feedback -> completed -> review-scheduled
```

Illegal transitions throw `MissionTransitionError`. Completion can be recorded once per attempt; the state machine refuses a second `complete`. `replay` moves a completed or review-scheduled mission back to attempting.

### Evaluation

`evaluateStep` is a pure function over a closed union of step kinds and responses. It returns a pass/fail, a 0–1 score, a detail message, and an answer key for misconception matching. It does not call the network and does not ask an LLM.

Evaluation families:

| Interaction                  | Evaluation                                         |
| ---------------------------- | -------------------------------------------------- |
| Lesson                       | Acknowledgment                                     |
| Quiz, debug                  | Exact option                                       |
| Machine                      | Enough runs, prediction, and transfer              |
| Order, loop, binary, network | Ordered structure                                  |
| State, trace                 | Target state                                       |
| Rule                         | Correct rule                                       |
| Filesystem                   | Exact path                                         |
| Review                       | Findings plus verdict, with false-positive penalty |
| Code                         | All authored tests pass                            |
| Git                          | Repository checks                                  |
| Terminal                     | Objectives satisfied in the simulation             |
| Test design                  | Selected set matches                               |
| Explain                      | Selected statements match                          |

`evaluateMission` requires every step to pass and the score to meet the mission pass score. A mission with one failed step is not complete, even if the average score is high.

### Evidence

`buildEvidenceDraft` turns a step result into an `EvidenceSubmission`. Hints change `assistance` and `independence`:

| Hints used | Assistance  | Independence |
| ---------- | ----------- | ------------ |
| 0          | independent | 1.0          |
| 1          | hint-1      | 0.8          |
| 2          | hint-2      | 0.6          |
| 3          | hint-3      | 0.4          |
| 4          | hint-4      | 0.2          |

The category comes from the step's authored `evidence` field or a default mapping. `findMisconception` matches a step id and optional answer key. `xpForCompletion` and `completionReward` add 15% XP for an independent completion; XP is not mastery.

### Mastery

`MasteryEstimator` computes:

```text
weight = categoryWeight * min(assistanceFactor, independence) * skillWeight
points = successes - failurePenalty * failures
score  = clamp01(1 - exp(-scale * max(0, points)))
```

Defaults: category weights prediction 0.08, construction 0.12, debugging 0.16, testing 0.13, explanation 0.10, transfer 0.20, review 0.08; scale 1.1; failure penalty 0.02; recent-failure window 30 days. The estimator returns evidence count, independent successes, assisted successes, recent failures, and an updated timestamp.

`explain` returns a learner-readable summary. `masteryLabel` maps scores to learning, developing, confident, and secure. `averageMastery` is a simple mean over skills and does not imply a credential.

The heuristic is deliberately simple and explainable. Its limits are documented in [CURRICULUM.md](../../CURRICULUM.md#limits-of-the-heuristic). It is not a psychometric model and cannot verify that a learner worked independently.

### Review

`ReviewScheduler` uses intervals `[1, 3, 7, 14]` days. A success advances one index, capped at 14 days. A failure moves back one index, floored at 1 day. A new item starts at index 0. `due` filters and sorts by due time. Missing a review is not punished; it remains due.

### Recommendations

`recommendMission` scores eligible missions using:

- Due reviews for mission skills (+60 each, capped 120).
- Completed mission penalty (−20).
- Weak skills below 0.5 (+10 each).
- Recent misconceptions (+18 each).
- Recent failures (+8 each).
- Interest matches (+14 each).
- Continuing the story at the next sequence (+22).
- Challenge fit: beginner/developing/advanced relative to gentle/standard/stretch.
- A tiny deterministic jitter to avoid identical ordering.

It returns reasons and up to three alternatives. The reasons are shown in the Learn screen so the recommendation is not a black box.

`buildPracticePlan` selects 1, 2, or 4 missions from due reviews, weak skills, and interests, then estimates minutes from authored values. It does not invent a duration.

### Placement

`gradePlacement` counts correct answers, records the associated skills as skipped, and selects the highest threshold that fits. Current thresholds: 7, 5, 3, and 0 correct. The result is advisory.

### Progression

`experienceThreshold(level) = 120 * (level - 1)^2`. `levelForExperience` walks levels until the next threshold exceeds the total. `levelProgress` returns the current level, experience inside the level, span, and next threshold. Level is a display of accumulated XP, not mastery.

Achievements are evaluated from evidence and context: independent transfer, boundary tests, debugging successes, club participation, project completion, AI reviews, a second language, and world recovery. The achievement definitions are content, not hardcoded IDs.

### Streaks

`computeStreak` and `recordPractice` use UTC dates. A missed day resets the current streak but preserves the longest streak. There is no penalty, notification pressure, or artificial energy system. Streaks are optional and must not drive the product's value.

## Server integration

The server's `EvidenceService` inserts evidence, recomputes mastery for affected skills, advances reviews for review-category evidence, and evaluates achievements. `CompletionService` records completion, awards XP once, updates the streak, advances reviews for the mission skills, and evaluates achievements. `AttemptService` validates mission version and ownership.

Both paths use the same domain code as the client. Do not reimplement the formulas in SQL or in a route handler.

## Content integration

`ContentCatalog` is built from validated documents. The web app bundles content with Vite globs and fails at startup on an invalid manifest. The server loads content from `CONTENT_DIR` or a repository-relative path and fails startup if the catalog is invalid. The content validator is the authoring gate.

Reference solutions are kept in `content-solutions/` and are used by validation. They must not be imported by the web app or returned by an API.
