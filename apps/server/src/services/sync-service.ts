import type {
    AchievementRecord,
    CompletionRecord,
    Preferences,
    Progress,
    ReviewItem,
    SkillMastery,
    SyncOperation,
    SyncResponse,
    SyncResult,
    WorldState,
} from "@praxbit/contracts";
import type { Pool } from "pg";
import { AppError } from "../http/app-error.ts";
import { withTransaction } from "../db/pool.ts";
import type { QueryExecutor } from "../db/rows.ts";
import { lockUserLearning } from "../db/locks.ts";
import type { SyncRepository } from "../repositories/sync-repository.ts";
import type { UserRepository } from "../repositories/user-repository.ts";
import type { WorldRepository } from "../repositories/world-repository.ts";
import type { CompletionService } from "./completion-service.ts";
import type { EvidenceService } from "./evidence-service.ts";
import type { ProjectService } from "./project-service.ts";
import type { WorldService } from "./world-service.ts";
import type { AchievementService } from "./achievement-service.ts";

const CONFLICT_CODES = new Set(["world_version_conflict", "project_revision_conflict"]);

export class SyncService {
    private readonly pool: Pool;
    private readonly users: UserRepository;
    private readonly worlds: WorldRepository;
    private readonly sync: SyncRepository;
    private readonly evidence: EvidenceService;
    private readonly completions: CompletionService;
    private readonly projects: ProjectService;
    private readonly worldService: WorldService;
    private readonly achievements: AchievementService;

    public constructor(dependencies: {
        readonly pool: Pool;
        readonly users: UserRepository;
        readonly worlds: WorldRepository;
        readonly sync: SyncRepository;
        readonly evidence: EvidenceService;
        readonly completions: CompletionService;
        readonly projects: ProjectService;
        readonly worldService: WorldService;
        readonly achievements: AchievementService;
    }) {
        this.pool = dependencies.pool;
        this.users = dependencies.users;
        this.worlds = dependencies.worlds;
        this.sync = dependencies.sync;
        this.evidence = dependencies.evidence;
        this.completions = dependencies.completions;
        this.projects = dependencies.projects;
        this.worldService = dependencies.worldService;
        this.achievements = dependencies.achievements;
    }

    public async synchronize(input: {
        readonly userId: string;
        readonly operations: readonly SyncOperation[];
        readonly now: Date;
    }): Promise<SyncResponse> {
        return withTransaction(this.pool, this.synchronizeWork.bind(this, input));
    }

    private async synchronizeWork(
        input: {
            readonly userId: string;
            readonly operations: readonly SyncOperation[];
            readonly now: Date;
        },
        client: QueryExecutor,
    ): Promise<SyncResponse> {
        await lockUserLearning(client, input.userId);
        const results: SyncResult[] = [];

        for (const operation of input.operations) {
            const previous = await this.sync.findOperation(
                client,
                input.userId,
                operation.operationId,
            );
            if (previous !== undefined) {
                results.push({ ...previous.result, status: "duplicate" });
                continue;
            }
            const result = await this.processOperation(client, input.userId, operation, input.now);
            await this.sync.saveOperation(client, input.userId, result, input.now);
            results.push(result);
        }

        const world: WorldState = await this.worlds.ensureWorld(client, input.userId);
        await this.achievements.evaluate(client, input.userId, input.now);
        const preferences: Preferences = await this.users.getPreferences(client, input.userId);
        const progress: Progress = await this.users.getProgress(client, input.userId);
        const mastery: readonly SkillMastery[] = await this.users.listMastery(client, input.userId);
        const reviews: readonly ReviewItem[] = await this.users.listReviews(client, input.userId);
        const achievements: readonly AchievementRecord[] = await this.users.listAchievements(
            client,
            input.userId,
        );
        const completions: readonly CompletionRecord[] = await this.users.listCompletions(
            client,
            input.userId,
        );

        return {
            results,
            mastery: [...mastery],
            reviews: [...reviews],
            progress,
            achievements: [...achievements],
            completions: [...completions],
            world,
            preferences,
        };
    }

    private async processOperation(
        executor: QueryExecutor,
        userId: string,
        operation: SyncOperation,
        now: Date,
    ): Promise<SyncResult> {
        try {
            switch (operation.kind) {
                case "evidence": {
                    await this.evidence.applyEvidence(executor, userId, operation.evidence, now);
                    return {
                        operationId: operation.operationId,
                        kind: operation.kind,
                        status: "accepted",
                    };
                }
                case "world-action": {
                    const world = await this.worldService.applyActionWithExecutor(executor, {
                        userId,
                        expectedVersion: operation.expectedVersion,
                        action: operation.action,
                        now,
                    });
                    return {
                        operationId: operation.operationId,
                        kind: operation.kind,
                        status: "accepted",
                        worldVersion: world.version,
                    };
                }
                case "project-revision": {
                    const revision = await this.projects.appendRevision(executor, {
                        userId,
                        projectId: operation.projectId,
                        baseRevision: operation.baseRevision,
                        message: operation.message,
                        files: operation.files,
                        now,
                    });
                    return {
                        operationId: operation.operationId,
                        kind: operation.kind,
                        status: "accepted",
                        revision,
                    };
                }
                case "mission-completion": {
                    const outcome = await this.completions.applyCompletion(
                        executor,
                        userId,
                        {
                            missionId: operation.missionId,
                            missionVersion: operation.missionVersion,
                            attemptId: operation.attemptId,
                            independent: operation.independent,
                            completedAt: operation.completedAt,
                        },
                        now,
                    );
                    if (outcome.status === "duplicate") {
                        return {
                            operationId: operation.operationId,
                            kind: operation.kind,
                            status: "duplicate",
                            code: "already_completed",
                            message: "This mission was already completed for this version.",
                        };
                    }
                    return {
                        operationId: operation.operationId,
                        kind: operation.kind,
                        status: "accepted",
                    };
                }
                case "preferences": {
                    await this.users.savePreferences(executor, userId, operation.preferences);
                    return {
                        operationId: operation.operationId,
                        kind: operation.kind,
                        status: "accepted",
                    };
                }
                default: {
                    throw new Error("Unhandled sync operation kind.");
                }
            }
        } catch (error) {
            if (error instanceof AppError) {
                return {
                    operationId: operation.operationId,
                    kind: operation.kind,
                    status: CONFLICT_CODES.has(error.code) ? "conflict" : "rejected",
                    code: error.code,
                    message: error.message,
                };
            }
            throw error;
        }
    }
}
