# API schemas

The authoritative definitions are in `packages/contracts/src/api/index.ts`, `src/schemas/*.ts`, and `src/events/index.ts`. This page summarizes the shapes and the constraints that clients most often get wrong. If this page and the zod schema disagree, the schema wins.

Most objects are `z.strictObject`: unknown keys are rejected. Send only the documented fields.

## Common conventions

- IDs: mission ids look like `course.mission-name`; skill ids look like `concept.iteration`; handles are 3–24 lowercase letters, numbers, or underscores.
- Timestamps: ISO 8601 with an offset (`IsoDateTimeSchema`). Use `new Date().toISOString()`.
- Dates without time: `YYYY-MM-DD` for `weekOf`, `lastPracticeOn`, and similar fields.
- JSON details: arbitrary JSON is allowed only in `ApiError.details` and audit metadata.
- Nulls: optional fields are omitted, not set to `null`, unless the schema says otherwise.

## Auth

```ts
RegisterRequest = { handle, displayName?, password } // password 10–200
LoginRequest = { handle, password }
AuthResponse = { user, preferences, nativeToken? }
```

`User`:

```ts
{
    id: string; // UUID
    handle: string;
    displayName: string;
    role: "member" | "admin";
    createdAt: string; // ISO
}
```

`Preferences`:

```ts
{
    interests: Interest[];        // at least 1; web|games|systems|ai|professional|everything
    textScale: number;            // 0.9–1.4
    motion: "system" | "reduce" | "full";
    sound: boolean;
    challenge: "gentle" | "standard" | "stretch";
    reminders: { enabled: boolean; quietStart: "HH:MM"; quietEnd: "HH:MM" };
    aiTutor: boolean;
}
```

## Me

`MeResponse` is `{ user, preferences, progress, completions }`.

`Progress`:

```ts
{
    experience: number;          // integer >= 0
    level: number;               // integer >= 1
    streakDays: number;          // integer >= 0
    longestStreak: number;       // integer >= 0
    lastPracticeOn?: string;     // YYYY-MM-DD
    placementSkippedSkills: string[];
    achievements: AchievementRecord[];
}
```

`CompletionRecord`:

```ts
{
    (missionId, missionVersion, attemptId, completedAt, independent);
}
```

## Evidence

`EvidenceSubmission`:

```ts
{
    id: string;                  // 8–80
    missionId: string;
    missionVersion: number;      // positive integer
    category: "prediction" | "construction" | "debugging" | "testing" | "explanation" | "transfer" | "review";
    outcome: "success" | "failure";
    assistance: "independent" | "hint-1" | "hint-2" | "hint-3" | "hint-4";
    independence: number;        // 0–1
    stepId?: string;
    attemptId?: string;
    createdAt: string;
    detail?: string;             // max 600
}
```

`EvidenceResult` is `{ accepted, mastery, reviews, progress, achievements }`.

`SkillMastery`:

```ts
{
    skillId: string;
    score: number; // 0–1
    evidenceCount: number;
    independentSuccesses: number;
    assistedSuccesses: number;
    recentFailures: number;
    updatedAt: string;
}
```

`ReviewItem`:

```ts
{
    skillId: string;
    intervalIndex: number;       // >= 0
    dueAt: string;
    lastReviewedAt?: string;
    lastOutcome?: "success" | "failure";
}
```

## Attempts

`AttemptStartRequest = { missionId, missionVersion }`. `AttemptStartResponse = { attemptId, startedAt }`. `AttemptEvidenceRequest = { evidence }`.

## Sync

`SyncOperation` is a discriminated union on `kind`:

| Kind | Fields |
| --- | --- |
| `evidence` | `operationId` (8–80), `evidence` |
| `world-action` | `operationId`, `expectedVersion`, `action` |
| `project-revision` | `operationId`, `projectId` (1–120), `baseRevision`, `message` (1–200), `files` |
| `mission-completion` | `operationId`, `missionId`, `missionVersion`, `attemptId` (8–80), `independent`, `completedAt` |
| `preferences` | `operationId`, `preferences` |

