# Navigation

The primary navigation has exactly five destinations:

1. **Learn**
2. **World**
3. **Practice**
4. **Projects**
5. **Club**

Settings and Placement are secondary links in the header or footer. Do not add a sixth primary destination without a product decision that removes or merges one of these.

## Learn

- The next recommended mission, with reasons.
- Due reviews and a short practice entry.
- The learning map for the campus campaigns.
- Other tracks, clearly labeled by kind and runtime.
- Level and XP are visible but not the dominant message.

The learning map shows missions and their story order. A locked node names the skills that unlock it. The map is not a mandatory single path; eligible tracks remain open.

## World

- The current campus state: nine systems, health, dependencies, and recent changes.
- A visual map and an accessible system list with the same state.
- A system detail panel with status, metrics, and the recovery action available.
- A version and log of changes.

The world is a consequence of learning, not a separate idle game. Do not add timers, energy, or passive resource generation.

## Practice

- A short session built from due reviews, weak skills, and interests.
- Session lengths: short (1 activity), medium (2), longer (4).
- An estimated time based on authored mission minutes.
- A clear stop point. The learner can leave after a few minutes without penalty.

Practice is not a second curriculum. It revisits completed missions and skills.

## Projects

- Three authentic projects with a brief, files, stages, executable checks, and an explanation.
- A workspace with an editor, preview or console, test results, and saved drafts.
- Project completion is evidence of construction, not automatic mastery of every listed skill.
- A completed project can be reopened.

## Club

- Invitation-based clubs, not a public directory.
- A weekly structured event with a short scenario and options.
- A leaderboard based on verified submissions.
- Reporting and moderation foundations.
- No unrestricted public chat or direct messaging.

The Club screen requires an account. A guest sees an explanation and a sign-in path, not a dead end.

## Secondary routes

| Route           | Purpose                                                     |
| --------------- | ----------------------------------------------------------- |
| `/settings`     | Account, accessibility, preferences, export, deletion       |
| `/placement`    | Optional diagnostic and starting recommendation             |
| `/missions/:id` | Mission play                                                |
| `/projects/:id` | Project workspace                                           |
| `/`             | Landing or the learner's home depending on onboarding state |

Settings is reachable from the header and footer. Placement is reachable from the footer and the account/settings area. Neither is a primary destination.

## Navigation behavior

- The current destination is marked with `aria-current="page"`.
- The skip link is the first focusable element and targets the main content.
- The mobile layout keeps all five destinations reachable without a hidden gesture-only menu.
- The header does not become a dashboard of counters.
- Offline or sync failure shows a quiet status strip, not a modal that blocks reading.
- A route that needs an account explains why and offers sign-in; it does not silently redirect to a marketing page.

## Copy

- Use sentence case: “Learn”, “World”, “Practice”, “Projects”, “Club”.
- Do not add all-caps labels, decorative middle dots, or badge counts that do not represent a real state.
- Do not call the world a “metaverse”, the club a “guild”, or practice a “grind”.
- Do not add a navigation item for a feature that is not implemented.
