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
    readonly completedMissionSkills?: readonly string[];
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
const DAY_MS = 86_400_000;

export const PRACTICE_BUDGET_MINUTES: Readonly<Record<SessionLength, number>> = {
    short: 5,
    medium: 12,
    long: 25,
};

const PRACTICE_ACTIVITY_LIMIT: Readonly<Record<SessionLength, number>> = {
    short: 1,
    medium: 3,
    long: 4,
};

interface ScoringSets {
    readonly dueSkillIds: ReadonlySet<string>;
    readonly completed: ReadonlySet<string>;
    readonly skipped: ReadonlySet<string>;
    readonly completedSkills: ReadonlySet<string>;
    readonly weakSkills: ReadonlySet<string>;
}

interface ScoredMission {
    readonly mission: Mission;
    readonly score: number;
    readonly reasons: readonly string[];
    readonly dueMatches: number;
}

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

function dueSkillIds(context: RecommendationContext): readonly string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const review of context.reviews) {
        if (new Date(review.dueAt).getTime() > context.now.getTime() || seen.has(review.skillId)) {
            continue;
        }
        seen.add(review.skillId);
        ids.push(review.skillId);
    }
    return ids;
}

function scoringSets(context: RecommendationContext): ScoringSets {
    return {
        dueSkillIds: new Set(dueSkillIds(context)),
        completed: new Set(context.completedMissionIds),
        skipped: new Set(context.skippedSkills),
        completedSkills: new Set(context.completedMissionSkills ?? []),
        weakSkills: new Set(
            Object.entries(context.mastery)
                .filter(function isWeak(entry): boolean {
                    return entry[1] < 0.5;
                })
                .map(function skillId(entry): string {
                    return entry[0];
                }),
        ),
    };
}

