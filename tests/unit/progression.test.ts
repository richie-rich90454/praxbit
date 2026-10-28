import { describe, expect, it } from "vitest";
import {
    earnedAchievements,
    experienceThreshold,
    levelForExperience,
    levelProgress,
    satisfiesAchievement,
} from "../../packages/domain/src/progression/index.ts";
import type { AchievementDefinition } from "../../packages/contracts/src/index.ts";
import type { AchievementContext } from "../../packages/domain/src/progression/index.ts";
import { makeEvidence } from "./support/fixtures.ts";

function achievement(
    rule: AchievementDefinition["rule"],
    kind: AchievementDefinition["kind"],
): AchievementDefinition {
    return {
        id: `achievement.${rule}`,
        title: rule,
        description: rule,
        kind,
        rule,
    };
}

function context(overrides: Partial<AchievementContext> = {}): AchievementContext {
    return {
        evidence: [],
        completedMissionIds: [],
        projectsCompleted: 0,
        clubEventsCompleted: 0,
        worldRecovered: false,
        languagesDemonstrated: [],
        hiddenBoundaryFound: false,
        difficultDebuggingRecovered: false,
        teammateHelped: false,
        ...overrides,
    };
}

describe("progression levels", function levels(): void {
    it("maps experience to thresholds", function thresholds(): void {
        expect(experienceThreshold(0)).toBe(0);
        expect(experienceThreshold(1)).toBe(0);
        expect(experienceThreshold(2)).toBe(120);
        expect(experienceThreshold(3)).toBe(480);
    });

    it("raises the level as experience crosses a threshold", function level(): void {
        expect(levelForExperience(0)).toBe(1);
        expect(levelForExperience(119)).toBe(1);
        expect(levelForExperience(120)).toBe(2);
        expect(levelForExperience(479)).toBe(2);
        expect(levelForExperience(480)).toBe(3);
    });

    it("reports progress into the current level", function progress(): void {
        const progressView = levelProgress(180);
        expect(progressView.level).toBe(2);
        expect(progressView.intoLevel).toBe(60);
        expect(progressView.levelSpan).toBe(360);
        expect(progressView.nextLevelAt).toBe(480);
    });
});

describe("achievements", function achievements(): void {
    it("awards an independent transfer", function transfer(): void {
        const definition = achievement("first-independent-transfer", "independent-transfer");
        expect(satisfiesAchievement(definition, context())).toBe(false);
        expect(
            satisfiesAchievement(
                definition,
                context({
                    evidence: [
                        makeEvidence({
                            category: "transfer",
                            outcome: "success",
                            assistance: "independent",
                        }),
                    ],
                }),
            ),
        ).toBe(true);
    });

    it("awards boundary testing after three successes or a hidden boundary", function boundaries(): void {
        const definition = achievement("three-boundary-tests", "hidden-boundary");
        const evidence = [1, 2, 3].map(function make(index): ReturnType<typeof makeEvidence> {
            return makeEvidence({
                id: `evidence-boundary-${index}`,
                category: "testing",
                outcome: "success",
            });
        });
        expect(satisfiesAchievement(definition, context({ evidence }))).toBe(true);
        expect(satisfiesAchievement(definition, context({ hiddenBoundaryFound: true }))).toBe(true);
    });

    it("awards debugging after five successes", function debugging(): void {
        const definition = achievement("five-debugging-successes", "difficult-debugging");
        const evidence = [1, 2, 3, 4, 5].map(function make(index): ReturnType<typeof makeEvidence> {
            return makeEvidence({
                id: `evidence-debug-${index}`,
                category: "debugging",
                outcome: "success",
            });
        });
        expect(satisfiesAchievement(definition, context({ evidence }))).toBe(true);
        expect(
            satisfiesAchievement(definition, context({ difficultDebuggingRecovered: true })),
        ).toBe(true);
    });

    it("awards project, club, language, AI review, and world achievements", function others(): void {
        expect(
            satisfiesAchievement(
                achievement("first-project-complete", "authentic-project"),
                context({ projectsCompleted: 1 }),
            ),
        ).toBe(true);
        expect(
            satisfiesAchievement(
                achievement("team-event-participation", "helping-teammate"),
                context({ clubEventsCompleted: 1 }),
            ),
        ).toBe(true);
        expect(
            satisfiesAchievement(
                achievement("second-language", "new-language"),
                context({ languagesDemonstrated: ["javascript", "python"] }),
            ),
        ).toBe(true);
        expect(
            satisfiesAchievement(
                achievement("three-ai-reviews", "ai-review"),
                context({
                    evidence: [1, 2, 3].map(function make(index): ReturnType<typeof makeEvidence> {
                        return makeEvidence({
                            id: `evidence-review-${index}`,
                            category: "review",
                            outcome: "success",
                        });
                    }),
                }),
            ),
        ).toBe(true);
        expect(
            satisfiesAchievement(
                achievement("world-recovered", "recovery"),
                context({ worldRecovered: true }),
            ),
        ).toBe(true);
    });

    it("does not award an achievement twice", function once(): void {
        const definition = achievement("first-project-complete", "authentic-project");
        const earned = earnedAchievements(
            [definition],
            [definition.id],
            context({ projectsCompleted: 1 }),
        );
        expect(earned).toEqual([]);
        const newlyEarned = earnedAchievements([definition], [], context({ projectsCompleted: 1 }));
        expect(
            newlyEarned.map(function idOf(item): string {
                return item.id;
            }),
        ).toEqual([definition.id]);
    });
});
