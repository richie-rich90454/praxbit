# World simulation

The campus is a deterministic state machine. It is not a live server simulation and it does not run per-user background processes. A learner action produces a new versioned state; the server persists it and the client renders it.

## State

`WorldState` is defined in `packages/contracts/src/schemas/world.ts`:

```ts
interface WorldState {
    readonly id: "campus";
    readonly version: number;
    readonly systems: readonly WorldSystem[];
    readonly edges: readonly [WorldSystemId, WorldSystemId][];
    readonly flags: Readonly<Record<string, boolean>>;
    readonly log: readonly WorldLogEntry[];
}
```

Each system has an id, name, kind, status (`healthy`, `degraded`, `down`, `offline`), summary, dependency list, and numeric metrics. The log keeps the last 100 entries.

Initial systems:

| System             | Kind           | Initial status | Depends on             |
| ------------------ | -------------- | -------------- | ---------------------- |
| Storefront         | frontend       | degraded       | API                    |
| Website            | frontend       | healthy        | API                    |
| Orders API         | service        | healthy        | Database               |
| Inventory database | data           | healthy        | —                      |
| Campus messaging   | network        | degraded       | —                      |
| Delivery dispatch  | service        | healthy        | API, messaging         |
| Development team   | people         | healthy        | —                      |
| Server room        | infrastructure | healthy        | API, database          |
| Robotics lab       | automation     | offline        | messaging, server room |

Initial flags are all false:

`inventoryConsistent`, `storefrontPublished`, `deploymentRestored`, `permissionsFixed`, `mergeResolved`, `systemsIntegrated`, `incidentResolved`, `roboticsEnabled`, `serviceHardened`, `serviceRestarted`.

## Actions

`applyWorldAction(state, action)` is a pure function. The action id is a closed union. Each action defines a message, flags to set, system status changes, and optional metric changes.

| Action | Effect |
| --- | --- |
| `repair-inventory` | Sets `inventoryConsistent`; storefront and database healthy |
| `publish-storefront` | Sets `storefrontPublished`; storefront and website healthy; broken links 0 |
| `restore-deploy` | Sets `deploymentRestored`; server room, API, and team healthy |
| `fix-permissions` | Sets `permissionsFixed`; server room healthy |
| `restart-service` | Sets `serviceRestarted`; selected system healthy (default API) |
| `resolve-merge` | Sets `mergeResolved`; team healthy |
| `integrate-systems` | Sets `systemsIntegrated`; API, database, messaging healthy |
| `resolve-incident` | Sets `incidentResolved` only when systems integrated, deployment restored, and storefront published; otherwise leaves degraded systems |
| `enable-robotics` | Sets `roboticsEnabled`; robotics healthy |
| `secure-service` | Sets `serviceHardened`; API healthy |

Every action increments `version` and appends a log entry. The function returns the new state plus a `changed` flag. Unknown action ids produce a no-op message rather than an exception; the schema prevents unknown ids at the boundary.

`worldHealth` counts healthy systems and returns a recovery ratio. `isWorldRecovered` is true only when every system is healthy.

## Persistence and concurrency

The server stores one world per user. `WorldService.applyAction` runs in a transaction:

1. Lock the user's world row.
2. Compare the stored version with `expectedVersion`.
3. Apply the domain action.
4. Save the new state and append an action record.

A stale version returns `409 world_version_conflict` with the current version. The client must refresh rather than overwrite. A retry with a new operation id can apply a new action, but the same action should not be applied twice.

World actions also flow through the sync outbox as `world-action` operations. The server's sync handler applies the same version check and records the result by operation id.

## Client rendering

`apps/web/src/features/world/WorldScreen.tsx`:

- Loads the world from local IndexedDB and refreshes from the API when signed in.
- Dynamically imports `@praxbit/game` so PixiJS is not in the opening page bundle.
- Renders the campus canvas and an accessible system list with the same state.
- Shows health, selected system details, metrics, log entries, and a restart action.

`packages/game/src/rendering/campus.ts` creates the PixiJS scene and updates it when the world changes. The canvas is `aria-hidden`; the list is the accessible representation. If PixiJS fails to load, the screen keeps the list and shows a notice.

## Mission integration

Mission outcomes can set a world action. The mission's `persistence` field names an action and system. The web app applies the action locally and queues it for sync when signed in. A mission completion and its world action are separate concerns: completion is idempotent per mission version; the world action is idempotent by operation id and version check.

## Limits

- The simulation is intentionally small: nine systems and ten actions. It is a teaching model, not a general infrastructure simulator.
- It does not model time, traffic, failures, or emergent behavior. Effects are authored and deterministic.
- The server validates action ids and versions but does not currently verify that the learner completed the mission that teaches an action. A direct API caller can trigger an action without that evidence. Do not treat the world as a proctored assessment until a mission-completion check is added.
- The log is bounded to 100 entries. It is a narrative aid, not an audit log.
- The PixiJS scene is decorative. The accessible list and text are the source of truth.
- A local world action is visible immediately but is not server-verified until sync. The UI must not imply otherwise.
