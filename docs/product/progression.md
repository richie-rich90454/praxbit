# Progression

Praxbit has two separate progress signals:

1. **XP and level** acknowledge completed work.
2. **Mastery** estimates understanding from evidence.

They are not interchangeable. A learner can gain XP for a completion with low mastery, and can strengthen mastery through review without gaining a new level.

## XP and level

- A mission awards its authored experience on first completion per mission version.
- An independent completion awards 15% more XP. A hinted completion awards the base amount.
- XP is not awarded twice for the same mission version. A duplicate completion returns the existing record.
- Level thresholds are `120 * (level - 1)^2`. Level 1 starts at 0, level 2 at 120, level 3 at 480, level 4 at 1080, and so on.
- The Learn screen shows the level and total XP. Settings and mission completion show the same value.
- Level is a display of accumulated work. It is not a credential and does not unlock content by itself.
- XP cannot be purchased, farmed from a timer, or earned by staying online.

## Mastery

Mastery is a 0–1 estimate per skill, derived from evidence:

| Label      | Score     | Meaning                                        |
| ---------- | --------- | ---------------------------------------------- |
| Learning   | below 0.4 | Early or limited evidence                      |
| Developing | 0.4–0.69  | Some successful evidence, still fragile        |
| Confident  | 0.7–0.84  | Repeated success across categories             |
| Secure     | 0.85–1.0  | Strong evidence for this skill in this product |

The estimate weights transfer highest, then debugging and testing, then construction, explanation, prediction, and review. Hints reduce independence. A failure subtracts a small amount. The exact formula is in [CURRICULUM.md](../../CURRICULUM.md#mastery-heuristic).

What mastery is not:

- Not a grade, certificate, or professional credential.
- Not proof that the learner worked unaided outside the app.
- Not a claim that the learner knows every edge case.
- Not a substitute for a proctored competition result.

## Reviews

Reviews are scheduled at 1, 3, 7, and 14 days. A success advances; a failure moves back one interval. Missing a review does not reset XP or punish the learner. The review remains due and appears in Practice and Learn.

## Achievements

Achievements recognize meaningful behavior:

- First independent transfer.
- Boundary and invalid-case testing.
- Repeated debugging recovery.
- Club participation or helping a teammate.
- A completed authentic project.
- Careful review of AI-generated work.
- A second language demonstration.
- Campus recovery.

Achievements are not a checklist of taps. They are evaluated from evidence and context. Do not add an achievement for opening a screen or returning on consecutive days.

## Placement

Placement can skip prerequisite checks for skills answered correctly. It recommends a starting mission based on the number correct. It does not award XP or mastery. A learner can ignore the recommendation and open another track.

## Streaks

Streaks are optional and gentle:

- A day with practice increments the current streak.
- A missed day resets the current streak but preserves the longest streak.
- There is no loss of XP, mastery, content, or standing.
- Notifications are off by default and respect quiet hours.
- The UI does not say “don’t lose your streak” or “you’re behind”.

## Session length

A useful session can be five minutes:

- One mission, one review, or one project stage.
- A clear completion state.
- No artificial energy bar or “come back later” gate.
- No reward for staying longer than the work requires.

## Progression display

- Show the next meaningful action, not a wall of counters.
- Explain why a mission is recommended.
- Show due reviews without shame.
- Show a skill’s evidence count and label, not a false precision percentage without context.
- Show the world consequence of a completion separately from XP.
- Do not show a leaderboard on the Learn screen. Competition is optional and lives in Club.

## Local and server state

Guest progress is local. Signed-in progress is synchronized. A sync conflict may change what is displayed; the server snapshot is authoritative for signed-in state. Local work is not discarded on a failed request.

## What not to add

- Energy, lives, or timers that block learning.
- XP multipliers for consecutive days or purchases.
- Loot boxes, randomized rewards, or paid progression.
- Leaderboards based on unverified local results.
- A “mastery” badge that is granted for completion alone.
- Public profiles or ranking by real name.
