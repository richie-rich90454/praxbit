import { describe, expect, it } from "vitest";
import { SkillGraph } from "../../packages/domain/src/skills/graph.ts";
import {
    buildPracticePlan,
    recommendMission,
    requiredConcepts,
    skillsForMission,
} from "../../packages/domain/src/learning/recommendation.ts";
import type { RecommendationContext } from "../../packages/domain/src/learning/recommendation.ts";
import type { ReviewItem } from "../../packages/contracts/src/index.ts";
import { makeMission, makeSkill, makeSkillDocument } from "./support/fixtures.ts";

const NOW = new Date("2026-10-28T00:00:00.000Z");

function graph(): SkillGraph {
    return new SkillGraph(
        makeSkillDocument([
            makeSkill("concept.base"),
            makeSkill("concept.conditions", ["concept.base"]),
            makeSkill("js.conditions", ["concept.conditions"], "language"),
            makeSkill("js.events", ["concept.base"], "language"),
        ]),
    );
}

function context(overrides: Partial<RecommendationContext> = {}): RecommendationContext {
    return {
        graph: graph(),
        missions: [],
        mastery: {},
        reviews: [],
        interests: [],
        challenge: "standard",
        completedMissionIds: [],
        completedSequences: {},
        misconceptionSkills: [],
        recentFailureSkills: [],
        skippedSkills: [],
        now: NOW,
        variationSeed: 7,
        ...overrides,
    };
}

function review(skillId: string, dueAt: string): ReviewItem {
    return { skillId, intervalIndex: 0, dueAt };
}

describe("recommendMission", function recommendMissionTest(): void {
    it("excludes a mission whose prerequisite is not mastered", function eligibility(): void {
        const mission = makeMission({
            id: "campus.locked",
            sequence: 2,
            skills: ["js.conditions"],
            prerequisites: ["concept.base"],
        });
        const result = recommendMission(
            context({ missions: [mission], mastery: { "concept.base": 0.4 } }),
        );
        expect(result).toBeUndefined();
    });

    it("includes a mission whose prerequisite was skipped through placement", function skipped(): void {
        const mission = makeMission({
            id: "campus.unlocked",
            sequence: 2,
            skills: ["js.conditions"],
            prerequisites: ["concept.base"],
        });
        const result = recommendMission(
            context({ missions: [mission], mastery: {}, skippedSkills: ["concept.base"] }),
        );
        expect(result?.missionId).toBe("campus.unlocked");
    });

    it("prioritizes a completed mission when its review is due", function dueReview(): void {
        const mission = makeMission({
            id: "campus.review",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
        });
        const result = recommendMission(
            context({
                missions: [mission],
                completedMissionIds: ["campus.review"],
                reviews: [review("js.events", "2026-10-27T00:00:00.000Z")],
            }),
        );
        expect(result?.missionId).toBe("campus.review");
        expect(result?.reasons).toContain("Review is due for a skill this mission practices.");
    });

    it("skips a completed mission without a due review", function completed(): void {
        const mission = makeMission({
            id: "campus.done",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
        });
        const result = recommendMission(
            context({ missions: [mission], completedMissionIds: ["campus.done"] }),
        );
        expect(result).toBeUndefined();
    });

    it("adds interest alignment", function interest(): void {
        const plain = makeMission({
            id: "campus.plain",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
            tags: ["systems"],
        });
        const interesting = makeMission({
            id: "campus.interesting",
            sequence: 3,
            skills: ["js.events"],
            prerequisites: [],
            tags: ["web"],
        });
        const result = recommendMission(
            context({
                missions: [plain, interesting],
                interests: ["web"],
                completedSequences: { campus: 2 },
            }),
        );
        expect(result?.missionId).toBe("campus.interesting");
        expect(result?.reasons).toContain("It matches your selected interests.");
    });

    it("reports misconceptions and recent failures in reasons", function signals(): void {
        const mission = makeMission({
            id: "campus.signals",
            sequence: 2,
            skills: ["js.conditions"],
            prerequisites: [],
        });
        const result = recommendMission(
            context({
                missions: [mission],
                misconceptionSkills: ["js.conditions"],
                recentFailureSkills: ["js.conditions"],
                mastery: { "js.conditions": 0.3 },
            }),
        );
        expect(result?.reasons).toContain("It revisits a misconception you encountered.");
        expect(result?.reasons).toContain("It offers another attempt at a recent difficulty.");
    });

    it("is deterministic for the same input and orders alternatives", function determinism(): void {
        const missions = [
            makeMission({
                id: "campus.one",
                sequence: 2,
                skills: ["js.events"],
                prerequisites: [],
            }),
            makeMission({
                id: "campus.two",
                sequence: 3,
                skills: ["js.events"],
                prerequisites: [],
            }),
            makeMission({
                id: "campus.three",
                sequence: 4,
                skills: ["js.events"],
                prerequisites: [],
            }),
        ];
        const first = recommendMission(context({ missions, completedSequences: { campus: 1 } }));
        const second = recommendMission(context({ missions, completedSequences: { campus: 1 } }));
        expect(first).toEqual(second);
        const scores =
            first?.alternatives.map(function scoreOf(entry): number {
                return entry.score;
            }) ?? [];
        for (let index = 1; index < scores.length; index += 1) {
            const previous = scores[index - 1] ?? 0;
            const current = scores[index] ?? 0;
            expect(previous).toBeGreaterThanOrEqual(current);
        }
    });

    it("derives skills for a mission and resolves concepts", function helpers(): void {
        const mission = makeMission({ skills: ["js.conditions"] });
        expect(skillsForMission([mission], "campus.test-mission")).toEqual(["js.conditions"]);
        expect(skillsForMission([mission], "missing")).toEqual([]);
        expect(
            requiredConcepts(graph(), mission).map(function idOf(skill): string {
                return skill.id;
            }),
        ).toEqual(["js.conditions"]);
    });
});

