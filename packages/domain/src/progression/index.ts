import type {
    AchievementDefinition,
    EvidenceSubmission,
    Mission,
} from "@praxbit/contracts";

export interface LevelProgress {
    readonly level: number;
    readonly experience: number;
    readonly intoLevel: number;
    readonly levelSpan: number;
    readonly nextLevelAt: number;
}

export function experienceThreshold(level: number): number {
    const safe = Math.max(1, level);
    return 120 * (safe - 1) * (safe - 1);
}

export function levelForExperience(experience: number): number {
    let level = 1;
    while (experienceThreshold(level + 1) <= experience) {
        level += 1;
    }
    return level;
}

export function levelProgress(experience: number): LevelProgress {
    const level = levelForExperience(experience);
    const floor = experienceThreshold(level);
    const nextLevelAt = experienceThreshold(level + 1);
    return {
        level,
        experience,
        intoLevel: experience - floor,
        levelSpan: nextLevelAt - floor,
        nextLevelAt,
    };
}

export interface AchievementContext {
    readonly evidence: readonly EvidenceSubmission[];
    readonly completedMissionIds: readonly string[];
    readonly projectsCompleted: number;
    readonly clubEventsCompleted: number;
    readonly worldRecovered: boolean;
    readonly languagesDemonstrated: readonly string[];
    readonly hiddenBoundaryFound: boolean;
    readonly difficultDebuggingRecovered: boolean;
    readonly teammateHelped: boolean;
}

export function satisfiesAchievement(
    definition: AchievementDefinition,
    context: AchievementContext,
): boolean {
    switch (definition.rule) {
        case "first-independent-transfer":
            return context.evidence.some(function independentTransfer(item: EvidenceSubmission): boolean {
                return item.category === "transfer" && item.outcome === "success" && item.assistance === "independent";
            });
        case "three-boundary-tests":
            return (
                context.evidence.filter(function testing(item: EvidenceSubmission): boolean {
                    return item.category === "testing" && item.outcome === "success";
                }).length >= 3 || context.hiddenBoundaryFound
            );
        case "five-debugging-successes":
            return (
                context.evidence.filter(function debugging(item: EvidenceSubmission): boolean {
                    return item.category === "debugging" && item.outcome === "success";
                }).length >= 5 || context.difficultDebuggingRecovered
            );
        case "team-event-participation":
            return context.clubEventsCompleted >= 1 || context.teammateHelped;
        case "first-project-complete":
            return context.projectsCompleted >= 1;
        case "three-ai-reviews":
            return (
                context.evidence.filter(function review(item: EvidenceSubmission): boolean {
                    return item.category === "review" && item.outcome === "success";
                }).length >= 3
            );
        case "second-language":
            return context.languagesDemonstrated.length >= 2;
        case "world-recovered":
            return context.worldRecovered;
        default:
            return false;
    }
}

export function earnedAchievements(
    definitions: readonly AchievementDefinition[],
    existingIds: readonly string[],
    context: AchievementContext,
): readonly AchievementDefinition[] {
    const existing = new Set(existingIds);
    return definitions.filter(function earned(definition: AchievementDefinition): boolean {
        return !existing.has(definition.id) && satisfiesAchievement(definition, context);
    });
}

export interface CompletionReward {
    readonly experience: number;
    readonly independent: boolean;
    readonly unlockedMissionIds: readonly string[];
}

export function completionReward(mission: Mission, independent: boolean): CompletionReward {
    return {
        experience: independent ? Math.round(mission.rewards.experience * 1.15) : mission.rewards.experience,
        independent,
        unlockedMissionIds: mission.rewards.unlocks,
    };
}