`SyncRequest = { operations: SyncOperation[] }` with at most 50 operations.

`SyncResult`:

```ts
{
    operationId: string;
    kind: "evidence" | "world-action" | "project-revision" | "mission-completion" | "preferences";
    status: "accepted" | "duplicate" | "conflict" | "rejected";
    code?: string;
    message?: string;
    revision?: number;
    worldVersion?: number;
}
```

`SyncResponse` contains `results` plus the full `mastery`, `reviews`, `progress`, `achievements`, `completions`, `world`, and `preferences` snapshot.

## World

`WorldState`:

```ts
{
    id: "campus";
    version: number;              // integer >= 0
    systems: WorldSystem[];
    edges: [WorldSystemId, WorldSystemId][];
    flags: Record<string, boolean>;
    log: WorldLogEntry[];         // max 100
}
```

`WorldSystem`:

```ts
{
    id: "storefront" | "website" | "api" | "database" | "messaging" | "delivery" | "dev-team" | "server-room" | "robotics";
    name: string;
    kind: "frontend" | "service" | "data" | "network" | "people" | "infrastructure" | "automation";
    status: "healthy" | "degraded" | "down" | "offline";
    summary: string;
    dependsOn: WorldSystemId[];
    metrics: Record<string, number>;
}
```

`WorldAction`:

```ts
{ id: WorldActionId; systemId?: WorldSystemId }
```

`WorldActionId` is listed in [world.md](../architecture/world.md#actions).

`WorldActionRequest = { action, expectedVersion }`. `WorldResponse = { world }`.

## Projects

`ProjectFileMap = Record<string, string>` with paths up to 200 characters and content up to 200,000 characters per file.

`ProjectRevisionRequest = { baseRevision, message, files }`. `ProjectRevision = { revision, message, files, createdAt }`. `ProjectSummary = { id, title, summary, difficulty, estimatedMinutes, skills, currentRevision, updatedAt? }`. `ProjectDetail = { project, revisions }`.

The server further limits a revision to 80 files and 900,000 total UTF-8 bytes, and rejects unsafe paths. Those limits are server rules even though the contract allows a larger per-file size.

## Clubs and events

`Club`:

```ts
{
    id: string;                  // UUID
    name: string;
    role?: "owner" | "member";
    memberCount: number;
    inviteCode?: string;
    createdAt?: string;
}
```

`ClubMember = { handle, displayName, role, joinedAt }`. `LeaderboardEntry = { handle, displayName, points, verifiedAt }`. `ClubDetail = { club, members, events, leaderboard, submissions }` where each submission is `{ eventId, points, verifiedAt }`.

`CreateClubRequest = { name }` (2–60). `JoinClubRequest = { inviteCode }` (6–24). `EventSubmissionRequest = { eventId, answer }` (answer 1–300). `EventSubmissionResponse = { verified, points, leaderboard }`.

## AI

`AiHintRequest`:

```ts
{
    missionId: string;
    stepId: string;              // 1–80
    question: string;            // 1–1000
    code?: string;               // max 4000
}
```

`AiHintResponse = { text, model, remaining }`.

## Export

`ExportBundle`:

```ts
{
    exportedAt: string;
    user: User;
    preferences: Preferences;
    progress: Progress;
    mastery: SkillMastery[];
    reviews: ReviewItem[];
    evidence: EvidenceSubmission[];
    completions: CompletionRecord[];
    worlds: WorldState[];
    achievements: AchievementRecord[];
}
```

## Errors and pagination

`ApiError`:

```ts
{
    error: {
        code: string;
        message: string;
        details?: unknown;       // JSON
        requestId: string;
    }
}
```

`PaginationSchema` accepts `limit` 1–50 (default 20) and `cursor` up to 200 characters.

## Contract change checklist

- Update the zod schema in `packages/contracts`.
- Update the server route and service.
- Update the client parser and any local persistence shape.
- Update the OpenAPI document.
- Add contract or integration tests for the new field and its invalid cases.
- Update this page and the endpoint reference.
