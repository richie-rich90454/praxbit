# Synchronization protocol

The client is local-first. It writes to IndexedDB immediately, queues a sync operation, and reconciles with the server when the network and session allow it. The server is authoritative for signed-in state.

## Local outbox

`packages/client/src/persistence/index.ts` defines the `outbox` table:

```ts
interface OutboxRow {
    readonly seq?: number;
    readonly operationId: string;
    readonly operation: SyncOperation;
    readonly queuedAt: string;
    readonly attempts: number;
    readonly lastError?: string;
}
```

`Dexie` assigns a monotonic `seq`. `queueOperation` appends a row. `markOutboxFailure` increments attempts and records the last error. An accepted or duplicate result deletes the row.

The local database also stores progress, evidence, mastery, reviews, world, drafts, preferences, projects, attempts, completions, and metadata.

## Operation kinds

`SyncOperationSchema` is a discriminated union:

| Kind | Payload | Server behavior |
| --- | --- | --- |
| `evidence` | `EvidenceSubmission` | Insert evidence if new; recompute mastery, reviews, achievements |
| `world-action` | `expectedVersion`, `WorldAction` | Apply under a row lock if the version matches; otherwise conflict |
| `project-revision` | `projectId`, `baseRevision`, message, files | Insert a revision if the base matches; otherwise conflict |
| `mission-completion` | mission id/version, attempt id, independent, completedAt | Insert once per user/mission/version; duplicate returns the existing completion |
| `preferences` | full `Preferences` | Validate and replace preferences |

The request is `{ operations: SyncOperation[] }` with a maximum of 50 operations. The client flushes at most 25 per batch by default.

Every operation has a client-generated `operationId` unique per user. The server stores the result in `sync_operations` with a unique `(user_id, operation_id)` constraint. A replay returns the stored result with status `duplicate` and does not apply the effect twice.

## Flow

```text
local mutation
  -> apply locally (optimistic)
  -> queue operation with operationId
  -> when online and authenticated: flush

flush
  -> read first N outbox rows
  -> POST /api/v1/sync
  -> apply returned snapshot:
       mastery, reviews, progress, achievements, completions, world, preferences
  -> for each result:
       accepted or duplicate -> delete outbox row
       conflict -> keep row, increment attempts, store message
       rejected -> keep row, increment attempts, store message
  -> report status: idle, offline, unauthenticated, synced, partial, failed
```

The response includes the full authoritative snapshot so the client does not have to merge each table independently. That is deliberate: the snapshot is small for this product and avoids divergent merge logic.

## Conflict behavior

- A world version conflict means another device changed the world. The client shows the server version and does not retry the stale action automatically.
- A project revision conflict means another device saved first. The client keeps the local draft and shows the server revision; the learner must choose what to keep.
- A mission completion duplicate is not an error. It returns the existing completion and no new XP.
- A rejected operation stays in the outbox with its error. The learner can retry after fixing the cause. It is not silently dropped.
- If the user is unauthenticated, flush returns `unauthenticated` and leaves rows queued.
- If the browser is offline, flush returns `offline` without a request.
- A failed network request marks the first row with the error and returns `failed`; it does not delete rows.

## Guest migration

A guest can create an account or sign in. `SyncManager.migrateGuestProgress` reads local progress and preferences, saves them locally, and flushes a larger batch (50). The server remains authoritative for conflicts. There is no automatic merge of two full histories; the outbox is the migration mechanism.

Guest local state is not trusted as verified history. A newly created account's server state starts from its own records and the uploaded operations.

## Authentication

- Browser requests use the `praxbit_session` cookie and fetch with `credentials: "include"`.
- Mutations require the `x-csrf-token` header, obtained from `/api/v1/auth/csrf`. The client caches the token in memory.
- Native requests use a bearer token returned when `x-praxbit-client: native` is sent. Bearer requests do not need CSRF.
- A `401` or `403` during flush returns `unauthenticated`; the client must not discard the outbox.

## Server result shape

`SyncResult`:

```ts
interface SyncResult {
    readonly operationId: string;
    readonly kind:
        | "evidence"
        | "world-action"
        | "project-revision"
        | "mission-completion"
        | "preferences";
    readonly status: "accepted" | "duplicate" | "conflict" | "rejected";
    readonly code?: string;
    readonly message?: string;
    readonly revision?: number;
    readonly worldVersion?: number;
}
```

The response also includes `mastery`, `reviews`, `progress`, `achievements`, `completions`, `world`, and `preferences`. Clients must validate the response with the contract schema before applying it.

## Idempotency rules

- The operation id is generated on the client with `crypto.randomUUID()` and must be 8–80 characters.
- The unique database constraint is the final guard; an in-memory check alone is insufficient.
- Mission completion is also unique per user, mission, and version. A new operation id for the same completion returns `duplicate`.
- World actions use `expectedVersion`; a retry with an old version is a conflict even if the operation id is new.
- Project revisions use `baseRevision`; a retry with an old base is a conflict.
- Preferences are last-write-wins by operation order, but the server validates the full object.

## What is not implemented

- There is no CRDT or field-level merge.
- There is no background sync guarantee on iOS Safari or a native background task.
- There is no server push. The client flushes on load, on reconnect, and after local mutations when online.
- There is no conflict resolution UI for choosing individual project files beyond keeping the local draft and showing the server revision.
- There is no offline queue encryption. Local data is protected by the browser profile, not by an application key.
