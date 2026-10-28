import { WorldStateSchema, type WorldState } from "@praxbit/contracts";
import { createInitialWorld } from "@praxbit/domain";
import type { QueryExecutor } from "../db/rows.ts";

export const CAMPUS_WORLD_ID = "campus";

type WorldRow = {
    user_id: string;
    id: string;
    version: number;
    state: unknown;
    updated_at: Date | string;
};

export interface LockedWorld {
    readonly version: number;
    readonly state: WorldState;
}

function parseWorldState(value: unknown): WorldState {
    return WorldStateSchema.parse(value);
}

export class WorldRepository {
    public async ensureWorld(executor: QueryExecutor, userId: string): Promise<WorldState> {
        const initial = createInitialWorld();
        await executor.query(
            `
                INSERT INTO worlds (user_id, id, version, state)
                VALUES ($1, $2, $3, $4::jsonb)
                ON CONFLICT (user_id, id) DO NOTHING
            `,
            [userId, CAMPUS_WORLD_ID, initial.version, JSON.stringify(initial)],
        );
        return this.getWorld(executor, userId);
    }

    public async getWorld(executor: QueryExecutor, userId: string): Promise<WorldState> {
        const result = await executor.query<WorldRow>(
            `
                SELECT user_id, id, version, state, updated_at
                FROM worlds
                WHERE user_id = $1 AND id = $2
            `,
            [userId, CAMPUS_WORLD_ID],
        );
        const row = result.rows[0];
        if (row === undefined) {
            throw new Error("World row is missing after ensure.");
        }
        return parseWorldState(row.state);
    }

    public async listWorlds(
        executor: QueryExecutor,
        userId: string,
    ): Promise<readonly WorldState[]> {
        const result = await executor.query<WorldRow>(
            `
                SELECT user_id, id, version, state, updated_at
                FROM worlds
                WHERE user_id = $1
                ORDER BY id ASC
            `,
            [userId],
        );
        return result.rows.map(function stateOf(row: WorldRow): WorldState {
            return parseWorldState(row.state);
        });
    }

    public async ensureAndLockWorld(executor: QueryExecutor, userId: string): Promise<LockedWorld> {
        const initial = createInitialWorld();
        await executor.query(
            `
                INSERT INTO worlds (user_id, id, version, state)
                VALUES ($1, $2, $3, $4::jsonb)
                ON CONFLICT (user_id, id) DO NOTHING
            `,
            [userId, CAMPUS_WORLD_ID, initial.version, JSON.stringify(initial)],
        );
        const result = await executor.query<WorldRow>(
            `
                SELECT user_id, id, version, state, updated_at
                FROM worlds
                WHERE user_id = $1 AND id = $2
                FOR UPDATE
            `,
            [userId, CAMPUS_WORLD_ID],
        );
        const row = result.rows[0];
        if (row === undefined) {
            throw new Error("World row is missing after locking.");
        }
        return { version: row.version, state: parseWorldState(row.state) };
    }

    public async saveWorld(
        executor: QueryExecutor,
        userId: string,
        state: WorldState,
        now: Date,
    ): Promise<void> {
        await executor.query(
            `
                UPDATE worlds
                SET version = $3, state = $4::jsonb, updated_at = $5
                WHERE user_id = $1 AND id = $2
            `,
            [userId, CAMPUS_WORLD_ID, state.version, JSON.stringify(state), now],
        );
        await executor.query(
            `
                INSERT INTO world_snapshots (user_id, world_id, version, state, created_at)
                VALUES ($1, $2, $3, $4::jsonb, $5)
                ON CONFLICT (user_id, world_id, version) DO NOTHING
            `,
            [userId, CAMPUS_WORLD_ID, state.version, JSON.stringify(state), now],
        );
    }

    public async recordAction(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly userId: string;
            readonly version: number;
            readonly actionId: string;
            readonly systemId: string | undefined;
            readonly now: Date;
        },
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO world_actions (id, user_id, world_id, version, action_id, system_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
                input.id,
                input.userId,
                CAMPUS_WORLD_ID,
                input.version,
                input.actionId,
                input.systemId ?? null,
                input.now,
            ],
        );
    }
}
