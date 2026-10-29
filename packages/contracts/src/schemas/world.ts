import { z } from "zod";
import { ContentLanguageSchema } from "./common.ts";
import { CodeTestSchema } from "./code.ts";

export const WorldSystemIdSchema = z.enum([
    "storefront",
    "website",
    "api",
    "database",
    "messaging",
    "delivery",
    "dev-team",
    "server-room",
    "robotics",
]);
export type WorldSystemId = z.infer<typeof WorldSystemIdSchema>;

export const WorldActionIdSchema = z.enum([
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
]);
export type WorldActionId = z.infer<typeof WorldActionIdSchema>;

export const SystemStatusSchema = z.enum(["healthy", "degraded", "down", "offline"]);
export type SystemStatus = z.infer<typeof SystemStatusSchema>;

export const WorldSystemSchema = z.strictObject({
    id: WorldSystemIdSchema,
    name: z.string().min(1).max(80),
    kind: z.enum([
        "frontend",
        "service",
        "data",
        "network",
        "people",
        "infrastructure",
        "automation",
    ]),
    status: SystemStatusSchema,
    summary: z.string().min(1).max(400),
    dependsOn: z.array(WorldSystemIdSchema),
    metrics: z.record(z.string(), z.number()),
});
export type WorldSystem = z.infer<typeof WorldSystemSchema>;

export const WorldLogEntrySchema = z.strictObject({
    seq: z.number().int().nonnegative(),
    action: WorldActionIdSchema,
    text: z.string().min(1).max(400),
});
export type WorldLogEntry = z.infer<typeof WorldLogEntrySchema>;

export const WorldStateSchema = z.strictObject({
    id: z.literal("campus"),
    version: z.number().int().nonnegative(),
    systems: z.array(WorldSystemSchema),
    edges: z.array(z.tuple([WorldSystemIdSchema, WorldSystemIdSchema])),
    flags: z.record(z.string(), z.boolean()),
    log: z.array(WorldLogEntrySchema).max(100),
});
export type WorldState = z.infer<typeof WorldStateSchema>;

export const WorldActionSchema = z.strictObject({
    id: WorldActionIdSchema,
    systemId: WorldSystemIdSchema.optional(),
});
export type WorldAction = z.infer<typeof WorldActionSchema>;

export const ProjectFileMapSchema = z.record(z.string().min(1).max(200), z.string().max(200_000));

export const ProjectSchema = z.strictObject({
    id: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(500),
    difficulty: z.enum(["beginner", "developing", "advanced"]),
    skills: z.array(z.string()).min(1),
    estimatedMinutes: z.number().int().min(10).max(600),
    runtime: z.string().min(1),
    brief: z.array(z.string().min(1)).min(1),
    files: ProjectFileMapSchema,
    entry: z.string().min(1),
    language: ContentLanguageSchema,
    preview: z.enum(["html", "css", "console", "sql", "none"]),
    database: z
        .strictObject({
            schemaSql: z.string().min(1).max(6000),
            seedSql: z.string().max(6000),
        })
        .optional(),
    stages: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(80),
                title: z.string().min(1).max(140),
                description: z.string().min(1).max(1200),
                tests: z.array(CodeTestSchema).min(1).max(12),
            }),
        )
        .min(1)
        .max(6),
    explanation: z.array(z.string().min(1)).min(1),
});
export type ProjectDefinition = z.infer<typeof ProjectSchema>;

export const ProjectsDocumentSchema = z.strictObject({
    version: z.literal(1),
    projects: z.array(ProjectSchema).min(1),
});
export type ProjectsDocument = z.infer<typeof ProjectsDocumentSchema>;

export const AchievementDefinitionSchema = z.strictObject({
    id: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/),
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(300),
    kind: z.enum([
        "independent-transfer",
        "hidden-boundary",
        "difficult-debugging",
        "helping-teammate",
        "authentic-project",
        "ai-review",
        "new-language",
        "recovery",
    ]),
    rule: z.enum([
        "first-independent-transfer",
        "three-boundary-tests",
        "five-debugging-successes",
        "team-event-participation",
        "first-project-complete",
        "three-ai-reviews",
        "second-language",
        "world-recovered",
    ]),
});
export type AchievementDefinition = z.infer<typeof AchievementDefinitionSchema>;

export const AchievementsDocumentSchema = z.strictObject({
    version: z.literal(1),
    achievements: z.array(AchievementDefinitionSchema).min(1),
});
export type AchievementsDocument = z.infer<typeof AchievementsDocumentSchema>;

export const ClubEventSchema = z.strictObject({
    id: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/),
    title: z.string().min(1).max(140),
    summary: z.string().min(1).max(600),
    weekOf: z.iso.date(),
    skillIds: z.array(z.string()).min(1),
    options: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(60),
                label: z.string().min(1).max(300),
            }),
        )
        .min(2),
    answerHash: z.string().regex(/^[a-f0-9]{64}$/),
    answerSalt: z.string().min(8).max(64),
    points: z.number().int().min(10).max(1000),
});
export type ClubEvent = z.infer<typeof ClubEventSchema>;

export const ClubEventsDocumentSchema = z.strictObject({
    version: z.literal(1),
    events: z.array(ClubEventSchema).min(1),
});
export type ClubEventsDocument = z.infer<typeof ClubEventsDocumentSchema>;
