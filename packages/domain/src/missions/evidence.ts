import type {
    EvidenceCategory,
    EvidenceSubmission,
    Misconception,
    Mission,
    MissionStep,
} from "@praxbit/contracts";
import {
    assistanceForHints,
    defaultEvidenceCategory,
    independenceForHints,
    type StepEvaluation,
} from "./evaluation.ts";

export interface EvidenceDraftInput {
    readonly id: string;
    readonly mission: Mission;
    readonly step: MissionStep;
    readonly evaluation: StepEvaluation;
    readonly hintsUsed: number;
    readonly now: Date;
    readonly attemptId?: string;
    readonly category?: EvidenceCategory;
    readonly detail?: string;
}

export function buildEvidenceDraft(input: EvidenceDraftInput): EvidenceSubmission {
    const assistance = assistanceForHints(input.hintsUsed);
    return {
        id: input.id,
        missionId: input.mission.id,
        missionVersion: input.mission.version,
        category: input.category ?? input.step.evidence ?? defaultEvidenceCategory(input.step),
        outcome: input.evaluation.passed ? "success" : "failure",
        assistance,
        independence: independenceForHints(input.hintsUsed),
        stepId: input.step.id,
        createdAt: input.now.toISOString(),
        ...(input.attemptId === undefined ? {} : { attemptId: input.attemptId }),
        detail: input.detail ?? input.evaluation.detail,
    };
}

export function findMisconception(
    mission: Mission,
    stepId: string,
    answerKey: string | undefined,
): Misconception | undefined {
    return mission.misconceptions.find(function matches(item: Misconception): boolean {
        if (item.stepId !== stepId) {
            return false;
        }
        if (item.answer === undefined) {
            return true;
        }
        if (answerKey === undefined) {
            return false;
        }
        return item.answer === answerKey;
    });
}

export function xpForCompletion(mission: Mission, independent: boolean): number {
    const base = mission.rewards.experience;
    return independent ? Math.round(base * 1.15) : base;
}
