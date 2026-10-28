import { describe, expect, it } from "vitest";
import { validateContentDocuments } from "../../packages/content-validator/src/index.ts";
import type { LoadedContent } from "../../packages/content-validator/src/index.ts";
import type { Mission } from "../../packages/contracts/src/index.ts";
import { makeMission, makeSkill, makeSkillDocument } from "./support/fixtures.ts";

function loadedContent(missions: readonly Mission[] = []): LoadedContent {
    return {
        skills: makeSkillDocument([makeSkill("concept.testing")]),
        tracks: [],
        missions,
        placement: { version: 1, questions: [], recommendations: [] },
        projects: [],
        achievements: [],
        events: [],
        missionPaths: new Map(
            missions.map(function toEntry(mission): [string, string] {
                return [mission.id, `content/mission/${mission.id}.json`];
            }),
        ),
        rawFiles: [],
        issues: [],
    };
}

describe("validateContentDocuments", function contentValidator(): void {
    it("reports duplicate skill ids even though SkillGraph deduplicates them", function duplicateSkills(): void {
        const content = loadedContent();
        content.skills.skills.push(makeSkill("concept.testing"));
        const issues = validateContentDocuments(content);
        expect(
            issues.some(function duplicate(issue): boolean {
                return issue.code === "duplicate-skill-id";
            }),
        ).toBe(true);
    });

    it("reports unknown assets, missing skills, and missing tracks", function missionChecks(): void {
        const mission = makeMission({
            id: "campus.broken",
            skills: ["concept.missing"],
            assets: ["pip:unknown", "scene:elsewhere", "system:unknown", "icon:ok"],
        });
        const issues = validateContentDocuments(loadedContent([mission]));
        const codes = issues.map(function codeOf(issue): string {
            return issue.code;
        });
        expect(codes).toContain("mission-skill-missing");
        expect(codes).toContain("unknown-pip-pose");
        expect(codes).toContain("unknown-scene");
        expect(codes).toContain("unknown-system");
        expect(codes).toContain("mission-not-in-track");
    });

    it("reports a misconception that points at a missing step", function misconceptionStep(): void {
        const mission = makeMission({
            misconceptions: [
                {
                    id: "one",
                    description: "First.",
                    stepId: "missing-step",
                    feedback: "Feedback one.",
                },
                {
                    id: "two",
                    description: "Second.",
                    stepId: "missing-step",
                    feedback: "Feedback two.",
                },
            ],
        });
        const issues = validateContentDocuments(loadedContent([mission]));
        expect(
            issues.filter(function missingStep(issue): boolean {
                return issue.code === "misconception-step-missing";
            }),
        ).toHaveLength(2);
    });

    it("reports a misconception answer that is not a response key", function misconceptionAnswer(): void {
        const mission = makeMission({
            misconceptions: [
                {
                    id: "one",
                    description: "First.",
                    stepId: "answer",
                    answer: "not-an-option",
                    feedback: "Feedback one.",
                },
                {
                    id: "two",
                    description: "Second.",
                    stepId: "answer",
                    feedback: "Feedback two.",
                },
            ],
        });
        const issues = validateContentDocuments(loadedContent([mission]));
        expect(
            issues.some(function unmatched(issue): boolean {
                return issue.code === "misconception-answer-unmatched";
            }),
        ).toBe(true);
    });
});
