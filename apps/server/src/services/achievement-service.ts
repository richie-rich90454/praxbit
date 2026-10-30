import type { AchievementRecord, CompletionRecord, EvidenceSubmission } from "@praxbit/contracts";
import { earnedAchievements, isWorldRecovered, type AchievementContext } from "@praxbit/domain";
import type { ContentCatalog } from "../content/catalog.ts";
import type { QueryExecutor } from "../db/rows.ts";
import type { ClubRepository } from "../repositories/club-repository.ts";
import type { UserRepository } from "../repositories/user-repository.ts";
import type { WorldRepository } from "../repositories/world-repository.ts";

const LANGUAGE_BY_RUNTIME: Readonly<Record<string, string>> = {
    "browser-javascript": "javascript",
    "browser-typescript": "typescript",
    "browser-python": "python",
    "browser-sql": "sql",
    "browser-html": "web",
    "browser-css": "web",
    "browser-git": "git",
};

const LANGUAGE_BY_SKILL_PREFIX: Readonly<Record<string, string>> = {
    js: "javascript",
    ts: "typescript",
    web: "web",
    html: "web",
    css: "web",
    python: "python",
    sql: "sql",
    java: "java",
    c: "c",
    cpp: "cpp",
    csharp: "csharp",
    go: "go",
    rust: "rust",
    kotlin: "kotlin",
    swift: "swift",
    ruby: "ruby",
    zig: "zig",
    lua: "lua",
    react: "react",
};

export class AchievementService {
    private readonly users: UserRepository;
    private readonly clubs: ClubRepository;
    private readonly worlds: WorldRepository;
    private readonly content: ContentCatalog;

    public constructor(dependencies: {
        readonly users: UserRepository;
        readonly clubs: ClubRepository;
        readonly worlds: WorldRepository;
        readonly content: ContentCatalog;
    }) {
        this.users = dependencies.users;
        this.clubs = dependencies.clubs;
        this.worlds = dependencies.worlds;
        this.content = dependencies.content;
    }

    public async evaluate(
        executor: QueryExecutor,
        userId: string,
        now: Date,
    ): Promise<readonly AchievementRecord[]> {
        const evidence: readonly EvidenceSubmission[] = await this.users.listEvidence(
            executor,
            userId,
        );
        const completions: readonly CompletionRecord[] = await this.users.listCompletions(
            executor,
            userId,
        );
        const existing: readonly AchievementRecord[] = await this.users.listAchievements(
            executor,
            userId,
        );
        const clubEventsCompleted = await this.clubs.countCompletedEventsForUser(executor, userId);
        const cooperativeChallengeCompleted = await this.clubs.hasCooperativeChallenge(
            executor,
            userId,
        );
        const world = await this.worlds.ensureWorld(executor, userId);

        const completedMissionIds = [
            ...new Set(
                completions.map(function missionOf(record: CompletionRecord): string {
                    return record.missionId;
                }),
            ),
        ];
        const languages = new Set<string>();
        for (const missionId of completedMissionIds) {
            const mission = this.content.getMission(missionId);
            if (mission === undefined) {
                continue;
            }
            const runtimeLanguage = LANGUAGE_BY_RUNTIME[mission.runtime.kind];
            if (runtimeLanguage !== undefined) {
                languages.add(runtimeLanguage);
            }
            for (const skillId of mission.skills) {
                const prefix = skillId.split(".")[0] ?? skillId;
                const skillLanguage = LANGUAGE_BY_SKILL_PREFIX[prefix];
                if (skillLanguage !== undefined) {
                    languages.add(skillLanguage);
                }
            }
        }

        const completedProjectIds = new Set<string>();
        for (const record of evidence) {
            if (
                record.category === "construction" &&
                record.outcome === "success" &&
                this.content.getProject(record.missionId) !== undefined
            ) {
                completedProjectIds.add(record.missionId);
            }
        }

        const context: AchievementContext = {
            evidence,
            completedMissionIds,
            projectsCompleted: completedProjectIds.size,
            clubEventsCompleted,
            cooperativeChallengeCompleted,
            worldRecovered: isWorldRecovered(world),
            languagesDemonstrated: [...languages],
            hiddenBoundaryFound: evidence.some(function boundary(record): boolean {
                return record.category === "testing" && record.outcome === "success";
            }),
            difficultDebuggingRecovered: evidence.some(function debugging(record): boolean {
                return record.category === "debugging" && record.outcome === "success";
            }),
            teammateHelped: clubEventsCompleted >= 1,
        };

        const newlyEarned = earnedAchievements(
            this.content.achievements,
            existing.map(function idOf(record: AchievementRecord): string {
                return record.achievementId;
            }),
            context,
        );
        if (newlyEarned.length === 0) {
            return [];
        }
        return this.users.grantAchievements(
            executor,
            userId,
            newlyEarned.map(function idOf(definition): string {
                return definition.id;
            }),
            now,
        );
    }
}
