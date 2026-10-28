import type { CompletionRecord } from "@praxbit/contracts";
import { toCompletion, type CompletionRow, type QueryExecutor } from "../db/rows.ts";

export class MissionRepository {
    public async findCompletion(
        executor: QueryExecutor,
        userId: string,
        missionId: string,
        missionVersion: number,
    ): Promise<CompletionRecord | undefined> {
        const result = await executor.query<CompletionRow>(
            `
                SELECT user_id, mission_id, mission_version, attempt_id, completed_at, independent, experience_awarded
                FROM mission_completions
                WHERE user_id = $1 AND mission_id = $2 AND mission_version = $3
            `,
            [userId, missionId, missionVersion],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : toCompletion(row);
    }

    public async insertCompletion(
        executor: QueryExecutor,
        input: {
            readonly userId: string;
            readonly missionId: string;
            readonly missionVersion: number;
            readonly attemptId: string;
            readonly completedAt: Date;
            readonly independent: boolean;
            readonly experienceAwarded: number;
        },
    ): Promise<CompletionRecord | undefined> {
        const result = await executor.query<CompletionRow>(
            `
                INSERT INTO mission_completions (
                    user_id, mission_id, mission_version, attempt_id, completed_at, independent, experience_awarded
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (user_id, mission_id, mission_version) DO NOTHING
                RETURNING user_id, mission_id, mission_version, attempt_id, completed_at, independent, experience_awarded
            `,
            [
                input.userId,
                input.missionId,
                input.missionVersion,
                input.attemptId,
                input.completedAt,
                input.independent,
                input.experienceAwarded,
            ],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : toCompletion(row);
    }

    public async insertAttempt(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly userId: string;
            readonly missionId: string;
            readonly missionVersion: number;
            readonly startedAt: Date;
        },
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO mission_attempts (id, user_id, mission_id, mission_version, started_at)
                VALUES ($1, $2, $3, $4, $5)
            `,
            [input.id, input.userId, input.missionId, input.missionVersion, input.startedAt],
        );
    }

    public async findAttempt(
        executor: QueryExecutor,
        userId: string,
        attemptId: string,
    ): Promise<{ readonly id: string } | undefined> {
        const result = await executor.query<{ id: string }>(
            `
                SELECT id
                FROM mission_attempts
                WHERE id = $1 AND user_id = $2
            `,
            [attemptId, userId],
        );
        return result.rows[0];
    }

    public async completeAttempt(
        executor: QueryExecutor,
        userId: string,
        attemptId: string,
        now: Date,
    ): Promise<void> {
        await executor.query(
            `
                UPDATE mission_attempts
                SET completed_at = $3
                WHERE id::text = $1 AND user_id = $2 AND completed_at IS NULL
            `,
            [attemptId, userId, now],
        );
    }
}
