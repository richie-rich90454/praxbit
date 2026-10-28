import type { Mission, ReviewItem, SkillDefinition } from "@praxbit/contracts";
import type { SkillGraph } from "../skills/graph.ts";

export type ChallengeLevel = "gentle" | "standard" | "stretch";
export type SessionLength = "short" | "medium" | "long";

export interface RecommendationContext {
    readonly graph: SkillGraph;
    readonly missions: readonly Mission[];
    readonly mastery: Readonly<Record<string, number>>;
    readonly reviews: readonly ReviewItem[];
    readonly interests: readonly string[];
    readonly challenge: ChallengeLevel;
    readonly completedMissionIds: readonly string[];
    readonly completedSequences: Readonly<Record<string, number>>;
    readonly misconceptionSkills: readonly string[];
    readonly recentFailureSkills: readonly string[];
    readonly skippedSkills: readonly string[];
    readonly now: Date;
    readonly variationSeed: number;
}

export interface MissionRecommendation {
    readonly missionId: string;
    readonly score: number;
    readonly reasons: readonly string[];
    readonly alternatives: readonly { readonly missionId: string; readonly score: number }[];
}

const MASTERY_ELIGIBILITY = 0.6;

function intersectionSize(left: readonly string[], right: readonly string[]): number {
    const set = new Set(left);
    let count = 0;
    for (const item of right) {
        if (set.has(item)) {
            count += 1;
        }
    }
    return count;
}

function stringHash(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}

export function recommendMission(context: RecommendationContext): MissionRecommendation | undefined {
    const dueSkillIds = new Set(
        context.reviews
            .filter(function isDue(review: ReviewItem): boolean {
                return new Date(review.dueAt).getTime() <= context.now.getTime();
            })
            .map(function skillOf(review: ReviewItem): string {
                return review.skillId;
            }),
    );
    const completed = new Set(context.completedMissionIds);
    const skipped = new Set(context.skippedSkills);
    const weakSkills = Object.entries(context.mastery)
        .filter(function isWeak(entry): boolean {
            return entry[1] < 0.5;
        })
        .map(function skillId(entry): string {
            return entry[0];
        });

    const scored: { mission: Mission; score: number; reasons: string[] }[] = [];

    for (const mission of context.missions) {
        const eligible =
            mission.prerequisites.length === 0 ||
            mission.prerequisites.every(function ready(skillId: string): boolean {
                return skipped.has(skillId) || (context.mastery[skillId] ?? 0) >= MASTERY_ELIGIBILITY;
            });
        if (!eligible) {
            continue;
        }

        const dueMatches = mission.skills.filter(function due(skillId: string): boolean {
            return dueSkillIds.has(skillId);
        }).length;
        const isCompleted = completed.has(mission.id);
        if (isCompleted && dueMatches === 0) {
            continue;
        }

        const reasons: string[] = [];
        let score = 0;

        if (dueMatches > 0) {
            score += Math.min(120, dueMatches * 60);
            reasons.push("Review is due for a skill this mission practices.");
        }
        if (isCompleted) {
            score -= 20;
            reasons.push("This mission is a review of completed work.");
        }

        const weakMatches = mission.skills.filter(function weak(skillId: string): boolean {
            return weakSkills.includes(skillId);
        }).length;
        if (weakMatches > 0 && !isCompleted) {
            score += weakMatches * 10;
            reasons.push("It strengthens a skill with limited evidence.");
        }

        const misconceptionMatches = intersectionSize(mission.skills, context.misconceptionSkills);
        if (misconceptionMatches > 0 && !isCompleted) {
            score += 18 * misconceptionMatches;
            reasons.push("It revisits a misconception you encountered.");
        }

        const failureMatches = intersectionSize(mission.skills, context.recentFailureSkills);
        if (failureMatches > 0) {
            score += 8 * failureMatches;
            reasons.push("It offers another attempt at a recent difficulty.");
        }

        const interestMatches = intersectionSize(mission.tags, context.interests);
        if (interestMatches > 0) {
            score += 14 * interestMatches;
            reasons.push("It matches your selected interests.");
        }

        const lastSequence = context.completedSequences[mission.courseId] ?? 0;
        if (mission.sequence === lastSequence + 1) {
            score += 22;
            reasons.push("It continues the story where you stopped.");
        } else if (mission.sequence <= lastSequence) {
            score -= 15;
        }

        const difficultyFit = challengeFit(mission, context.challenge);
        score += difficultyFit;
        if (difficultyFit >= 10) {
            reasons.push("The difficulty matches your selected challenge level.");
        }

        if (reasons.length === 0) {
            reasons.push("It is the next eligible step in the curriculum.");
        }

        const jitter = (stringHash(mission.id) + context.variationSeed) % 5 === 0 ? 1 : 0;
        scored.push({ mission, score: score + jitter, reasons });
    }

    if (scored.length === 0) {
        return undefined;
    }

    scored.sort(function byScore(left, right): number {
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        return left.mission.sequence - right.mission.sequence;
    });

    const top = scored[0];
    if (top === undefined) {
        return undefined;
    }

    return {
        missionId: top.mission.id,
        score: top.score,
        reasons: top.reasons,
        alternatives: scored.slice(1, 4).map(function toAlternative(entry): { missionId: string; score: number } {
            return { missionId: entry.mission.id, score: entry.score };
        }),
    };
}

