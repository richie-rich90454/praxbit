import { describe, expect, it } from "vitest";
import { SkillGraph } from "../../packages/domain/src/skills/graph.ts";
import {
    PRACTICE_BUDGET_MINUTES,
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

    it("breaks score ties by mission id, not input order", function tieBreak(): void {
        const alpha = makeMission({
            id: "campus.alpha",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
        });
        const beta = makeMission({
            id: "campus.beta",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
        });
        const forward = recommendMission(context({ missions: [alpha, beta] }));
        const reverse = recommendMission(context({ missions: [beta, alpha] }));
        expect(forward?.missionId).toBe("campus.alpha");
        expect(reverse?.missionId).toBe("campus.alpha");
    });

    it("rewards a mission that introduces a skill outside recent work", function variety(): void {
        const repeated = makeMission({
            id: "campus.repeated",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
        });
        const fresh = makeMission({
            id: "campus.fresh",
            sequence: 3,
            skills: ["js.conditions"],
            prerequisites: [],
        });
        const result = recommendMission(
            context({
                missions: [repeated, fresh],
                completedMissionSkills: ["js.events"],
            }),
        );
        expect(result?.missionId).toBe("campus.fresh");
        expect(result?.reasons).toContain("It introduces a skill outside your recent work.");
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

    it("keeps a short plan inside five minutes and excludes longer incidents", function shortBudget(): void {
        const incident = makeMission({
            id: "campus.long-incident",
            sequence: 2,
            skills: ["js.events"],
            estimatedMinutes: 10,
            prerequisites: [],
            persistence: { kind: "world-action", action: "restart-service" },
        });
        const quick = makeMission({
            id: "campus.quick",
            sequence: 3,
            skills: ["js.events"],
            estimatedMinutes: 4,
            prerequisites: [],
        });
        const plan = buildPracticePlan(
            context({
                missions: [incident, quick],
                reviews: [review("js.events", "2026-10-27T00:00:00.000Z")],
            }),
            "short",
        );
        expect(plan.missionIds).toEqual(["campus.quick"]);
        expect(plan.estimatedMinutes).toBeLessThanOrEqual(PRACTICE_BUDGET_MINUTES.short);
    });

    it("keeps every selected length inside its budget", function budgets(): void {
        const missions = [2, 3, 4, 5].map(function make(index): ReturnType<typeof makeMission> {
            return makeMission({
                id: `campus.budget-${index}`,
                sequence: index + 1,
                courseId: `course-${index}`,
                skills: ["js.events"],
                estimatedMinutes: 5,
                prerequisites: [],
            });
        });
        const reviews = missions.map(function due(mission): ReviewItem {
            return review(mission.skills[0] ?? "js.events", "2026-10-27T00:00:00.000Z");
        });
        for (const length of ["short", "medium", "long"] as const) {
            const plan = buildPracticePlan(context({ missions, reviews }), length);
            expect(plan.estimatedMinutes).toBeLessThanOrEqual(PRACTICE_BUDGET_MINUTES[length]);
            expect(new Set(plan.missionIds).size).toBe(plan.missionIds.length);
            const courses = plan.missionIds.map(function courseOf(missionId): string {
                return (
                    missions.find(function match(mission): boolean {
                        return mission.id === missionId;
                    })?.courseId ?? ""
                );
            });
            expect(new Set(courses).size).toBe(courses.length);
        }
    });

    it("filters ineligible and completed missions without a due review", function eligibility(): void {
        const locked = makeMission({
            id: "campus.locked",
            sequence: 2,
            skills: ["js.conditions"],
            prerequisites: ["concept.base"],
            estimatedMinutes: 4,
        });
        const finished = makeMission({
            id: "campus.finished",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
            estimatedMinutes: 4,
        });
        const ready = makeMission({
            id: "campus.ready",
            sequence: 3,
            skills: ["js.events"],
            prerequisites: [],
            estimatedMinutes: 4,
        });
        const plan = buildPracticePlan(
            context({
                missions: [locked, finished, ready],
                mastery: { "concept.base": 0.2 },
                completedMissionIds: ["campus.finished"],
                reviews: [review("js.events", "2026-10-27T00:00:00.000Z")],
            }),
            "short",
        );
        expect(plan.missionIds).toEqual(["campus.ready"]);
    });

    it("prefers the selected challenge level", function challenge(): void {
        const beginner = makeMission({
            id: "campus.beginner",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
            estimatedMinutes: 4,
            difficulty: "beginner",
        });
        const advanced = makeMission({
            id: "campus.advanced",
            sequence: 3,
            skills: ["js.conditions"],
            prerequisites: [],
            estimatedMinutes: 4,
            difficulty: "advanced",
        });
        const plan = buildPracticePlan(
            context({
                missions: [beginner, advanced],
                challenge: "stretch",
                reviews: [
                    review("js.events", "2026-10-27T00:00:00.000Z"),
                    review("js.conditions", "2026-10-27T00:00:00.000Z"),
                ],
            }),
            "short",
        );
        expect(plan.missionIds).toEqual(["campus.advanced"]);
    });

    it("excludes a challenge level the learner did not choose for practice", function gentle(): void {
        const advanced = makeMission({
            id: "campus.advanced",
            sequence: 2,
            skills: ["js.conditions"],
            prerequisites: [],
            estimatedMinutes: 4,
            difficulty: "advanced",
        });
        const beginner = makeMission({
            id: "campus.beginner",
            sequence: 3,
            skills: ["js.events"],
            prerequisites: [],
            estimatedMinutes: 4,
            difficulty: "beginner",
        });
        const plan = buildPracticePlan(
            context({ missions: [advanced, beginner], challenge: "gentle" }),
            "short",
        );
        expect(plan.missionIds).toEqual(["campus.beginner"]);
    });

    it("breaks plan ties by mission id, not input order", function planTieBreak(): void {
        const alpha = makeMission({
            id: "campus.alpha",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
            estimatedMinutes: 4,
        });
        const beta = makeMission({
            id: "campus.beta",
            sequence: 2,
            skills: ["js.events"],
            prerequisites: [],
            estimatedMinutes: 4,
        });
        const forward = buildPracticePlan(context({ missions: [alpha, beta] }), "short");
        const reverse = buildPracticePlan(context({ missions: [beta, alpha] }), "short");
        expect(forward.missionIds).toEqual(["campus.alpha"]);
        expect(reverse.missionIds).toEqual(["campus.alpha"]);
    });
});
