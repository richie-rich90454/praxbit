# Content review checklist

Use this checklist for every mission, project, track, placement question, achievement, and club event. A pull request that adds content without this review is not ready.

## Learning objective

- [ ] The objective is written in one sentence and describes what the learner will be able to do.
- [ ] The objective is observable in the interaction, not only stated in the lesson.
- [ ] The mission teaches one coherent idea; it does not cram three unrelated topics together.
- [ ] The prerequisites are real. The learner has a path to the required skills.
- [ ] The difficulty and estimated minutes are honest.

## Teaching

- [ ] The briefing gives a concrete situation and a reason to care.
- [ ] The lesson explains the concept before asking for production.
- [ ] Vocabulary is defined in plain language and used consistently.
- [ ] The first attempt is achievable from the lesson and the interface.
- [ ] The learner explores before being graded where the interaction allows it.
- [ ] Four hints escalate from observation to a concrete next action.
- [ ] Hints do not dump the complete answer.
- [ ] At least two misconceptions have specific, corrective feedback.
- [ ] A wrong answer gets an explanation, not only a red state.
- [ ] Transfer asks for the same rule in a new case, not a renamed example.
- [ ] The completion message explains what was learned and what comes next.
- [ ] The mission does not claim mastery from a single success.

## Evaluation

- [ ] The evaluator is deterministic and does not call an LLM.
- [ ] The correct answer is unambiguous in the prompt.
- [ ] Alternative valid solutions are either accepted or explicitly excluded by the prompt.
- [ ] The pass score is appropriate; a partially correct answer does not complete the mission.
- [ ] The evidence category matches what the learner actually did.
- [ ] The answer key used for misconception matching is stable.
- [ ] The mission version is bumped if the assessment meaning changed.
- [ ] A completion cannot award XP twice.
- [ ] A world action, if any, is versioned and idempotent.

## Runtime truth

- [ ] The declared runtime exists and is used.
- [ ] Python is labeled Pyodide, not CPython on the server.
- [ ] SQL is labeled SQLite, not PostgreSQL.
- [ ] The terminal is labeled simulated.
- [ ] Static analysis is not described as execution.
- [ ] The code step's files, entry point, preview, and tests are consistent.
- [ ] A code step has a reference solution and the solution passes.
- [ ] A Git step's seed history can satisfy its checks.
- [ ] A terminal objective can be completed with the documented command vocabulary.
- [ ] Timeouts and output limits are reasonable for the interaction.

## Accessibility

- [ ] The page has a clear heading and reading order.
- [ ] The interaction is keyboard operable.
- [ ] Focus is visible.
- [ ] The controls have labels, not placeholder-only labels.
- [ ] The interaction does not rely on drag without an alternative.
- [ ] Status is conveyed by text, not color alone.
- [ ] The world has an accessible list, not only the canvas.
- [ ] Test results announce the name, expected value, actual value, and result.
- [ ] Reduced motion is respected.
- [ ] The largest text scale and a 320px viewport do not clip the interaction.
- [ ] The screen-reader notes are accurate for the actual controls.

## Content quality

- [ ] The prose is in American English.
- [ ] The prose is concise and specific; no marketing filler.
- [ ] There are no unsupported superiority claims.
- [ ] There are no copied external course materials.
- [ ] There are no real people, learner data, secrets, or private URLs.
- [ ] The tone is respectful and not preachy.
- [ ] The mission does not rely on a stereotype or a joke at a beginner's expense.
- [ ] All ids, step ids, skill ids, and world ids are valid and consistent.
- [ ] The license line is present and correct.
- [ ] Assets follow the naming rules and are original or properly licensed.

## Validation

- [ ] `pnpm content:validate` passes with no errors.
- [ ] `pnpm exec vitest run --project content` passes.
- [ ] The reference solutions run, not just parse.
- [ ] Any deferred check is verified in a browser or real runtime.
- [ ] The mission appears in the intended track and sequence.
- [ ] The track's mission ids all exist.
- [ ] Placement and achievement references resolve.
- [ ] Club event answer hashes match the intended answer and salt.
- [ ] The web build can load the mission without a schema error.
- [ ] The server startup content load succeeds.

## Product integration

- [ ] The mission is reachable from Learn and from its track.
- [ ] Completion updates the intended world state, if any.
- [ ] The achievement, if any, can actually be earned.
- [ ] The review schedule is sensible for the skills.
- [ ] The mission does not unlock a mission that does not exist.
- [ ] The mission does not require an account for guest play unless the interaction truly needs one.
- [ ] The content does not promise a feature that is not implemented.

## Honesty

- [ ] The mission does not claim to teach a whole language or framework.
- [ ] The runtime label matches the experience.
- [ ] The mission does not present a simulation as a real system.
- [ ] The mission does not claim verification or certification.
- [ ] The limitations are documented if the interaction is partial.

## Review record

In the pull request, include:

- The learning objective.
- The evidence categories produced.
- The runtime and its limits.
- The validation command and output summary.
- Any deferred check and how it was verified.
- Any known limitation.

Two reviewers are ideal for a new campaign or a new runtime. One reviewer is enough for a small correction if the validation and behavior are clear.
