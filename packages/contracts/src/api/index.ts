import { z } from "zod";
import {
    HandleSchema,
    InterestSchema,
    IsoDateTimeSchema,
    MissionIdSchema,
    SkillIdSchema,
} from "../schemas/common.ts";
import {
    AchievementRecordSchema,
    CompletionRecordSchema,
    EvidenceSubmissionSchema,
    ProgressSchema,
    ReviewItemSchema,
    SkillMasterySchema,
} from "../schemas/evidence.ts";
import {
    ClubEventSchema,
    ProjectFileMapSchema,
    WorldActionSchema,
    WorldStateSchema,
} from "../schemas/world.ts";

export const UserSchema = z.strictObject({
    id: z.uuid(),
    handle: z.string(),
    displayName: z.string(),
    role: z.enum(["member", "admin"]),
    createdAt: IsoDateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;

export const PreferencesSchema = z.strictObject({
    interests: z.array(InterestSchema).min(1),
    textScale: z.number().min(0.9).max(1.4),
    motion: z.enum(["system", "reduce", "full"]),
    sound: z.boolean(),
    challenge: z.enum(["gentle", "standard", "stretch"]),
    reminders: z.strictObject({
        enabled: z.boolean(),
        quietStart: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
        quietEnd: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
    }),
    aiTutor: z.boolean(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const RegisterRequestSchema = z.strictObject({
    handle: HandleSchema,
    displayName: z.string().min(1).max(40).optional(),
    password: z.string().min(10).max(200),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.strictObject({
    handle: HandleSchema,
    password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthResponseSchema = z.strictObject({
    user: UserSchema,
    preferences: PreferencesSchema,
    nativeToken: z.string().optional(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const MeResponseSchema = z.strictObject({
    user: UserSchema,
    preferences: PreferencesSchema,
    progress: ProgressSchema,
    completions: z.array(CompletionRecordSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const WorldResponseSchema = z.strictObject({
    world: WorldStateSchema,
});
export type WorldResponse = z.infer<typeof WorldResponseSchema>;

export const WorldActionRequestSchema = z.strictObject({
    action: WorldActionSchema,
    expectedVersion: z.number().int().nonnegative(),
});
export type WorldActionRequest = z.infer<typeof WorldActionRequestSchema>;

export const ProjectRevisionRequestSchema = z.strictObject({
    baseRevision: z.number().int().nonnegative(),
    message: z.string().min(1).max(200),
    files: ProjectFileMapSchema,
});
export type ProjectRevisionRequest = z.infer<typeof ProjectRevisionRequestSchema>;

export const ProjectRevisionSchema = z.strictObject({
    revision: z.number().int().positive(),
    message: z.string(),
    files: ProjectFileMapSchema,
    createdAt: IsoDateTimeSchema,
});
export type ProjectRevision = z.infer<typeof ProjectRevisionSchema>;

export const ProjectSummarySchema = z.strictObject({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    difficulty: z.string(),
    estimatedMinutes: z.number().int(),
    skills: z.array(z.string()),
    currentRevision: z.number().int().nonnegative(),
    updatedAt: IsoDateTimeSchema.optional(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ProjectDetailSchema = z.strictObject({
    project: ProjectSummarySchema,
    revisions: z.array(ProjectRevisionSchema),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

export const AttemptStartRequestSchema = z.strictObject({
    missionId: MissionIdSchema,
    missionVersion: z.number().int().positive(),
});
export type AttemptStartRequest = z.infer<typeof AttemptStartRequestSchema>;

export const AttemptStartResponseSchema = z.strictObject({
    attemptId: z.uuid(),
    startedAt: IsoDateTimeSchema,
});
export type AttemptStartResponse = z.infer<typeof AttemptStartResponseSchema>;

export const AttemptEvidenceRequestSchema = z.strictObject({
    evidence: EvidenceSubmissionSchema,
});
export type AttemptEvidenceRequest = z.infer<typeof AttemptEvidenceRequestSchema>;

export const EvidenceResultSchema = z.strictObject({
    accepted: z.boolean(),
    mastery: z.array(SkillMasterySchema),
    reviews: z.array(ReviewItemSchema),
    progress: ProgressSchema,
    achievements: z.array(AchievementRecordSchema),
});
export type EvidenceResult = z.infer<typeof EvidenceResultSchema>;

export const SyncOperationSchema = z.discriminatedUnion("kind", [
    z.strictObject({
        kind: z.literal("evidence"),
        operationId: z.string().min(8).max(80),
        evidence: EvidenceSubmissionSchema,
    }),
    z.strictObject({
        kind: z.literal("world-action"),
        operationId: z.string().min(8).max(80),
        expectedVersion: z.number().int().nonnegative(),
        action: WorldActionSchema,
    }),
    z.strictObject({
        kind: z.literal("project-revision"),
        operationId: z.string().min(8).max(80),
        projectId: z.string().min(1).max(120),
        baseRevision: z.number().int().nonnegative(),
        message: z.string().min(1).max(200),
        files: ProjectFileMapSchema,
    }),
    z.strictObject({
        kind: z.literal("mission-completion"),
        operationId: z.string().min(8).max(80),
        missionId: MissionIdSchema,
        missionVersion: z.number().int().positive(),
        attemptId: z.string().min(8).max(80),
        independent: z.boolean(),
        completedAt: IsoDateTimeSchema,
    }),
    z.strictObject({
        kind: z.literal("preferences"),
        operationId: z.string().min(8).max(80),
        preferences: PreferencesSchema,
    }),
]);
export type SyncOperation = z.infer<typeof SyncOperationSchema>;

export const SyncRequestSchema = z.strictObject({
    operations: z.array(SyncOperationSchema).max(50),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncResultSchema = z.strictObject({
    operationId: z.string(),
    kind: z.enum([
        "evidence",
        "world-action",
        "project-revision",
        "mission-completion",
        "preferences",
    ]),
    status: z.enum(["accepted", "duplicate", "conflict", "rejected"]),
    code: z.string().optional(),
    message: z.string().optional(),
    revision: z.number().int().optional(),
    worldVersion: z.number().int().optional(),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;

export const SyncResponseSchema = z.strictObject({
    results: z.array(SyncResultSchema),
    mastery: z.array(SkillMasterySchema),
    reviews: z.array(ReviewItemSchema),
    progress: ProgressSchema,
    achievements: z.array(AchievementRecordSchema),
    completions: z.array(CompletionRecordSchema),
    world: WorldStateSchema,
    preferences: PreferencesSchema,
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;

export const ClubSchema = z.strictObject({
    id: z.uuid(),
    name: z.string(),
    role: z.enum(["owner", "member"]).optional(),
    memberCount: z.number().int().nonnegative(),
    inviteCode: z.string().optional(),
    createdAt: IsoDateTimeSchema.optional(),
});
export type Club = z.infer<typeof ClubSchema>;

export const ClubMemberSchema = z.strictObject({
    handle: z.string(),
    displayName: z.string(),
    role: z.enum(["owner", "member"]),
    joinedAt: IsoDateTimeSchema,
});
export type ClubMember = z.infer<typeof ClubMemberSchema>;

export const LeaderboardEntrySchema = z.strictObject({
    handle: z.string(),
    displayName: z.string(),
    points: z.number().int().nonnegative(),
    verifiedAt: IsoDateTimeSchema,
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export const ClubDetailSchema = z.strictObject({
    club: ClubSchema,
    members: z.array(ClubMemberSchema),
    events: z.array(ClubEventSchema.omit({ answerHash: true, answerSalt: true })),
    leaderboard: z.array(LeaderboardEntrySchema),
    submissions: z.array(
        z.strictObject({
            eventId: z.string(),
            points: z.number().int(),
            verifiedAt: IsoDateTimeSchema,
        }),
    ),
});
export type ClubDetail = z.infer<typeof ClubDetailSchema>;

export const CreateClubRequestSchema = z.strictObject({
    name: z.string().min(2).max(60),
});
export type CreateClubRequest = z.infer<typeof CreateClubRequestSchema>;

export const JoinClubRequestSchema = z.strictObject({
    inviteCode: z.string().min(6).max(24),
});
export type JoinClubRequest = z.infer<typeof JoinClubRequestSchema>;

export const EventSubmissionRequestSchema = z.strictObject({
    eventId: z.string().min(1).max(120),
    answer: z.string().min(1).max(300),
});
export type EventSubmissionRequest = z.infer<typeof EventSubmissionRequestSchema>;

export const EventSubmissionResponseSchema = z.strictObject({
    verified: z.boolean(),
    points: z.number().int().nonnegative(),
    leaderboard: z.array(LeaderboardEntrySchema),
});
export type EventSubmissionResponse = z.infer<typeof EventSubmissionResponseSchema>;

export const AiHintRequestSchema = z.strictObject({
    missionId: MissionIdSchema,
    stepId: z.string().min(1).max(80),
    question: z.string().min(1).max(1000),
    code: z.string().max(4000).optional(),
});
export type AiHintRequest = z.infer<typeof AiHintRequestSchema>;

export const AiHintResponseSchema = z.strictObject({
    text: z.string().min(1).max(4000),
    model: z.string().min(1),
    remaining: z.number().int().nonnegative(),
});
export type AiHintResponse = z.infer<typeof AiHintResponseSchema>;

export const ExportBundleSchema = z.strictObject({
    exportedAt: IsoDateTimeSchema,
    user: UserSchema,
    preferences: PreferencesSchema,
    progress: ProgressSchema,
    mastery: z.array(SkillMasterySchema),
    reviews: z.array(ReviewItemSchema),
    evidence: z.array(EvidenceSubmissionSchema),
    completions: z.array(CompletionRecordSchema),
    worlds: z.array(WorldStateSchema),
    achievements: z.array(AchievementRecordSchema),
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;

export const ApiErrorSchema = z.strictObject({
    error: z.strictObject({
        code: z.string(),
        message: z.string(),
        details: z.json().optional(),
        requestId: z.string(),
    }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const PaginationSchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(200).optional(),
});

export const MasteryInputSchema = z.strictObject({
    skills: z.array(SkillIdSchema).min(1),
    evidence: z.array(EvidenceSubmissionSchema).min(1),
    now: IsoDateTimeSchema,
});
