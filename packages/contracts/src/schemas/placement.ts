import { z } from "zod";
import { MissionIdSchema, SkillIdSchema } from "./common.ts";

export const PlacementQuestionSchema = z.strictObject({
    id: z.string().min(1).max(80),
    prompt: z.string().min(1).max(600),
    options: z
        .array(
            z.strictObject({
                id: z.string().min(1).max(80),
                label: z.string().min(1).max(300),
            }),
        )
        .min(2)
        .max(6),
    correctId: z.string().min(1),
    skillId: SkillIdSchema,
    level: z.enum(["beginner", "developing", "advanced"]),
});
export type PlacementQuestion = z.infer<typeof PlacementQuestionSchema>;

export const PlacementDocumentSchema = z.strictObject({
    version: z.literal(1),
    questions: z.array(PlacementQuestionSchema).min(4).max(12),
    recommendations: z
        .array(
            z.strictObject({
                minCorrect: z.number().int().nonnegative(),
                missionId: MissionIdSchema,
            }),
        )
        .min(1),
});
export type PlacementDocument = z.infer<typeof PlacementDocumentSchema>;
