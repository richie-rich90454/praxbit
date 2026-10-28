import type { EvidenceSubmission, ReviewItem, SkillMastery } from "@praxbit/contracts";
import {
    toEvidenceSubmission,
    toReview,
    type EvidenceRow,
    type QueryExecutor,
    type ReviewRow,
} from "../db/rows.ts";

export interface WeightedEvidenceEntry {
    readonly evidence: EvidenceSubmission;
    readonly skillWeight: number;
}

type WeightedEvidenceRow = EvidenceRow & {
    skill_id: string;
    weight: number;
};

export class EvidenceRepository {
    public async insertEvidence(
        executor: QueryExecutor,
        userId: string,
        evidence: EvidenceSubmission,
        skillWeights: ReadonlyMap<string, number>,
    ): Promise<boolean> {
        const inserted = await executor.query(
            `
                INSERT INTO learning_evidence (
                    user_id, id, mission_id, mission_version, category, outcome, assistance,
                    independence, step_id, attempt_id, detail, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (user_id, id) DO NOTHING
                RETURNING id
            `,
            [
                userId,
                evidence.id,
                evidence.missionId,
                evidence.missionVersion,
                evidence.category,
                evidence.outcome,
                evidence.assistance,
                evidence.independence,
                evidence.stepId ?? null,
                evidence.attemptId ?? null,
                evidence.detail ?? null,
                evidence.createdAt,
            ],
        );
        if ((inserted.rowCount ?? 0) === 0) {
            return false;
        }

        for (const [skillId, weight] of skillWeights) {
            await executor.query(
                `
                    INSERT INTO evidence_skills (user_id, evidence_id, skill_id, weight)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id, evidence_id, skill_id) DO UPDATE
                    SET weight = EXCLUDED.weight
                `,
                [userId, evidence.id, skillId, weight],
            );
        }
        return true;
    }

    public async listWeightedEvidence(
        executor: QueryExecutor,
        userId: string,
        skillIds: readonly string[],
    ): Promise<ReadonlyMap<string, readonly WeightedEvidenceEntry[]>> {
        const grouped = new Map<string, WeightedEvidenceEntry[]>();
        if (skillIds.length === 0) {
            return grouped;
        }
        const result = await executor.query<WeightedEvidenceRow>(
            `
                SELECT e.user_id, e.id, e.mission_id, e.mission_version, e.category, e.outcome,
                       e.assistance, e.independence, e.step_id, e.attempt_id, e.detail, e.created_at,
                       es.skill_id, es.weight
                FROM learning_evidence e
                JOIN evidence_skills es
                  ON es.user_id = e.user_id AND es.evidence_id = e.id
                WHERE e.user_id = $1 AND es.skill_id = ANY($2::text[])
                ORDER BY e.created_at ASC, e.id ASC
            `,
            [userId, skillIds],
        );

        for (const row of result.rows) {
            const entry: WeightedEvidenceEntry = {
                evidence: toEvidenceSubmission(row),
                skillWeight: row.weight,
            };
            const existing = grouped.get(row.skill_id);
            if (existing === undefined) {
                grouped.set(row.skill_id, [entry]);
            } else {
                existing.push(entry);
            }
        }
        return grouped;
    }

    public async saveMastery(
        executor: QueryExecutor,
        userId: string,
        mastery: SkillMastery,
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO skill_mastery (
                    user_id, skill_id, mastery_score, evidence_count, independent_successes,
                    assisted_successes, recent_failures, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (user_id, skill_id) DO UPDATE
                SET mastery_score = EXCLUDED.mastery_score,
                    evidence_count = EXCLUDED.evidence_count,
                    independent_successes = EXCLUDED.independent_successes,
                    assisted_successes = EXCLUDED.assisted_successes,
                    recent_failures = EXCLUDED.recent_failures,
                    updated_at = EXCLUDED.updated_at
            `,
            [
                userId,
                mastery.skillId,
                mastery.score,
                mastery.evidenceCount,
                mastery.independentSuccesses,
                mastery.assistedSuccesses,
                mastery.recentFailures,
                mastery.updatedAt,
            ],
        );
    }

    public async listReviewsForSkills(
        executor: QueryExecutor,
        userId: string,
        skillIds: readonly string[],
    ): Promise<readonly ReviewItem[]> {
        if (skillIds.length === 0) {
            return [];
        }
        const result = await executor.query<ReviewRow>(
            `
                SELECT user_id, skill_id, interval_index, due_at, last_reviewed_at, last_outcome
                FROM review_schedules
                WHERE user_id = $1 AND skill_id = ANY($2::text[])
                ORDER BY skill_id ASC
            `,
            [userId, skillIds],
        );
        return result.rows.map(toReview);
    }

    public async saveReview(
        executor: QueryExecutor,
        userId: string,
        review: ReviewItem,
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO review_schedules (
                    user_id, skill_id, interval_index, due_at, last_reviewed_at, last_outcome, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, now())
                ON CONFLICT (user_id, skill_id) DO UPDATE
                SET interval_index = EXCLUDED.interval_index,
                    due_at = EXCLUDED.due_at,
                    last_reviewed_at = EXCLUDED.last_reviewed_at,
                    last_outcome = EXCLUDED.last_outcome,
                    updated_at = now()
            `,
            [
                userId,
                review.skillId,
                review.intervalIndex,
                review.dueAt,
                review.lastReviewedAt ?? null,
                review.lastOutcome ?? null,
            ],
        );
    }
}