function challengeFit(mission: Mission, challenge: ChallengeLevel): number {
    if (challenge === "gentle") {
        return mission.difficulty === "beginner" ? 12 : mission.difficulty === "developing" ? 4 : -8;
    }
    if (challenge === "stretch") {
        return mission.difficulty === "advanced" ? 12 : mission.difficulty === "developing" ? 6 : -4;
    }
    return mission.difficulty === "developing" ? 8 : 4;
}

export interface PracticePlan {
    readonly missionIds: readonly string[];
    readonly dueSkillIds: readonly string[];
    readonly weakSkillIds: readonly string[];
    readonly estimatedMinutes: number;
}

export function buildPracticePlan(
    context: RecommendationContext,
    length: SessionLength,
): PracticePlan {
    const size = length === "short" ? 1 : length === "medium" ? 2 : 4;
    const dueSkillIds = context.reviews
        .filter(function isDue(review: ReviewItem): boolean {
            return new Date(review.dueAt).getTime() <= context.now.getTime();
        })
        .map(function skillOf(review: ReviewItem): string {
            return review.skillId;
        });
    const weakSkillIds = Object.entries(context.mastery)
        .filter(function isWeak(entry): boolean {
            return entry[1] < 0.55 && entry[1] > 0;
        })
        .sort(function lowestFirst(left, right): number {
            return left[1] - right[1];
        })
        .map(function skillId(entry): string {
            return entry[0];
        });

    const selected: Mission[] = [];
    const selectedIds = new Set<string>();
    const totalSkills = [...dueSkillIds, ...weakSkillIds, ...context.interests];

    function addMission(mission: Mission): void {
        if (selected.length >= size || selectedIds.has(mission.id)) {
            return;
        }
        selected.push(mission);
        selectedIds.add(mission.id);
    }

    for (const skillId of totalSkills) {
        for (const mission of context.missions) {
            if (mission.skills.includes(skillId)) {
                addMission(mission);
            }
            if (selected.length >= size) {
                break;
            }
        }
    }

    if (selected.length === 0) {
        for (const mission of context.missions) {
            addMission(mission);
        }
    }

    const estimatedMinutes = selected.reduce(function total(sum: number, mission: Mission): number {
        return sum + mission.estimatedMinutes;
    }, 0);

    return {
        missionIds: selected.map(function idOf(mission: Mission): string {
            return mission.id;
        }),
        dueSkillIds,
        weakSkillIds: weakSkillIds.slice(0, 5),
        estimatedMinutes,
    };
}

export function skillsForMission(missions: readonly Mission[], missionId: string): readonly string[] {
    const mission = missions.find(function matches(item: Mission): boolean {
        return item.id === missionId;
    });
    return mission?.skills ?? [];
}

export function requiredConcepts(graph: SkillGraph, mission: Mission): readonly SkillDefinition[] {
    return mission.skills
        .map(function toSkill(skillId: string): SkillDefinition | undefined {
            return graph.getSkill(skillId);
        })
        .filter(function present(skill: SkillDefinition | undefined): skill is SkillDefinition {
            return skill !== undefined;
        });
}
