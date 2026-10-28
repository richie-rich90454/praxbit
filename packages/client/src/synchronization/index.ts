import {
    setAchievements,
    setCompletions,
    setMastery,
    setProgress,
    setReviews,
    setWorld,
} from "./state.ts";
import {
    loadPreferences,
    loadProgress,
    markOutboxFailure,
    savePreferences,
    saveProgress,
    saveWorld,
    type PraxbitDatabase,
} from "../persistence/index.ts";
import { ApiClient, ApiError } from "../api/index.ts";
import type { SyncOperation, SyncResult, SyncResponse, WorldState } from "@praxbit/contracts";
import type { LocalProgress, WorldRow } from "../persistence/index.ts";

export interface SyncFlushResult {
    readonly status: "idle" | "offline" | "unauthenticated" | "synced" | "partial" | "failed";
    readonly accepted: number;
    readonly conflicts: readonly SyncResult[];
    readonly message?: string;
}

export async function applySyncSnapshot(db: PraxbitDatabase, response: SyncResponse): Promise<void> {
    await setMastery(db, response.mastery);
    await setReviews(db, response.reviews);
    await setProgress(db, response.progress);
    await setAchievements(db, response.achievements);
    await setCompletions(db, response.completions);
    await setWorld(db, response.world);
    await savePreferences(db, response.preferences);
}

export class SyncManager {
    private readonly api: ApiClient;
    private readonly db: PraxbitDatabase;
    private flushing = false;

    public constructor(api: ApiClient, db: PraxbitDatabase) {
        this.api = api;
        this.db = db;
    }

    public async flush(batchSize = 25): Promise<SyncFlushResult> {
        if (this.flushing) {
            return { status: "idle", accepted: 0, conflicts: [] };
        }
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            return { status: "offline", accepted: 0, conflicts: [] };
        }

        this.flushing = true;
        try {
            const rows = await this.db.outbox.orderBy("seq").limit(batchSize).toArray();
            if (rows.length === 0) {
                return { status: "idle", accepted: 0, conflicts: [] };
            }

            const operations: SyncOperation[] = rows.map(function operationOf(row): SyncOperation {
                return row.operation;
            });

            let response;
            try {
                response = await this.api.sync({ operations });
            } catch (error) {
                if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                    return { status: "unauthenticated", accepted: 0, conflicts: [] };
                }
                await markOutboxFailure(this.db, rows[0]?.seq ?? 0, error instanceof Error ? error.message : "Sync failed.");
                return {
                    status: "failed",
                    accepted: 0,
                    conflicts: [],
                    message: error instanceof Error ? error.message : "Sync failed.",
                };
            }

            await setMastery(this.db, response.mastery);
            await setReviews(this.db, response.reviews);
            await setProgress(this.db, response.progress);
            await setAchievements(this.db, response.achievements);
            await setCompletions(this.db, response.completions);
            await setWorld(this.db, response.world);
            await savePreferences(this.db, response.preferences);
            const conflicts: SyncResult[] = [];
            let accepted = 0;
            for (const result of response.results) {
                const row = rows.find(function match(item): boolean {
                    return item.operation.operationId === result.operationId;
                });
                if (row?.seq === undefined) {
                    continue;
                }
                if (result.status === "accepted" || result.status === "duplicate") {
                    accepted += 1;
                    await this.db.outbox.delete(row.seq);
                } else if (result.status === "conflict") {
                    conflicts.push(result);
                    await markOutboxFailure(this.db, row.seq, result.message ?? "Conflict");
                } else {
                    await markOutboxFailure(this.db, row.seq, result.message ?? "Rejected");
                }
            }

            return {
                status: conflicts.length > 0 ? "partial" : "synced",
                accepted,
                conflicts,
            };
        } finally {
            this.flushing = false;
        }
    }

    public async migrateGuestProgress(): Promise<SyncFlushResult> {
        const progress = await loadProgress(this.db);
        const preferences = await loadPreferences(this.db);
        await saveProgress(this.db, progress);
        await savePreferences(this.db, preferences);
        return this.flush(50);
    }

    public async localSnapshot(): Promise<{
        progress: LocalProgress;
        world: WorldRow | undefined;
    }> {
        return {
            progress: await loadProgress(this.db),
            world: await this.db.world.get("campus"),
        };
    }

    public async saveLocalWorld(world: WorldState): Promise<void> {
        await saveWorld(this.db, world);
    }
}
