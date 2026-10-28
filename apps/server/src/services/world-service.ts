import type { WorldAction, WorldState } from "@praxbit/contracts";
import { applyWorldAction } from "@praxbit/domain";
import type { Pool } from "pg";
import { AppError } from "../http/app-error.ts";
import { withTransaction } from "../db/pool.ts";
import type { QueryExecutor } from "../db/rows.ts";
import type { WorldRepository } from "../repositories/world-repository.ts";
import type { AchievementService } from "./achievement-service.ts";

export class WorldService {
    private readonly pool: Pool;
    private readonly worlds: WorldRepository;
    private readonly achievements: AchievementService;

    public constructor(dependencies: {
        readonly pool: Pool;
        readonly worlds: WorldRepository;
        readonly achievements: AchievementService;
    }) {
        this.pool = dependencies.pool;
        this.worlds = dependencies.worlds;
        this.achievements = dependencies.achievements;
    }

    public async getWorld(userId: string): Promise<WorldState> {
        return this.worlds.ensureWorld(this.pool, userId);
    }

    public async applyAction(input: {
        readonly userId: string;
        readonly expectedVersion: number;
        readonly action: WorldAction;
        readonly now: Date;
    }): Promise<WorldState> {
        return withTransaction(this.pool, this.applyActionWork.bind(this, input));
    }

    private async applyActionWork(
        input: {
            readonly userId: string;
            readonly expectedVersion: number;
            readonly action: WorldAction;
            readonly now: Date;
        },
        client: QueryExecutor,
    ): Promise<WorldState> {
        return this.applyActionWithExecutor(client, input);
    }

    public async applyActionWithExecutor(
        executor: QueryExecutor,
        input: {
            readonly userId: string;
            readonly expectedVersion: number;
            readonly action: WorldAction;
            readonly now: Date;
        },
    ): Promise<WorldState> {
        const locked = await this.worlds.ensureAndLockWorld(executor, input.userId);
        if (locked.version !== input.expectedVersion) {
            throw new AppError(
                409,
                "world_version_conflict",
                "This world changed on another device.",
                { currentVersion: locked.version },
            );
        }
        const result = applyWorldAction(locked.state, input.action);
        await this.worlds.saveWorld(executor, input.userId, result.state, input.now);
        await this.worlds.recordAction(executor, {
            id: crypto.randomUUID(),
            userId: input.userId,
            version: result.state.version,
            actionId: input.action.id,
            systemId: input.action.systemId,
            now: input.now,
        });
        await this.achievements.evaluate(executor, input.userId, input.now);
        return result.state;
    }
}
