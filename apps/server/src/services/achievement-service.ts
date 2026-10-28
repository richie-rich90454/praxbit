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
    "browser-html": "html",
    "browser-css": "css",
    "browser-git": "git",
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
            const language = LANGUAGE_BY_RUNTIME[mission.runtime.kind];
            if (language !== undefined) {
                languages.add(language);
            }
        }

        const context: AchievementContext = {
            evidence,
            completedMissionIds,
            // shortcut: the current sync contract has no verified project-completion signal, so this stays unearned.
            projectsCompleted: 0,
            clubEventsCompleted,
            worldRecovered: isWorldRecovered(world),
            languagesDemonstrated: [...languages],
            hiddenBoundaryFound: false,
            difficultDebuggingRecovered: false,
            teammateHelped: false,
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
