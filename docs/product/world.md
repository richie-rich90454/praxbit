# World systems

The campus is a teaching model of a small software organization. It is not a separate idle game, and it does not run in the background.

## Systems

| System             | Kind           | What it teaches                                   |
| ------------------ | -------------- | ------------------------------------------------- |
| Storefront         | Frontend       | Structure, identity, publishing, broken links     |
| Website            | Frontend       | Public information and dependency on the API      |
| Orders API         | Service        | Requests, validation, errors, deployment recovery |
| Inventory database | Data           | Constraints, consistency, slow queries            |
| Campus messaging   | Network        | Queues, delayed delivery, integration             |
| Delivery dispatch  | Service        | Dependencies between services                     |
| Development team   | People         | Review, merge conflicts, collaboration            |
| Server room        | Infrastructure | Processes, permissions, service restarts          |
| Robotics lab       | Automation     | Binary messages, control, recovery                |

Each system has a status (`healthy`, `degraded`, `down`, `offline`), a short summary, dependencies, and numeric metrics. The World screen shows the same state as a visual map and an accessible list.

## Actions and consequences

| Action | Narrative | State change |
| --- | --- | --- |
| Repair inventory | Reject impossible orders before stock changes | Inventory consistent; storefront and database healthy |
| Publish storefront | Make the structure and layout available | Storefront published; broken links 0 |
| Restore deploy | Serve a known-good release | Deployment restored; server room, API, team healthy |
| Fix permissions | Grant only the access needed | Permissions fixed; server room healthy |
| Restart service | Restart one system after a failure | Service restarted; selected system healthy |
| Resolve merge | Preserve both intentions in a conflict | Merge resolved; team healthy |
| Integrate systems | Make the contract agree across services | Systems integrated; API, database, messaging healthy |
| Resolve incident | Contain and recover the whole campus | Incident resolved only when prerequisites are met |
| Enable robotics | Decode a valid binary control message | Robotics enabled and healthy |
| Secure service | Reject malformed and unauthorized requests | Service hardened; API healthy |

The incident action checks three prerequisites: systems integrated, deployment restored, and storefront published. If they are missing, the incident is contained but systems remain degraded. This is deliberate: a single “fix everything” button would teach the wrong lesson.

## Learning connection

Missions change the world. The mission manifest names a persistence action and system. Completion and the world action are separate:

- Completion is unique per user, mission, and version.
- The world action is versioned and idempotent by operation id.
- A retry must not apply the action twice.

The World screen also offers a restart action for a selected system. That action is a recovery action, not a shortcut through the campaign.

## Visual and accessible representation

- The PixiJS canvas is decorative and `aria-hidden`.
- The accessible system list carries the full state: name, status, summary, dependencies, metrics, and the selected action.
- Selecting a system in either representation updates the other.
- If the renderer fails to load, the list remains usable and a notice explains the failure.
- Status is conveyed with a word, a mark, and color. Color alone is not sufficient.
- The world log is text and lists the most recent 100 changes.

## Persistence

- Guest state lives in IndexedDB.
- Signed-in state is stored in PostgreSQL and synchronized.
- The server checks `expectedVersion`; a stale action returns a conflict.
- The client shows the server version after a conflict and does not silently overwrite.

## Limits

- The simulation has nine systems and ten actions. It is a teaching model, not a general infrastructure simulator.
- It does not model time, traffic, emergent failure, or real processes.
- The server does not currently verify that a direct API caller completed a teaching mission before applying an action. Do not treat the world as a proctored assessment until that check exists.
- The world is not a source of XP. It is a consequence of learning and a place to inspect state.

## What not to add

- Passive resource generation or timers.
- Energy that blocks recovery.
- Random failures that punish a learner for being away.
- A world action that requires payment.
- A visual-only state change with no accessible equivalent.
- A “prestige” reset that erases learning evidence.
