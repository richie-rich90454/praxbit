function reference(name: string): { readonly $ref: string } {
    return { $ref: `#/components/schemas/${name}` };
}

function jsonContent(schema: unknown): Record<string, unknown> {
    return { "application/json": { schema } };
}

function errorResponse(description: string): Record<string, unknown> {
    return { description, content: jsonContent(reference("ApiError")) };
}

const requestIdHeader = { $ref: "#/components/headers/RequestId" };
const csrfParameter = { $ref: "#/components/parameters/CsrfToken" };
const cursorParameter = { $ref: "#/components/parameters/Cursor" };
const limitParameter = { $ref: "#/components/parameters/Limit" };
const noContent: Record<string, unknown> = { description: "No content." };

export const OPENAPI_DOCUMENT: Record<string, unknown> = {
    openapi: "3.1.0",
    info: {
        title: "Praxbit API",
        version: "1.0.0",
        description:
            "Versioned HTTP API for Praxbit. Browser clients authenticate with an opaque HttpOnly session cookie and " +
            "must send the double-submit CSRF header on every mutation. Native clients authenticate with a bearer token " +
            "and do not need CSRF. Errors always use the ApiError envelope with a request id.",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
        { name: "Auth" },
        { name: "Account" },
        { name: "Learning" },
        { name: "Sync" },
        { name: "World" },
        { name: "Projects" },
        { name: "Clubs" },
        { name: "AI" },
        { name: "Catalog" },
        { name: "Administration" },
        { name: "Operations" },
    ],
    components: {
        securitySchemes: {
            cookieAuth: { type: "apiKey", in: "cookie", name: "praxbit_session" },
            bearerAuth: { type: "http", scheme: "bearer" },
        },
        parameters: {
            CsrfToken: {
                name: "x-csrf-token",
                in: "header",
                required: true,
                schema: { type: "string" },
                description:
                    "Must equal the praxbit_csrf cookie for cookie-authenticated mutations.",
            },
            Cursor: {
                name: "cursor",
                in: "query",
                required: false,
                schema: { type: "string", maxLength: 200 },
            },
            Limit: {
                name: "limit",
                in: "query",
                required: false,
                schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
            },
        },
        headers: {
            RequestId: {
                description: "Stable identifier for the request and any error response.",
                schema: { type: "string" },
            },
            RetryAfter: {
                description: "Seconds to wait before retrying a rate-limited request.",
                schema: { type: "integer", minimum: 1 },
            },
        },
        schemas: {
            ApiError: {
                type: "object",
                required: ["error"],
                properties: {
                    error: {
                        type: "object",
                        required: ["code", "message", "requestId"],
                        properties: {
                            code: { type: "string" },
                            message: { type: "string" },
                            details: {},
                            requestId: { type: "string" },
                        },
                    },
                },
            },
            User: {
                type: "object",
                required: ["id", "handle", "displayName", "role", "createdAt"],
                properties: {
                    id: { type: "string", format: "uuid" },
                    handle: { type: "string" },
                    displayName: { type: "string" },
                    role: { type: "string", enum: ["member", "admin"] },
                    createdAt: { type: "string", format: "date-time" },
                },
            },
            Preferences: {
                type: "object",
                required: [
                    "interests",
                    "textScale",
                    "motion",
                    "sound",
                    "challenge",
                    "reminders",
                    "aiTutor",
                ],
                properties: {
                    interests: {
                        type: "array",
                        minItems: 1,
                        items: {
                            type: "string",
                            enum: ["web", "games", "systems", "ai", "professional", "everything"],
                        },
                    },
                    textScale: { type: "number", minimum: 0.9, maximum: 1.4 },
                    motion: { type: "string", enum: ["system", "reduce", "full"] },
                    sound: { type: "boolean" },
                    challenge: { type: "string", enum: ["gentle", "standard", "stretch"] },
                    reminders: {
                        type: "object",
                        required: ["enabled", "quietStart", "quietEnd"],
                        properties: {
                            enabled: { type: "boolean" },
                            quietStart: {
                                type: "string",
                                pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$",
                            },
                            quietEnd: {
                                type: "string",
                                pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$",
                            },
                        },
                    },
                    aiTutor: { type: "boolean" },
                },
            },
            AchievementRecord: {
                type: "object",
                required: ["achievementId", "earnedAt"],
                properties: {
                    achievementId: { type: "string" },
                    earnedAt: { type: "string", format: "date-time" },
                },
            },
            Progress: {
                type: "object",
                required: [
                    "experience",
                    "level",
                    "streakDays",
                    "longestStreak",
                    "placementSkippedSkills",
                    "achievements",
                ],
                properties: {
                    experience: { type: "integer", minimum: 0 },
                    level: { type: "integer", minimum: 1 },
                    streakDays: { type: "integer", minimum: 0 },
                    longestStreak: { type: "integer", minimum: 0 },
                    lastPracticeOn: { type: "string", format: "date" },
                    placementSkippedSkills: { type: "array", items: { type: "string" } },
                    achievements: { type: "array", items: reference("AchievementRecord") },
                },
            },
            CompletionRecord: {
                type: "object",
                required: [
                    "missionId",
                    "missionVersion",
                    "attemptId",
                    "completedAt",
                    "independent",
                ],
                properties: {
                    missionId: { type: "string" },
                    missionVersion: { type: "integer", minimum: 1 },
                    attemptId: { type: "string" },
                    completedAt: { type: "string", format: "date-time" },
                    independent: { type: "boolean" },
                },
            },
            EvidenceSubmission: {
                type: "object",
                required: [
                    "id",
                    "missionId",
                    "missionVersion",
                    "category",
                    "outcome",
                    "assistance",
                    "independence",
                    "createdAt",
                ],
                properties: {
                    id: { type: "string", minLength: 8, maxLength: 80 },
                    missionId: { type: "string" },
                    missionVersion: { type: "integer", minimum: 1 },
                    category: {
                        type: "string",
                        enum: [
                            "prediction",
                            "construction",
                            "debugging",
                            "testing",
                            "explanation",
                            "transfer",
                            "review",
                        ],
                    },
                    outcome: { type: "string", enum: ["success", "failure"] },
                    assistance: {
                        type: "string",
                        enum: ["independent", "hint-1", "hint-2", "hint-3", "hint-4"],
                    },
                    independence: { type: "number", minimum: 0, maximum: 1 },
                    stepId: { type: "string" },
                    attemptId: { type: "string" },
                    createdAt: { type: "string", format: "date-time" },
                    detail: { type: "string", maxLength: 600 },
                },
            },
            SkillMastery: {
                type: "object",
                required: [
                    "skillId",
                    "score",
                    "evidenceCount",
                    "independentSuccesses",
                    "assistedSuccesses",
                    "recentFailures",
                    "updatedAt",
                ],
                properties: {
                    skillId: { type: "string" },
                    score: { type: "number", minimum: 0, maximum: 1 },
                    evidenceCount: { type: "integer", minimum: 0 },
                    independentSuccesses: { type: "integer", minimum: 0 },
                    assistedSuccesses: { type: "integer", minimum: 0 },
                    recentFailures: { type: "integer", minimum: 0 },
                    updatedAt: { type: "string", format: "date-time" },
                },
            },
            ReviewItem: {
                type: "object",
                required: ["skillId", "intervalIndex", "dueAt"],
                properties: {
                    skillId: { type: "string" },
                    intervalIndex: { type: "integer", minimum: 0 },
                    dueAt: { type: "string", format: "date-time" },
                    lastReviewedAt: { type: "string", format: "date-time" },
                    lastOutcome: { type: "string", enum: ["success", "failure"] },
                },
            },
            AuthResponse: {
                type: "object",
                required: ["user", "preferences"],
                properties: {
                    user: reference("User"),
                    preferences: reference("Preferences"),
                    nativeToken: { type: "string" },
                },
            },
            RegisterRequest: {
                type: "object",
                required: ["handle", "password"],
                properties: {
                    handle: { type: "string", pattern: "^[a-z0-9_]{3,24}$" },
                    displayName: { type: "string", minLength: 1, maxLength: 40 },
                    password: { type: "string", minLength: 10, maxLength: 200 },
                },
            },
            LoginRequest: {
                type: "object",
                required: ["handle", "password"],
                properties: {
                    handle: { type: "string", pattern: "^[a-z0-9_]{3,24}$" },
                    password: { type: "string", minLength: 1, maxLength: 200 },
                },
            },
            MeResponse: {
                type: "object",
                required: ["user", "preferences", "progress", "completions"],
                properties: {
                    user: reference("User"),
                    preferences: reference("Preferences"),
                    progress: reference("Progress"),
                    completions: { type: "array", items: reference("CompletionRecord") },
                },
            },
            EvidenceResult: {
                type: "object",
                required: ["accepted", "mastery", "reviews", "progress", "achievements"],
                properties: {
                    accepted: { type: "boolean" },
                    mastery: { type: "array", items: reference("SkillMastery") },
                    reviews: { type: "array", items: reference("ReviewItem") },
                    progress: reference("Progress"),
                    achievements: { type: "array", items: reference("AchievementRecord") },
                },
            },
            AttemptStartRequest: {
                type: "object",
                required: ["missionId", "missionVersion"],
                properties: {
                    missionId: { type: "string" },
                    missionVersion: { type: "integer", minimum: 1 },
                },
            },
            AttemptStartResponse: {
                type: "object",
                required: ["attemptId", "startedAt"],
                properties: {
                    attemptId: { type: "string", format: "uuid" },
                    startedAt: { type: "string", format: "date-time" },
                },
            },
            EvidenceRequest: {
                type: "object",
                required: ["evidence"],
                properties: { evidence: reference("EvidenceSubmission") },
            },
            SyncOperation: {
                oneOf: [
                    {
                        type: "object",
                        required: ["kind", "operationId", "evidence"],
                        properties: {
                            kind: { const: "evidence" },
                            operationId: { type: "string", minLength: 8, maxLength: 80 },
                            evidence: reference("EvidenceSubmission"),
                        },
                    },
                    {
                        type: "object",
                        required: ["kind", "operationId", "expectedVersion", "action"],
                        properties: {
                            kind: { const: "world-action" },
                            operationId: { type: "string", minLength: 8, maxLength: 80 },
                            expectedVersion: { type: "integer", minimum: 0 },
                            action: reference("WorldAction"),
                        },
                    },
                    {
                        type: "object",
                        required: [
                            "kind",
                            "operationId",
                            "projectId",
                            "baseRevision",
                            "message",
                            "files",
                        ],
                        properties: {
                            kind: { const: "project-revision" },
                            operationId: { type: "string", minLength: 8, maxLength: 80 },
                            projectId: { type: "string" },
                            baseRevision: { type: "integer", minimum: 0 },
                            message: { type: "string", minLength: 1, maxLength: 200 },
                            files: { type: "object", additionalProperties: { type: "string" } },
                        },
                    },
                    {
                        type: "object",
                        required: [
                            "kind",
                            "operationId",
                            "missionId",
                            "missionVersion",
                            "attemptId",
                            "independent",
                            "completedAt",
                        ],
                        properties: {
                            kind: { const: "mission-completion" },
                            operationId: { type: "string", minLength: 8, maxLength: 80 },
                            missionId: { type: "string" },
                            missionVersion: { type: "integer", minimum: 1 },
                            attemptId: { type: "string", minLength: 8, maxLength: 80 },
                            independent: { type: "boolean" },
                            completedAt: { type: "string", format: "date-time" },
                        },
                    },
                    {
                        type: "object",
                        required: ["kind", "operationId", "preferences"],
                        properties: {
                            kind: { const: "preferences" },
                            operationId: { type: "string", minLength: 8, maxLength: 80 },
                            preferences: reference("Preferences"),
                        },
                    },
                ],
            },
            SyncResult: {
                type: "object",
                required: ["operationId", "kind", "status"],
                properties: {
                    operationId: { type: "string" },
                    kind: {
                        type: "string",
                        enum: [
                            "evidence",
                            "world-action",
                            "project-revision",
                            "mission-completion",
                            "preferences",
                        ],
                    },
                    status: {
                        type: "string",
                        enum: ["accepted", "duplicate", "conflict", "rejected"],
                    },
                    code: { type: "string" },
                    message: { type: "string" },
                    revision: { type: "integer" },
                    worldVersion: { type: "integer" },
                },
            },
            SyncResponse: {
                type: "object",
                required: [
                    "results",
                    "mastery",
                    "reviews",
                    "progress",
                    "achievements",
                    "completions",
                    "world",
                    "preferences",
                ],
                properties: {
                    results: { type: "array", items: reference("SyncResult") },
                    mastery: { type: "array", items: reference("SkillMastery") },
                    reviews: { type: "array", items: reference("ReviewItem") },
                    progress: reference("Progress"),
                    achievements: { type: "array", items: reference("AchievementRecord") },
                    completions: { type: "array", items: reference("CompletionRecord") },
                    world: reference("WorldState"),
                    preferences: reference("Preferences"),
                },
            },
            WorldAction: {
                type: "object",
                required: ["id"],
                properties: {
                    id: {
                        type: "string",
                        enum: [
                            "repair-inventory",
                            "publish-storefront",
                            "restore-deploy",
                            "fix-permissions",
                            "restart-service",
                            "resolve-merge",
                            "integrate-systems",
                            "resolve-incident",
                            "enable-robotics",
                            "secure-service",
                        ],
                    },
                    systemId: { type: "string" },
                },
            },
            WorldState: {
                type: "object",
                required: ["id", "version", "systems", "edges", "flags", "log"],
                properties: {
                    id: { const: "campus" },
                    version: { type: "integer", minimum: 0 },
                    systems: { type: "array", items: { type: "object" } },
                    edges: {
                        type: "array",
                        items: {
                            type: "array",
                            items: { type: "string" },
                            minItems: 2,
                            maxItems: 2,
                        },
                    },
                    flags: { type: "object", additionalProperties: { type: "boolean" } },
                    log: { type: "array", items: { type: "object" } },
                },
            },
            WorldActionRequest: {
                type: "object",
                required: ["action", "expectedVersion"],
                properties: {
                    action: reference("WorldAction"),
                    expectedVersion: { type: "integer", minimum: 0 },
                },
            },
            ProjectRevision: {
                type: "object",
                required: ["revision", "message", "files", "createdAt"],
                properties: {
                    revision: { type: "integer", minimum: 1 },
                    message: { type: "string" },
                    files: { type: "object", additionalProperties: { type: "string" } },
                    createdAt: { type: "string", format: "date-time" },
                },
            },
            ProjectSummary: {
                type: "object",
                required: [
                    "id",
                    "title",
                    "summary",
                    "difficulty",
                    "estimatedMinutes",
                    "skills",
                    "currentRevision",
                ],
                properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    summary: { type: "string" },
                    difficulty: { type: "string" },
                    estimatedMinutes: { type: "integer" },
                    skills: { type: "array", items: { type: "string" } },
                    currentRevision: { type: "integer", minimum: 0 },
                    updatedAt: { type: "string", format: "date-time" },
                },
            },
            ProjectDetail: {
                type: "object",
                required: ["project", "revisions"],
                properties: {
                    project: reference("ProjectSummary"),
                    revisions: { type: "array", items: reference("ProjectRevision") },
                },
            },
            ProjectRevisionRequest: {
                type: "object",
                required: ["baseRevision", "message", "files"],
                properties: {
                    baseRevision: { type: "integer", minimum: 0 },
                    message: { type: "string", minLength: 1, maxLength: 200 },
                    files: { type: "object", additionalProperties: { type: "string" } },
                },
            },
            Club: {
                type: "object",
                required: ["id", "name", "memberCount"],
                properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    role: { type: "string", enum: ["owner", "member"] },
                    memberCount: { type: "integer", minimum: 0 },
                    inviteCode: { type: "string" },
                    createdAt: { type: "string", format: "date-time" },
                },
            },
            ClubDetail: {
                type: "object",
                required: ["club", "members", "events", "leaderboard", "submissions"],
                properties: {
                    club: reference("Club"),
                    members: { type: "array", items: { type: "object" } },
                    events: { type: "array", items: { type: "object" } },
                    leaderboard: { type: "array", items: { type: "object" } },
                    submissions: { type: "array", items: { type: "object" } },
                },
            },
            CreateClubRequest: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string", minLength: 2, maxLength: 60 } },
            },
            JoinClubRequest: {
                type: "object",
                required: ["inviteCode"],
                properties: { inviteCode: { type: "string", minLength: 6, maxLength: 24 } },
            },
            EventSubmissionRequest: {
                type: "object",
                required: ["eventId", "answer"],
                properties: {
                    eventId: { type: "string", minLength: 1, maxLength: 120 },
                    answer: { type: "string", minLength: 1, maxLength: 300 },
                },
            },
            EventSubmissionResponse: {
                type: "object",
                required: ["verified", "points", "leaderboard"],
                properties: {
                    verified: { type: "boolean" },
                    points: { type: "integer", minimum: 0 },
                    leaderboard: { type: "array", items: { type: "object" } },
                },
            },
            AiHintRequest: {
                type: "object",
                required: ["missionId", "stepId", "question"],
                properties: {
                    missionId: { type: "string" },
                    stepId: { type: "string" },
                    question: { type: "string", minLength: 1, maxLength: 1000 },
                    code: { type: "string", maxLength: 4000 },
                },
            },
            AiHintResponse: {
                type: "object",
                required: ["text", "model", "remaining"],
                properties: {
                    text: { type: "string", minLength: 1, maxLength: 4000 },
                    model: { type: "string" },
                    remaining: { type: "integer", minimum: 0 },
                },
            },
            ExportBundle: {
                type: "object",
                required: [
                    "exportedAt",
                    "user",
                    "preferences",
                    "progress",
                    "mastery",
                    "reviews",
                    "evidence",
                    "completions",
                    "worlds",
                    "achievements",
                ],
                properties: {
                    exportedAt: { type: "string", format: "date-time" },
                    user: reference("User"),
                    preferences: reference("Preferences"),
                    progress: reference("Progress"),
                    mastery: { type: "array", items: reference("SkillMastery") },
                    reviews: { type: "array", items: reference("ReviewItem") },
                    evidence: { type: "array", items: reference("EvidenceSubmission") },
                    completions: { type: "array", items: reference("CompletionRecord") },
                    worlds: { type: "array", items: reference("WorldState") },
                    achievements: { type: "array", items: reference("AchievementRecord") },
                },
            },
        },
    },
    paths: {
        "/healthz": {
            get: {
                tags: ["Operations"],
                operationId: "health",
                summary: "Process liveness. Does not query the database.",
                servers: [{ url: "/" }],
                responses: {
                    "200": {
                        description: "Process is alive.",
                        content: jsonContent({ type: "object" }),
                    },
                },
            },
        },
        "/readyz": {
            get: {
                tags: ["Operations"],
                operationId: "readiness",
                summary: "Database readiness. Returns 503 when PostgreSQL cannot be reached.",
                servers: [{ url: "/" }],
                responses: {
                    "200": {
                        description: "Ready to serve.",
                        content: jsonContent({ type: "object" }),
                    },
                    "503": { description: "Not ready.", content: jsonContent({ type: "object" }) },
                },
            },
        },
        "/openapi.json": {
            get: {
                tags: ["Operations"],
                operationId: "openapi",
                summary: "This OpenAPI document.",
                responses: {
                    "200": {
                        description: "OpenAPI document.",
                        content: jsonContent({ type: "object" }),
                    },
                },
            },
        },
        "/auth/csrf": {
            get: {
                tags: ["Auth"],
                operationId: "issueCsrfToken",
                summary: "Issue a non-HttpOnly CSRF cookie and return the matching token.",
                responses: {
                    "200": {
                        description: "CSRF token issued.",
                        headers: { "x-request-id": requestIdHeader },
                        content: jsonContent({
                            type: "object",
                            required: ["csrfToken"],
                            properties: { csrfToken: { type: "string" } },
                        }),
                    },
                    "500": errorResponse("Unexpected server error."),
                },
            },
        },
        "/auth/register": {
            post: {
                tags: ["Auth"],
                operationId: "register",
                summary:
                    "Create an account with a handle and password. No email or real name is collected.",
                parameters: [csrfParameter],
                requestBody: { required: true, content: jsonContent(reference("RegisterRequest")) },
                responses: {
                    "201": {
                        description: "Account created. A session cookie is set.",
                        content: jsonContent(reference("AuthResponse")),
                    },
                    "400": errorResponse("Validation error."),
                    "409": errorResponse("The handle is already taken."),
                    "429": errorResponse("Registration rate limit reached."),
                },
            },
        },
        "/auth/login": {
            post: {
                tags: ["Auth"],
                operationId: "login",
                summary:
                    "Sign in. Native clients receive nativeToken when x-praxbit-client is native.",
                parameters: [csrfParameter],
                requestBody: { required: true, content: jsonContent(reference("LoginRequest")) },
                responses: {
                    "200": {
                        description: "Signed in. A session cookie is set.",
                        content: jsonContent(reference("AuthResponse")),
                    },
                    "401": errorResponse("Incorrect handle or password."),
                    "429": errorResponse("Login rate limit reached."),
                },
            },
        },
        "/auth/logout": {
            post: {
                tags: ["Auth"],
                operationId: "logout",
                summary: "Revoke the current session and clear the cookie.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "204": noContent,
                    "403": errorResponse("CSRF token missing or mismatched."),
                },
            },
        },
        "/auth/sessions": {
            delete: {
                tags: ["Auth"],
                operationId: "revokeSessions",
                summary: "Revoke every session for the authenticated account.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "204": noContent,
                    "401": errorResponse("Authentication required."),
                    "403": errorResponse("CSRF token missing or mismatched."),
                },
            },
        },
        "/me": {
            get: {
                tags: ["Account"],
                operationId: "getMe",
                summary: "Current account, preferences, progress, and completions.",
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "200": {
                        description: "Current account.",
                        content: jsonContent(reference("MeResponse")),
                    },
                    "401": errorResponse("Authentication required."),
                },
            },
            delete: {
                tags: ["Account"],
                operationId: "deleteAccount",
                summary: "Hard-delete the account and all personal rows, revoking sessions.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "204": noContent,
                    "401": errorResponse("Authentication required."),
                    "403": errorResponse("CSRF token missing or mismatched."),
                },
            },
        },
        "/me/progress": {
            get: {
                tags: ["Account"],
                operationId: "getProgress",
                summary: "Progress, mastery, and review schedules.",
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "200": {
                        description: "Progress snapshot.",
                        content: jsonContent({
                            type: "object",
                            required: ["progress", "mastery", "reviews"],
                            properties: {
                                progress: reference("Progress"),
                                mastery: { type: "array", items: reference("SkillMastery") },
                                reviews: { type: "array", items: reference("ReviewItem") },
                            },
                        }),
                    },
                    "401": errorResponse("Authentication required."),
                },
            },
        },
        "/me/export": {
            post: {
                tags: ["Account"],
                operationId: "exportAccount",
                summary: "Export every personal learning record as a JSON bundle.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: jsonContent({ type: "object", additionalProperties: false }),
                },
                responses: {
                    "200": {
                        description: "Account export.",
                        content: jsonContent(reference("ExportBundle")),
                    },
                    "401": errorResponse("Authentication required."),
                    "403": errorResponse("CSRF token missing or mismatched."),
                },
            },
        },
        "/me/evidence": {
            post: {
                tags: ["Learning"],
                operationId: "submitEvidence",
                summary: "Record evidence and recompute mastery for affected skills.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: { required: true, content: jsonContent(reference("EvidenceRequest")) },
                responses: {
                    "200": {
                        description: "Evidence result.",
                        content: jsonContent(reference("EvidenceResult")),
                    },
                    "400": errorResponse("Validation error or mission version mismatch."),
                    "401": errorResponse("Authentication required."),
                    "404": errorResponse("Unknown mission or project."),
                },
            },
        },
        "/attempts": {
            post: {
                tags: ["Learning"],
                operationId: "startAttempt",
                summary: "Start a mission attempt.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: jsonContent(reference("AttemptStartRequest")),
                },
                responses: {
                    "201": {
                        description: "Attempt started.",
                        content: jsonContent(reference("AttemptStartResponse")),
                    },
                    "400": errorResponse("Mission version mismatch."),
                    "401": errorResponse("Authentication required."),
                    "404": errorResponse("Unknown mission."),
                },
            },
        },
        "/attempts/{id}/evidence": {
            post: {
                tags: ["Learning"],
                operationId: "submitAttemptEvidence",
                summary: "Record evidence linked to an existing attempt.",
                parameters: [
                    {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "string", format: "uuid" },
                    },
                    csrfParameter,
                ],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: { required: true, content: jsonContent(reference("EvidenceRequest")) },
                responses: {
                    "200": {
                        description: "Evidence result.",
                        content: jsonContent(reference("EvidenceResult")),
                    },
                    "400": errorResponse("Attempt or evidence mismatch."),
                    "401": errorResponse("Authentication required."),
                    "404": errorResponse("Unknown attempt, mission, or project."),
                },
            },
        },
        "/sync": {
            post: {
                tags: ["Sync"],
                operationId: "synchronize",
                summary:
                    "Apply up to 50 idempotent operations in one transaction and return the authoritative snapshot. " +
                    "Replayed operation ids return their previous result with status duplicate.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: jsonContent({
                        type: "object",
                        required: ["operations"],
                        properties: {
                            operations: {
                                type: "array",
                                maxItems: 50,
                                items: reference("SyncOperation"),
                            },
                        },
                    }),
                },
                responses: {
                    "200": {
                        description: "Sync snapshot.",
                        content: jsonContent(reference("SyncResponse")),
                    },
                    "400": errorResponse("Invalid operation payload."),
                    "401": errorResponse("Authentication required."),
                    "409": errorResponse(
                        "A request-level conflict; per-operation conflicts use status conflict.",
                    ),
                },
            },
        },
        "/worlds/{id}": {
            get: {
                tags: ["World"],
                operationId: "getWorld",
                summary: "Read the authenticated account's campus world.",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { const: "campus" } },
                ],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "200": {
                        description: "World state.",
                        content: jsonContent({
                            type: "object",
                            required: ["world"],
                            properties: { world: reference("WorldState") },
                        }),
                    },
                    "401": errorResponse("Authentication required."),
                    "404": errorResponse("Unknown world."),
                },
            },
        },
        "/worlds/campus/actions": {
            post: {
                tags: ["World"],
                operationId: "applyWorldAction",
                summary: "Apply a deterministic world action with optimistic concurrency.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: jsonContent(reference("WorldActionRequest")),
                },
                responses: {
                    "200": {
                        description: "Updated world.",
                        content: jsonContent({
                            type: "object",
                            required: ["world"],
                            properties: { world: reference("WorldState") },
                        }),
                    },
                    "401": errorResponse("Authentication required."),
                    "409": errorResponse(
                        "world_version_conflict; details.currentVersion holds the current version.",
                    ),
                },
            },
        },
        "/projects": {
            get: {
                tags: ["Projects"],
                operationId: "listProjects",
                summary:
                    "List project metadata. Authenticated callers also receive their current revision.",
                responses: {
                    "200": {
                        description: "Project list.",
                        content: jsonContent({ type: "array", items: reference("ProjectDetail") }),
                    },
                },
            },
        },
        "/projects/{id}": {
            get: {
                tags: ["Projects"],
                operationId: "getProject",
                summary: "Read one project with the authenticated account's revisions.",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    "200": {
                        description: "Project detail.",
                        content: jsonContent(reference("ProjectDetail")),
                    },
                    "404": errorResponse("Unknown project."),
                },
            },
        },
        "/projects/{id}/revisions": {
            post: {
                tags: ["Projects"],
                operationId: "saveProjectRevision",
                summary:
                    "Save a revision with base-revision conflict detection and safe file paths.",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    csrfParameter,
                ],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: jsonContent(reference("ProjectRevisionRequest")),
                },
                responses: {
                    "200": {
                        description: "Project detail.",
                        content: jsonContent(reference("ProjectDetail")),
                    },
                    "400": errorResponse("Unsafe file path or validation error."),
                    "401": errorResponse("Authentication required."),
                    "409": errorResponse(
                        "project_revision_conflict; details.currentRevision holds the current revision.",
                    ),
                },
            },
        },
        "/clubs": {
            get: {
                tags: ["Clubs"],
                operationId: "listClubs",
                summary:
                    "List the authenticated account's clubs; anonymous callers receive an empty list.",
                security: [{ cookieAuth: [] }, { bearerAuth: [] }, {}],
                responses: {
                    "200": {
                        description: "Clubs.",
                        content: jsonContent({ type: "array", items: reference("Club") }),
                    },
                    "401": errorResponse("Authentication required for non-empty club data."),
                },
            },
            post: {
                tags: ["Clubs"],
                operationId: "createClub",
                summary: "Create a club and become its owner.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: jsonContent(reference("CreateClubRequest")),
                },
                responses: {
                    "201": {
                        description: "Club created.",
                        content: jsonContent(reference("Club")),
                    },
                    "400": errorResponse("Validation error."),
                    "401": errorResponse("Authentication required."),
                },
            },
        },
        "/clubs/join": {
            post: {
                tags: ["Clubs"],
                operationId: "joinClubByCode",
                summary: "Join a club with an invite code.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: { required: true, content: jsonContent(reference("JoinClubRequest")) },
                responses: {
                    "200": { description: "Joined club.", content: jsonContent(reference("Club")) },
                    "401": errorResponse("Authentication required."),
                    "404": errorResponse("No club matches the invite code."),
                },
            },
        },
        "/clubs/{id}": {
            get: {
                tags: ["Clubs"],
                operationId: "getClub",
                summary:
                    "Club members, sanitized weekly events, verified leaderboard, and the caller's verified submissions. " +
                    "Only members (and administrators) may read a club.",
                parameters: [
                    {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "string", format: "uuid" },
                    },
                ],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "200": {
                        description: "Club detail.",
                        content: jsonContent(reference("ClubDetail")),
                    },
                    "401": errorResponse("Authentication required."),
                    "403": errorResponse("club_forbidden: membership required."),
                    "404": errorResponse("Unknown club."),
                },
            },
        },
        "/clubs/{id}/join": {
            post: {
                tags: ["Clubs"],
                operationId: "joinClub",
                summary: "Join a specific club using its invite code.",
                parameters: [
                    {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "string", format: "uuid" },
                    },
                    csrfParameter,
                ],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: { required: true, content: jsonContent(reference("JoinClubRequest")) },
                responses: {
                    "200": { description: "Joined club.", content: jsonContent(reference("Club")) },
                    "401": errorResponse("Authentication required."),
                    "403": errorResponse("invalid_invite_code."),
                    "404": errorResponse("Unknown club."),
                },
            },
        },
        "/clubs/{id}/reports": {
            post: {
                tags: ["Clubs"],
                operationId: "reportClub",
                summary: "Report a club for moderation.",
                parameters: [
                    {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "string", format: "uuid" },
                    },
                    csrfParameter,
                ],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: jsonContent({
                        type: "object",
                        required: ["reason"],
                        properties: { reason: { type: "string", minLength: 5, maxLength: 500 } },
                    }),
                },
                responses: {
                    "201": {
                        description: "Report recorded.",
                        content: jsonContent({
                            type: "object",
                            required: ["reportId"],
                            properties: { reportId: { type: "string", format: "uuid" } },
                        }),
                    },
                    "401": errorResponse("Authentication required."),
                    "404": errorResponse("Unknown club."),
                },
            },
        },
        "/events": {
            get: {
                tags: ["Clubs"],
                operationId: "listEvents",
                summary: "List weekly club events without answer hashes or salts.",
                responses: {
                    "200": {
                        description: "Club events.",
                        content: jsonContent({ type: "array", items: { type: "object" } }),
                    },
                },
            },
        },
        "/events/{id}/submissions": {
            post: {
                tags: ["Clubs"],
                operationId: "submitEvent",
                summary:
                    "Submit an event answer. The server hashes salt + option id and only verified submissions enter the leaderboard. " +
                    "When an account belongs to several clubs, the earliest joined club receives the submission.",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    csrfParameter,
                ],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: jsonContent(reference("EventSubmissionRequest")),
                },
                responses: {
                    "200": {
                        description: "Verification result.",
                        content: jsonContent(reference("EventSubmissionResponse")),
                    },
                    "400": errorResponse("Event id mismatch."),
                    "401": errorResponse("Authentication required."),
                    "403": errorResponse("club_required: join a club first."),
                    "404": errorResponse("Unknown event."),
                },
            },
        },
        "/ai/hints": {
            post: {
                tags: ["AI"],
                operationId: "requestAiHint",
                summary:
                    "Request an optional AI hint. Requires aiTutor in preferences, validates the mission step, " +
                    "enforces a per-user hourly quota, and never logs prompt content.",
                parameters: [csrfParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                requestBody: { required: true, content: jsonContent(reference("AiHintRequest")) },
                responses: {
                    "200": {
                        description: "Hint.",
                        content: jsonContent(reference("AiHintResponse")),
                    },
                    "401": errorResponse("Authentication required."),
                    "403": errorResponse("ai_disabled."),
                    "404": errorResponse("Unknown mission or step."),
                    "429": errorResponse("ai_quota_exceeded."),
                    "502": errorResponse("ai_upstream_error."),
                    "503": errorResponse("ai_unavailable: no provider is configured."),
                    "504": errorResponse("ai_timeout."),
                },
            },
        },
        "/catalog": {
            get: {
                tags: ["Catalog"],
                operationId: "getCatalog",
                summary:
                    "Validated skills, tracks, mission metadata, projects, placement, achievements, and runtime labels.",
                responses: {
                    "200": { description: "Catalog.", content: jsonContent({ type: "object" }) },
                },
            },
        },
        "/skills/{id}": {
            get: {
                tags: ["Catalog"],
                operationId: "getSkill",
                summary: "One validated skill definition.",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    "200": { description: "Skill.", content: jsonContent({ type: "object" }) },
                    "404": errorResponse("Unknown skill."),
                },
            },
        },
        "/missions/{id}": {
            get: {
                tags: ["Catalog"],
                operationId: "getMission",
                summary: "One validated mission and its honest runtime label.",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    "200": {
                        description: "Mission.",
                        content: jsonContent({
                            type: "object",
                            required: ["mission", "runtimeLabel"],
                            properties: {
                                mission: { type: "object" },
                                runtimeLabel: { type: "string" },
                            },
                        }),
                    },
                    "404": errorResponse("Unknown mission."),
                },
            },
        },
        "/admin/overview": {
            get: {
                tags: ["Administration"],
                operationId: "adminOverview",
                summary: "Aggregate counts without secrets or personal content.",
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "200": { description: "Overview.", content: jsonContent({ type: "object" }) },
                    "401": errorResponse("Authentication required."),
                    "403": errorResponse("admin_required."),
                },
            },
        },
        "/admin/audit": {
            get: {
                tags: ["Administration"],
                operationId: "listAuditEvents",
                summary: "Audit entries, newest first, with cursor pagination.",
                parameters: [limitParameter, cursorParameter],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "200": {
                        description: "Audit page.",
                        content: jsonContent({
                            type: "object",
                            required: ["items", "nextCursor", "limit"],
                            properties: {
                                items: { type: "array", items: { type: "object" } },
                                nextCursor: { type: ["string", "null"] },
                                limit: { type: "integer" },
                            },
                        }),
                    },
                    "400": errorResponse("Invalid pagination cursor or limit."),
                    "403": errorResponse("admin_required."),
                },
            },
        },
        "/admin/reports": {
            get: {
                tags: ["Administration"],
                operationId: "listClubReports",
                summary: "Open club reports for moderation.",
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "200": { description: "Reports.", content: jsonContent({ type: "object" }) },
                    "403": errorResponse("admin_required."),
                },
            },
        },
        "/admin/reports/{id}/resolve": {
            post: {
                tags: ["Administration"],
                operationId: "resolveClubReport",
                summary: "Mark an open club report as reviewed.",
                parameters: [
                    {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "string", format: "uuid" },
                    },
                    csrfParameter,
                ],
                security: [{ cookieAuth: [] }, { bearerAuth: [] }],
                responses: {
                    "204": noContent,
                    "403": errorResponse("admin_required."),
                    "404": errorResponse("Unknown open report."),
                },
            },
        },
    },
};
