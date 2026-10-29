import { describe, expect, it } from "vitest";
import { findMisconception } from "../../packages/domain/src/missions/evidence.ts";
import { makeMission } from "./support/fixtures.ts";

const answeredMission = makeMission({
    misconceptions: [
        {
            id: "misconception-one",
            description: "A first misconception.",
            stepId: "answer",
            answer: "wrong-a",
            feedback: "Feedback for the first misconception.",
        },
        {
            id: "misconception-two",
            description: "A second misconception.",
            stepId: "answer",
            answer: "wrong-b",
            feedback: "Feedback for the second misconception.",
        },
    ],
});

describe("findMisconception", function findMisconceptionSuite(): void {
    it("returns only the misconception that matches the selected answer", function exact(): void {
        expect(findMisconception(answeredMission, "answer", "wrong-b")?.id).toBe(
            "misconception-two",
        );
    });

    it("does not guess when no answer key was selected", function noGuess(): void {
        expect(findMisconception(answeredMission, "answer", undefined)).toBeUndefined();
        expect(findMisconception(answeredMission, "answer", "unrelated")).toBeUndefined();
    });
});
