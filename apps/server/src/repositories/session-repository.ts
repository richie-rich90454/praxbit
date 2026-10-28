import type { User } from "@praxbit/contracts";
import { toUser, type QueryExecutor, type UserRow } from "../db/rows.ts";

export interface ActiveSession {
    readonly sessionId: string;
    readonly user: User;
}

type SessionUserRow = {
    session_id: string;
    user_id: string;
    handle: string;
    display_name: string;
    role: "member" | "admin";
    created_at: Date | string;
    expires_at: Date | string;
    revoked_at: Date | string | null;
};

export class SessionRepository {
    public async createSession(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly userId: string;
            readonly tokenHash: string;
            readonly createdAt: Date;
            readonly expiresAt: Date;
        },
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
                VALUES ($1, $2, $3, $4, $5)
            `,
            [input.id, input.userId, input.tokenHash, input.createdAt, input.expiresAt],
        );
    }

    public async findActiveSessionByTokenHash(
        executor: QueryExecutor,
        tokenHash: string,
        now: Date,
    ): Promise<ActiveSession | undefined> {
        const result = await executor.query<SessionUserRow>(
            `
                SELECT s.id AS session_id, s.expires_at, s.revoked_at,
                       u.id AS user_id, u.handle, u.display_name, u.role, u.created_at
                FROM auth_sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = $1
                  AND s.revoked_at IS NULL
                  AND s.expires_at > $2
            `,
            [tokenHash, now],
        );
        const row = result.rows[0];
        if (row === undefined) {
            return undefined;
        }
        const userRow: UserRow = {
            id: row.user_id,
            handle: row.handle,
            display_name: row.display_name,
            role: row.role,
            created_at: row.created_at,
        };
        return { sessionId: row.session_id, user: toUser(userRow) };
    }

    public async revokeSessionById(
        executor: QueryExecutor,
        sessionId: string,
        now: Date,
    ): Promise<void> {
        await executor.query(
            `
                UPDATE auth_sessions
                SET revoked_at = $2
                WHERE id = $1 AND revoked_at IS NULL
            `,
            [sessionId, now],
        );
    }

    public async revokeAllSessions(
        executor: QueryExecutor,
        userId: string,
        now: Date,
    ): Promise<number> {
        const result = await executor.query(
            `
                UPDATE auth_sessions
                SET revoked_at = $2
                WHERE user_id = $1 AND revoked_at IS NULL
            `,
            [userId, now],
        );
        return result.rowCount ?? 0;
    }
}
