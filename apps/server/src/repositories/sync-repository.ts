import { SyncResultSchema, type SyncResult } from "@praxbit/contracts";
import type { QueryExecutor } from "../db/rows.ts";

type SyncOperationRow = {
    user_id: string;
    operation_id: string;
    kind: SyncResult["kind"];
    status: SyncResult["status"];
    code: string | null;
    message: string | null;
    revision: number | null;
    world_version: number | null;
    result: unknown;
    created_at: Date | string;
};

export interface StoredSyncOperation {
    readonly operationId: string;
    readonly kind: SyncResult["kind"];
    readonly result: SyncResult;
}

export class SyncRepository {
    public async findOperation(
        executor: QueryExecutor,
        userId: string,
        operationId: string,
    ): Promise<StoredSyncOperation | undefined> {
        const result = await executor.query<SyncOperationRow>(
            `
                SELECT user_id, operation_id, kind, status, code, message, revision, world_version, result, created_at
                FROM sync_operations
                WHERE user_id = $1 AND operation_id = $2
            `,
            [userId, operationId],
        );
        const row = result.rows[0];
        if (row === undefined) {
            return undefined;
        }
        return {
            operationId: row.operation_id,
            kind: row.kind,
            result: SyncResultSchema.parse(row.result),
        };
    }

    public async saveOperation(
        executor: QueryExecutor,
        userId: string,
        result: SyncResult,
        now: Date,
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO sync_operations (
                    user_id, operation_id, kind, status, code, message, revision, world_version, result, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
                ON CONFLICT (user_id, operation_id) DO NOTHING
            `,
            [
                userId,
                result.operationId,
                result.kind,
                result.status,
                result.code ?? null,
                result.message ?? null,
                result.revision ?? null,
                result.worldVersion ?? null,
                JSON.stringify(result),
                now,
            ],
        );
    }
}