function scoreMission(
    mission: Mission,
    context: RecommendationContext,
    sets: ScoringSets,
): ScoredMission | undefined {
    const eligible =
        mission.prerequisites.length === 0 ||
        mission.prerequisites.every(function ready(skillId: string): boolean {
            return (
                sets.skipped.has(skillId) ||
                sets.completedSkills.has(skillId) ||
                (context.mastery[skillId] ?? 0) >= MASTERY_ELIGIBILITY
            );
        });
    if (!eligible) {
        return undefined;
    }

    const dueMatches = mission.skills.filter(function due(skillId: string): boolean {
        return sets.dueSkillIds.has(skillId);
    }).length;
    const isCompleted = sets.completed.has(mission.id);
    if (isCompleted && dueMatches === 0) {
        return undefined;
    }

    const reasons: string[] = [];
    let score = 0;
    let overdueDays = 0;

    if (dueMatches > 0) {
        score += Math.min(120, dueMatches * 60);
        reasons.push("Review is due for a skill this mission practices.");
        for (const review of context.reviews) {
            if (!mission.skills.includes(review.skillId)) {
                continue;
            }
            const due = new Date(review.dueAt).getTime();
            if (due <= context.now.getTime()) {
                overdueDays = Math.max(
                    overdueDays,
                    Math.floor((context.now.getTime() - due) / DAY_MS),
                );
            }
        }
        score += Math.min(30, overdueDays * 5);
    }
    if (isCompleted) {
        score -= 20;
        reasons.push("This mission is a review of completed work.");
    }

    const weakMatches = mission.skills.filter(function weak(skillId: string): boolean {
        return sets.weakSkills.has(skillId);
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

    const novelSkills = mission.skills.filter(function novel(skillId: string): boolean {
        return !sets.completedSkills.has(skillId);
    }).length;
    if (novelSkills > 0 && sets.completedSkills.size > 0 && !isCompleted) {
        score += Math.min(8, novelSkills * 4);
        reasons.push("It introduces a skill outside your recent work.");
    }

    if (reasons.length === 0) {
        reasons.push("It is the next eligible step in the curriculum.");
    }

    return { mission, score, reasons, dueMatches };
}

function compareScored(left: ScoredMission, right: ScoredMission): number {
    if (right.score !== left.score) {
        return right.score - left.score;
    }
    if (right.dueMatches !== left.dueMatches) {
        return right.dueMatches - left.dueMatches;
    }
    if (left.mission.estimatedMinutes !== right.mission.estimatedMinutes) {
        return left.mission.estimatedMinutes - right.mission.estimatedMinutes;
    }
    if (left.mission.sequence !== right.mission.sequence) {
        return left.mission.sequence - right.mission.sequence;
    }
    if (left.mission.id === right.mission.id) {
        return 0;
    }
    return left.mission.id < right.mission.id ? -1 : 1;
}

export function recommendMission(
    context: RecommendationContext,
): MissionRecommendation | undefined {
    const sets = scoringSets(context);
    const scored: ScoredMission[] = [];
    for (const mission of context.missions) {
        const candidate = scoreMission(mission, context, sets);
        if (candidate !== undefined) {
            scored.push(candidate);
        }
    }

    if (scored.length === 0) {
        return undefined;
    }

    scored.sort(compareScored);

    const top = scored[0];
    if (top === undefined) {
        return undefined;
    }

    return {
        missionId: top.mission.id,
        score: top.score,
        reasons: top.reasons,
        alternatives: scored.slice(1, 4).map(function toAlternative(entry): {
            missionId: string;
            score: number;
        } {
            return { missionId: entry.mission.id, score: entry.score };
        }),
    };
}

function challengeFitsPlan(
    mission: Mission,
    context: RecommendationContext,
    dueMatches: number,
): boolean {
    const needsReview = dueMatches > 0;
    const needsRepair =
        intersectionSize(mission.skills, context.recentFailureSkills) > 0 ||
        intersectionSize(mission.skills, context.misconceptionSkills) > 0;
    if (context.challenge === "gentle" && mission.difficulty === "advanced") {
        return needsReview || needsRepair;
    }
    if (context.challenge === "stretch" && mission.difficulty === "beginner") {
        return needsReview;
    }
    return true;
}

function challengeFit(mission: Mission, challenge: ChallengeLevel): number {
    if (challenge === "gentle") {
        return mission.difficulty === "beginner"
            ? 12
            : mission.difficulty === "developing"
              ? 4
              : -8;
    }
    if (challenge === "stretch") {
        return mission.difficulty === "advanced"
            ? 12
            : mission.difficulty === "developing"
              ? 6
              : -4;
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
    const sets = scoringSets(context);
    const budget = PRACTICE_BUDGET_MINUTES[length];
    const limit = PRACTICE_ACTIVITY_LIMIT[length];
    const due = dueSkillIds(context);
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

    const candidates: ScoredMission[] = [];
    for (const mission of context.missions) {
        if (mission.estimatedMinutes > budget) {
            continue;
        }
        const candidate = scoreMission(mission, context, sets);
        if (candidate !== undefined && challengeFitsPlan(mission, context, candidate.dueMatches)) {
            candidates.push(candidate);
        }
    }
    candidates.sort(compareScored);

    const selected: Mission[] = [];
    const selectedIds = new Set<string>();
    const selectedCourses = new Set<string>();

    function add(mission: Mission): void {
        const total = selected.reduce(function sumMinutes(sum: number, item: Mission): number {
            return sum + item.estimatedMinutes;
        }, 0);
        if (
            selected.length >= limit ||
            selectedIds.has(mission.id) ||
            total + mission.estimatedMinutes > budget
        ) {
            return;
        }
        selected.push(mission);
        selectedIds.add(mission.id);
        selectedCourses.add(mission.courseId);
    }

    for (const candidate of candidates) {
        if (!selectedCourses.has(candidate.mission.courseId)) {
            add(candidate.mission);
        }
    }
    for (const candidate of candidates) {
        add(candidate.mission);
    }

    const estimatedMinutes = selected.reduce(function total(sum: number, mission: Mission): number {
        return sum + mission.estimatedMinutes;
    }, 0);

    return {
        missionIds: selected.map(function idOf(mission: Mission): string {
            return mission.id;
        }),
        dueSkillIds: due,
        weakSkillIds: weakSkillIds.slice(0, 5),
        estimatedMinutes,
    };
}

export function skillsForMission(
    missions: readonly Mission[],
    missionId: string,
): readonly string[] {
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
