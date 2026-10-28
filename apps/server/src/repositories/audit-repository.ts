import { toIsoString, type QueryExecutor } from "../db/rows.ts";

type AuditRow = {
    id: string;
    actor_user_id: string | null;
    action: string;
    target_type: string;
    target_id: string | null;
    request_id: string | null;
    metadata: unknown;
    created_at: Date | string;
};

export interface AuditEntry {
    readonly id: string;
    readonly actorId: string | null;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string | null;
    readonly requestId: string | null;
    readonly metadata: unknown;
    readonly createdAt: string;
}

export interface AuditPage {
    readonly items: readonly AuditEntry[];
    readonly nextCursor: string | null;
}

export interface AuditInput {
    readonly actorUserId: string | null;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string | undefined;
    readonly requestId: string | undefined;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly now: Date;
}

function toAuditEntry(row: AuditRow): AuditEntry {
    return {
        id: row.id,
        actorId: row.actor_user_id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        requestId: row.request_id,
        metadata: row.metadata,
        createdAt: toIsoString(row.created_at),
    };
}

export class AuditRepository {
    public async record(executor: QueryExecutor, input: AuditInput): Promise<void> {
        await executor.query(
            `
                INSERT INTO audit_events (
                    actor_user_id, action, target_type, target_id, request_id, metadata, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
            `,
            [
                input.actorUserId,
                input.action,
                input.targetType,
                input.targetId ?? null,
                input.requestId ?? null,
                JSON.stringify(input.metadata),
                input.now,
            ],
        );
    }

    public async list(
        executor: QueryExecutor,
        limit: number,
        cursor: string | undefined,
    ): Promise<AuditPage> {
        const cursorValue = cursor === undefined ? null : cursor;
        const result = await executor.query<AuditRow>(
            `
                SELECT id, actor_user_id, action, target_type, target_id, request_id, metadata, created_at
                FROM audit_events
                WHERE $1::bigint IS NULL OR id < $1::bigint
                ORDER BY id DESC
                LIMIT $2
            `,
            [cursorValue, limit + 1],
        );
        const rows = result.rows.slice(0, limit);
        const last = rows[rows.length - 1];
        const hasMore = result.rows.length > limit;
        return {
            items: rows.map(toAuditEntry),
            nextCursor: hasMore && last !== undefined ? last.id : null,
        };
    }
}
