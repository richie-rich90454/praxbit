import { z } from "zod";
import {
    AssistanceLevelSchema,
    EvidenceCategorySchema,
    EvidenceOutcomeSchema,
    IsoDateTimeSchema,
    MissionIdSchema,
    SkillIdSchema,
} from "./common.ts";

export const EvidenceSubmissionSchema = z.strictObject({
    id: z.string().min(8).max(80),
    missionId: MissionIdSchema,
    missionVersion: z.number().int().positive(),
    category: EvidenceCategorySchema,
    outcome: EvidenceOutcomeSchema,
    assistance: AssistanceLevelSchema,
    independence: z.number().min(0).max(1),
    stepId: z.string().min(1).max(80).optional(),
    attemptId: z.string().min(8).max(80).optional(),
    createdAt: IsoDateTimeSchema,
    detail: z.string().max(600).optional(),
});
export type EvidenceSubmission = z.infer<typeof EvidenceSubmissionSchema>;

export const EvidenceRecordSchema = EvidenceSubmissionSchema.extend({
    skills: z.array(SkillIdSchema).min(1),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const SkillMasterySchema = z.strictObject({
    skillId: SkillIdSchema,
    score: z.number().min(0).max(1),
    evidenceCount: z.number().int().nonnegative(),
    independentSuccesses: z.number().int().nonnegative(),
    assistedSuccesses: z.number().int().nonnegative(),
    recentFailures: z.number().int().nonnegative(),
    updatedAt: IsoDateTimeSchema,
});
export type SkillMastery = z.infer<typeof SkillMasterySchema>;

export const ReviewItemSchema = z.strictObject({
    skillId: SkillIdSchema,
    intervalIndex: z.number().int().min(0),
    dueAt: IsoDateTimeSchema,
    lastReviewedAt: IsoDateTimeSchema.optional(),
    lastOutcome: EvidenceOutcomeSchema.optional(),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const AchievementRecordSchema = z.strictObject({
    achievementId: z.string().min(1).max(80),
    earnedAt: IsoDateTimeSchema,
});
export type AchievementRecord = z.infer<typeof AchievementRecordSchema>;

export const ProgressSchema = z.strictObject({
    experience: z.number().int().nonnegative(),
    level: z.number().int().positive(),
    streakDays: z.number().int().nonnegative(),
    longestStreak: z.number().int().nonnegative(),
    lastPracticeOn: z.iso.date().optional(),
    placementSkippedSkills: z.array(SkillIdSchema),
    achievements: z.array(AchievementRecordSchema),
});
export type Progress = z.infer<typeof ProgressSchema>;

export const CompletionRecordSchema = z.strictObject({
    missionId: MissionIdSchema,
    missionVersion: z.number().int().positive(),
    attemptId: z.string().min(1).max(80),
    completedAt: IsoDateTimeSchema,
    independent: z.boolean(),
});
export type CompletionRecord = z.infer<typeof CompletionRecordSchema>;
