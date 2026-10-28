import { z } from "zod";
import { IsoDateTimeSchema, MissionIdSchema } from "../schemas/common.ts";
import { EvidenceCategorySchema } from "../schemas/common.ts";
import { WorldActionIdSchema } from "../schemas/world.ts";

export const MissionCompletedEventSchema = z.strictObject({
    type: z.literal("mission.completed"),
    missionId: MissionIdSchema,
    missionVersion: z.number().int().positive(),
    attemptId: z.string(),
    independent: z.boolean(),
    at: IsoDateTimeSchema,
});
export type MissionCompletedEvent = z.infer<typeof MissionCompletedEventSchema>;

export const EvidenceRecordedEventSchema = z.strictObject({
    type: z.literal("evidence.recorded"),
    evidenceId: z.string(),
    missionId: MissionIdSchema,
    category: EvidenceCategorySchema,
    at: IsoDateTimeSchema,
});
export type EvidenceRecordedEvent = z.infer<typeof EvidenceRecordedEventSchema>;

export const WorldChangedEventSchema = z.strictObject({
    type: z.literal("world.changed"),
    action: WorldActionIdSchema,
    version: z.number().int().nonnegative(),
    at: IsoDateTimeSchema,
});
export type WorldChangedEvent = z.infer<typeof WorldChangedEventSchema>;

export const DomainEventSchema = z.discriminatedUnion("type", [
    MissionCompletedEventSchema,
    EvidenceRecordedEventSchema,
    WorldChangedEventSchema,
]);
export type DomainEvent = z.infer<typeof DomainEventSchema>;
