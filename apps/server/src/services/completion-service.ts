import type { AchievementRecord, CompletionRecord, ReviewItem } from "@praxbit/contracts";
import {
    ReviewScheduler,
    completionReward,
    levelForExperience,
    recordPractice,
} from "@praxbit/domain";
import { AppError } from "../http/app-error.ts";
import type { ContentCatalog } from "../content/catalog.ts";
import type { QueryExecutor } from "../db/rows.ts";
import type { EvidenceRepository } from "../repositories/evidence-repository.ts";
import type { MissionRepository } from "../repositories/mission-repository.ts";
import type { UserRepository } from "../repositories/user-repository.ts";
import type { AchievementService } from "./achievement-service.ts";

export interface CompletionInput {
    readonly missionId: string;
    readonly missionVersion: number;
    readonly attemptId: string;
    readonly independent: boolean;
    readonly completedAt: string;
}

export interface CompletionOutcome {
    readonly status: "accepted" | "duplicate";
    readonly completion: CompletionRecord;
    readonly achievements: readonly AchievementRecord[];
}

export class CompletionService {
    private readonly content: ContentCatalog;
    private readonly users: UserRepository;
    private readonly missions: MissionRepository;
    private readonly evidence: EvidenceRepository;
    private readonly achievements: AchievementService;
    private readonly scheduler: ReviewScheduler;

    public constructor(dependencies: {
        readonly content: ContentCatalog;
        readonly users: UserRepository;
        readonly missions: MissionRepository;
        readonly evidence: EvidenceRepository;
        readonly achievements: AchievementService;
    }) {
        this.content = dependencies.content;
        this.users = dependencies.users;
        this.missions = dependencies.missions;
        this.evidence = dependencies.evidence;
        this.achievements = dependencies.achievements;
        this.scheduler = new ReviewScheduler();
    }

    public async applyCompletion(
        executor: QueryExecutor,
        userId: string,
        input: CompletionInput,
        now: Date,
    ): Promise<CompletionOutcome> {
        const mission = this.content.getMission(input.missionId);
        if (mission === undefined) {
            throw new AppError(
                404,
                "unknown_mission",
                "The completion references an unknown mission.",
            );
        }
        if (mission.version !== input.missionVersion) {
            throw new AppError(
                400,
                "mission_version_mismatch",
                "This mission has a newer version. Refresh the mission before completing it.",
            );
        }

        const completedAt = new Date(input.completedAt);
        if (completedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
            throw new AppError(
                400,
                "invalid_completion_time",
                "The completion time cannot be in the future.",
            );
        }

        const previous = await this.missions.findCompletion(
            executor,
            userId,
            mission.id,
            mission.version,
        );
        if (previous !== undefined) {
            return { status: "duplicate", completion: previous, achievements: [] };
        }

        const reward = completionReward(mission, input.independent);
        const inserted = await this.missions.insertCompletion(executor, {
            userId,
            missionId: mission.id,
            missionVersion: mission.version,
            attemptId: input.attemptId,
            completedAt,
            independent: input.independent,
            experienceAwarded: reward.experience,
        });
        if (inserted === undefined) {
            const existing = await this.missions.findCompletion(
                executor,
                userId,
                mission.id,
                mission.version,
            );
            if (existing === undefined) {
                throw new Error("Completion conflict without an existing completion row.");
            }
            return { status: "duplicate", completion: existing, achievements: [] };
        }

        await this.missions.completeAttempt(executor, userId, input.attemptId, completedAt);

        const progress = await this.users.getProgress(executor, userId);
        const completedDay = completedAt.toISOString().slice(0, 10);
        const practiceDay =
            progress.lastPracticeOn !== undefined && completedDay < progress.lastPracticeOn
                ? progress.lastPracticeOn
                : completedDay;
        const streak = recordPractice(
            {
                streakDays: progress.streakDays,
                longestStreak: progress.longestStreak,
                ...(progress.lastPracticeOn === undefined
                    ? {}
                    : { lastPracticeOn: progress.lastPracticeOn }),
            },
            practiceDay,
        );
        const experience = progress.experience + reward.experience;
        await this.users.saveProgress(executor, userId, {
            experience,
            level: levelForExperience(experience),
            streakDays: streak.streakDays,
            longestStreak: streak.longestStreak,
            lastPracticeOn: streak.lastPracticeOn,
            placementSkippedSkills: progress.placementSkippedSkills,
        });

        await this.advanceReviews(executor, userId, mission.skills, completedAt);
        const achievements = await this.achievements.evaluate(executor, userId, now);

        return { status: "accepted", completion: inserted, achievements };
    }

    private async advanceReviews(
        executor: QueryExecutor,
        userId: string,
        skillIds: readonly string[],
        now: Date,
    ): Promise<void> {
        const existing = await this.evidence.listReviewsForSkills(executor, userId, skillIds);
        const bySkill = new Map(
            existing.map(function entry(review: ReviewItem): [string, ReviewItem] {
                return [review.skillId, review];
            }),
        );
        for (const skillId of skillIds) {
            const previous = bySkill.get(skillId);
            const next =
                previous === undefined
                    ? this.scheduler.create(skillId, now, "success")
                    : this.scheduler.update(previous, "success", now);
            await this.evidence.saveReview(executor, userId, next);
        }
    }
}
