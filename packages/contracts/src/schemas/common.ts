import { z } from "zod";

export const MissionIdSchema = z
    .string()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Mission ids look like campaign.mission-name");

export const SkillIdSchema = z
    .string()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Skill ids look like concept.iteration");

export const HandleSchema = z
    .string()
    .regex(/^[a-z0-9_]{3,24}$/, "Use 3-24 lowercase letters, numbers, or underscores");

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const DifficultySchema = z.enum(["beginner", "developing", "advanced"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const EvidenceCategorySchema = z.enum([
    "prediction",
    "construction",
    "debugging",
    "testing",
    "explanation",
    "transfer",
    "review",
]);
export type EvidenceCategory = z.infer<typeof EvidenceCategorySchema>;

export const AssistanceLevelSchema = z.enum([
    "independent",
    "hint-1",
    "hint-2",
    "hint-3",
    "hint-4",
]);
export type AssistanceLevel = z.infer<typeof AssistanceLevelSchema>;

export const EvidenceOutcomeSchema = z.enum(["success", "failure"]);
export type EvidenceOutcome = z.infer<typeof EvidenceOutcomeSchema>;

export const RuntimeKindSchema = z.enum([
    "none",
    "browser-javascript",
    "browser-typescript",
    "browser-html",
    "browser-css",
    "browser-python",
    "browser-sql",
    "browser-git",
    "simulated-linux",
    "guided-simulation",
    "static-analysis",
]);
export type RuntimeKind = z.infer<typeof RuntimeKindSchema>;

export const InteractionKindSchema = z.enum([
    "lesson",
    "quiz",
    "machine",
    "order",
    "state",
    "rule",
    "loop",
    "trace",
    "debug",
    "binary",
    "filesystem",
    "network",
    "review",
    "code",
    "git",
    "terminal",
    "test-design",
    "explain",
]);
export type InteractionKind = z.infer<typeof InteractionKindSchema>;

export const EvaluatorKindSchema = z.enum([
    "exact",
    "structured",
    "state-transition",
    "program-output",
    "code-tests",
    "structural",
    "visual",
    "configuration",
    "explanation",
    "multi-objective",
]);
export type EvaluatorKind = z.infer<typeof EvaluatorKindSchema>;

export const InterestSchema = z.enum([
    "web",
    "games",
    "systems",
    "ai",
    "professional",
    "everything",
]);
export type Interest = z.infer<typeof InterestSchema>;

export const SkillSchema = z.strictObject({
    id: SkillIdSchema,
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(600),
    kind: z.enum(["concept", "language", "framework", "engineering", "mathematics"]),
    parents: z.array(SkillIdSchema),
    interests: z.array(InterestSchema).min(1),
});
export type SkillDefinition = z.infer<typeof SkillSchema>;

export const SkillGraphDocumentSchema = z.strictObject({
    version: z.literal(1),
    skills: z.array(SkillSchema).min(1),
});
export type SkillGraphDocument = z.infer<typeof SkillGraphDocumentSchema>;

export const TrackSchema = z.strictObject({
    id: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    kind: z.enum(["campaign", "language", "framework", "discipline"]),
    missionIds: z.array(MissionIdSchema).min(1),
    interests: z.array(InterestSchema).min(1),
});
export type Track = z.infer<typeof TrackSchema>;

export const TracksDocumentSchema = z.strictObject({
    version: z.literal(1),
    tracks: z.array(TrackSchema).min(1),
});
export type TracksDocument = z.infer<typeof TracksDocumentSchema>;