describe("buildPracticePlan", function practicePlan(): void {
    it("builds a short plan from a due review skill", function short(): void {
        const mission = makeMission({
            id: "campus.practice",
            sequence: 2,
            skills: ["js.events"],
            estimatedMinutes: 4,
            prerequisites: [],
        });
        const plan = buildPracticePlan(
            context({
                missions: [mission],
                reviews: [review("js.events", "2026-10-27T00:00:00.000Z")],
            }),
            "short",
        );
        expect(plan.missionIds).toEqual(["campus.practice"]);
        expect(plan.dueSkillIds).toEqual(["js.events"]);
        expect(plan.estimatedMinutes).toBe(4);
    });

    it("fills a medium plan without duplicate missions", function medium(): void {
        const first = makeMission({
            id: "campus.first",
            sequence: 2,
            skills: ["js.events"],
            estimatedMinutes: 5,
            prerequisites: [],
        });
        const second = makeMission({
            id: "campus.second",
            sequence: 3,
            skills: ["js.conditions"],
            estimatedMinutes: 6,
            prerequisites: [],
        });
        const plan = buildPracticePlan(
            context({
                missions: [first, second],
                reviews: [
                    review("js.events", "2026-10-27T00:00:00.000Z"),
                    review("js.conditions", "2026-10-27T00:00:00.000Z"),
                ],
            }),
            "medium",
        );
        expect(plan.missionIds).toHaveLength(2);
        expect(new Set(plan.missionIds).size).toBe(2);
        expect(plan.estimatedMinutes).toBe(11);
    });

    it("falls back to available missions when nothing matches", function fallback(): void {
        const mission = makeMission({
            id: "campus.fallback",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
        });
        const plan = buildPracticePlan(context({ missions: [mission] }), "long");
        expect(plan.missionIds).toEqual(["campus.fallback"]);
    });

    it("returns weak skills in ascending score order and caps the list", function weak(): void {
        const mastery: Record<string, number> = {};
        for (let index = 0; index < 8; index += 1) {
            mastery[`skill.${index}`] = 0.1 + index * 0.05;
        }
        const plan = buildPracticePlan(context({ mastery }), "short");
        expect(plan.weakSkillIds).toHaveLength(5);
        expect(plan.weakSkillIds[0]).toBe("skill.0");
    });
});
