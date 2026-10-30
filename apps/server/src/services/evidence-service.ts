import {
    type AchievementRecord,
    type EvidenceResult,
    type EvidenceSubmission,
    type ReviewItem,
    type SkillMastery,
} from "@praxbit/contracts";
import {
    DEFAULT_MASTERY_CONFIG,
    MasteryEstimator,
    ReviewScheduler,
    expandEvidenceSkills,
    type WeightedEvidence,
} from "@praxbit/domain";
import { AppError } from "../http/app-error.ts";
import type { ContentCatalog } from "../content/catalog.ts";
import type { QueryExecutor } from "../db/rows.ts";
import { lockUserLearning } from "../db/locks.ts";
import type {
    EvidenceRepository,
    WeightedEvidenceEntry,
} from "../repositories/evidence-repository.ts";
import type { UserRepository } from "../repositories/user-repository.ts";
import type { AchievementService } from "./achievement-service.ts";

export class EvidenceService {
    private readonly content: ContentCatalog;
    private readonly users: UserRepository;
    private readonly evidence: EvidenceRepository;
    private readonly achievements: AchievementService;
    private readonly estimator: MasteryEstimator;
    private readonly scheduler: ReviewScheduler;

    public constructor(dependencies: {
        readonly content: ContentCatalog;
        readonly users: UserRepository;
        readonly evidence: EvidenceRepository;
        readonly achievements: AchievementService;
    }) {
        this.content = dependencies.content;
        this.users = dependencies.users;
        this.evidence = dependencies.evidence;
        this.achievements = dependencies.achievements;
        this.estimator = new MasteryEstimator(DEFAULT_MASTERY_CONFIG);
        this.scheduler = new ReviewScheduler();
    }

    public async applyEvidence(
        executor: QueryExecutor,
        userId: string,
        submission: EvidenceSubmission,
        now: Date,
    ): Promise<EvidenceResult> {
        await lockUserLearning(executor, userId);
        const missionSkills = this.resolveEvidenceSkills(submission);
        const skillWeights = expandEvidenceSkills(this.content.skillGraph, missionSkills);
        const inserted = await this.evidence.insertEvidence(
            executor,
            userId,
            submission,
            skillWeights,
        );
        const affectedSkillIds = [...skillWeights.keys()];

        let earned: readonly AchievementRecord[] = [];
        if (inserted) {
            await this.recomputeMastery(executor, userId, affectedSkillIds, now);
            if (submission.category === "review") {
                const reviewOutcome =
                    submission.outcome === "success" &&
                    submission.assistance === "independent" &&
                    submission.independence >= 1
                        ? "success"
                        : "failure";
                await this.advanceReviews(executor, userId, missionSkills, reviewOutcome, now);
            }
            earned = await this.achievements.evaluate(executor, userId, now);
        }

        const allMastery = await this.users.listMastery(executor, userId);
        const affected = new Set(affectedSkillIds);
        const mastery: readonly SkillMastery[] = allMastery.filter(function isAffected(
            row: SkillMastery,
        ): boolean {
            return affected.has(row.skillId);
        });
        const reviews: readonly ReviewItem[] = await this.evidence.listReviewsForSkills(
            executor,
            userId,
            affectedSkillIds,
        );
        const progress = await this.users.getProgress(executor, userId);

        return {
            accepted: true,
            mastery: [...mastery],
            reviews: [...reviews],
            progress,
            achievements: [...earned],
        };
    }

    private resolveEvidenceSkills(submission: EvidenceSubmission): readonly string[] {
        const mission = this.content.getMission(submission.missionId);
        if (mission !== undefined) {
            if (mission.version !== submission.missionVersion) {
                throw new AppError(
                    400,
                    "mission_version_mismatch",
                    "This mission has a newer version. Refresh the mission before submitting evidence.",
                );
            }
            return mission.skills;
        }
        const project = this.content.getProject(submission.missionId);
        if (project !== undefined) {
            return project.skills;
        }
        throw new AppError(
            404,
            "unknown_mission",
            "The evidence does not reference a known mission or project.",
        );
    }

    private async recomputeMastery(
        executor: QueryExecutor,
        userId: string,
        skillIds: readonly string[],
        now: Date,
    ): Promise<void> {
        const grouped = await this.evidence.listWeightedEvidence(executor, userId, skillIds);
        for (const skillId of skillIds) {
            const entries = grouped.get(skillId) ?? [];
            const weighted: WeightedEvidence[] = entries.map(function toWeighted(
                entry: WeightedEvidenceEntry,
            ): WeightedEvidence {
                return { evidence: entry.evidence, skillWeight: entry.skillWeight };
            });
            const mastery = this.estimator.estimate(skillId, weighted, now);
            await this.evidence.saveMastery(executor, userId, mastery);
        }
    }

    private async advanceReviews(
        executor: QueryExecutor,
        userId: string,
        skillIds: readonly string[],
        outcome: "success" | "failure",
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
                    ? this.scheduler.create(skillId, now, outcome)
                    : this.scheduler.update(previous, outcome, now);
            await this.evidence.saveReview(executor, userId, next);
        }
    }
}
