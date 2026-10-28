import type { PlacementDocument } from "@praxbit/contracts";

export interface PlacementResult {
    readonly correct: number;
    readonly total: number;
    readonly recommendedMissionId: string;
    readonly skippedSkills: readonly string[];
}

export function gradePlacement(
    document: PlacementDocument,
    answers: Readonly<Record<string, string>>,
): PlacementResult {
    let correct = 0;
    const skippedSkills: string[] = [];

    for (const question of document.questions) {
        if (answers[question.id] === question.correctId) {
            correct += 1;
            skippedSkills.push(question.skillId);
        }
    }

    const sorted = [...document.recommendations].sort(function byThreshold(left, right): number {
        return right.minCorrect - left.minCorrect;
    });
    const recommendation = sorted.find(function fits(entry): boolean {
        return correct >= entry.minCorrect;
    });

    return {
        correct,
        total: document.questions.length,
        recommendedMissionId:
            recommendation?.missionId ?? document.recommendations[0]?.missionId ?? "",
        skippedSkills,
    };
}
