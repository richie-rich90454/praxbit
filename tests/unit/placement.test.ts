import { describe, expect, it } from "vitest";
import { gradePlacement } from "../../packages/domain/src/learning/placement.ts";
import type { PlacementDocument } from "../../packages/contracts/src/index.ts";

const document: PlacementDocument = {
    version: 1,
    questions: [
        {
            id: "one",
            prompt: "Question one?",
            options: [
                { id: "a", label: "A" },
                { id: "b", label: "B" },
            ],
            correctId: "a",
            skillId: "concept.base",
            level: "beginner",
        },
        {
            id: "two",
            prompt: "Question two?",
            options: [
                { id: "a", label: "A" },
                { id: "b", label: "B" },
            ],
            correctId: "b",
            skillId: "concept.conditions",
            level: "developing",
        },
        {
            id: "three",
            prompt: "Question three?",
            options: [
                { id: "a", label: "A" },
                { id: "b", label: "B" },
            ],
            correctId: "a",
            skillId: "concept.state",
            level: "advanced",
        },
    ],
    recommendations: [
        { minCorrect: 0, missionId: "before-code.start" },
        { minCorrect: 2, missionId: "campus.middle" },
        { minCorrect: 3, missionId: "campus.advanced" },
    ],
};

describe("gradePlacement", function gradePlacementTest(): void {
    it("counts correct answers and records skipped skills", function allCorrect(): void {
        const result = gradePlacement(document, { one: "a", two: "b", three: "a" });
        expect(result.correct).toBe(3);
        expect(result.total).toBe(3);
        expect(result.skippedSkills).toEqual([
            "concept.base",
            "concept.conditions",
            "concept.state",
        ]);
        expect(result.recommendedMissionId).toBe("campus.advanced");
    });

    it("chooses the highest satisfied recommendation threshold", function middle(): void {
        const result = gradePlacement(document, { one: "a", two: "b", three: "b" });
        expect(result.correct).toBe(2);
        expect(result.recommendedMissionId).toBe("campus.middle");
    });

    it("falls back to the entry recommendation", function entry(): void {
        const result = gradePlacement(document, {});
        expect(result.correct).toBe(0);
        expect(result.skippedSkills).toEqual([]);
        expect(result.recommendedMissionId).toBe("before-code.start");
    });

    it("does not grade an unknown answer as correct", function unknown(): void {
        const result = gradePlacement(document, { one: "z", two: "b", three: "a" });
        expect(result.correct).toBe(2);
    });
});
