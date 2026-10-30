import {
    setAchievements,
    setCompletions,
    setMastery,
    setProgress,
    setReviews,
    setWorld,
} from "./state.ts";
import {
    loadProgress,
    markOutboxFailure,
    queueOperation,
    savePreferences,
    saveProgress,
    saveWorld,
    type CompletionRow,
    type LocalProgress,
    type OutboxRow,
    type PraxbitDatabase,
    type ProjectRow,
    type WorldRow,
} from "../persistence/index.ts";
import { ApiClient, ApiError } from "../api/index.ts";
import { levelForExperience } from "@praxbit/domain";
import type {
    EvidenceRecord,
    Progress,
    SyncOperation,
    SyncResult,
    SyncResponse,
    WorldState,
} from "@praxbit/contracts";

export interface SyncFlushResult {
    readonly status: "idle" | "offline" | "unauthenticated" | "synced" | "partial" | "failed";
    readonly accepted: number;
    readonly conflicts: readonly SyncResult[];
    readonly message?: string;
}

export interface GuestMigrationInput {
    readonly progress: LocalProgress;
    readonly evidence: readonly EvidenceRecord[];
    readonly completions: readonly CompletionRow[];
    readonly existingOperationIds: readonly string[];
}

export interface RetainedSyncResult {
    readonly row: OutboxRow;
    readonly result: SyncResult;
}

export interface SyncResultSummary {
    readonly accepted: number;
    readonly deleteSeqs: readonly number[];
    readonly retained: readonly RetainedSyncResult[];
}

function sortRecords<T extends { readonly earnedAt: string; readonly achievementId: string }>(
    records: readonly T[],
): readonly T[] {
    return [...records].sort(function compare(left, right): number {
        const byTime = left.earnedAt.localeCompare(right.earnedAt);
        return byTime === 0 ? left.achievementId.localeCompare(right.achievementId) : byTime;
    });
}

export function mergeProgressSnapshots(local: LocalProgress, remote: Progress): LocalProgress {
    const experience = Math.max(local.experience, remote.experience);
    const streakDays = Math.max(local.streakDays, remote.streakDays);
    const longestStreak = Math.max(local.longestStreak, remote.longestStreak, streakDays);
    const lastPracticeOn =
        local.lastPracticeOn === undefined
            ? remote.lastPracticeOn
            : remote.lastPracticeOn === undefined
              ? local.lastPracticeOn
              : local.lastPracticeOn > remote.lastPracticeOn
                ? local.lastPracticeOn
                : remote.lastPracticeOn;
    const placement = [
        ...new Set([...remote.placementSkippedSkills, ...local.placementSkippedSkills]),
    ];
    const achievements = new Map(
        sortRecords([...local.achievements, ...remote.achievements]).map(function entry(record): [
            string,
            { readonly achievementId: string; readonly earnedAt: string },
        ] {
            return [record.achievementId, record];
        }),
    );
    return {
        id: "local",
        experience,
        level: Math.max(local.level, remote.level, levelForExperience(experience)),
        streakDays,
        longestStreak,
        ...(lastPracticeOn === undefined ? {} : { lastPracticeOn }),
        placementSkippedSkills: placement,
        achievements: [...sortRecords([...achievements.values()])],
    };
}

export function planGuestMigration(input: GuestMigrationInput): readonly SyncOperation[] {
    const existing = new Set(input.existingOperationIds);
    const operations: SyncOperation[] = [];
    const hasProgress =
        input.progress.experience > 0 ||
        input.progress.streakDays > 0 ||
        input.progress.longestStreak > 0 ||
        input.progress.placementSkippedSkills.length > 0 ||
        input.progress.achievements.length > 0;
    if (hasProgress) {
        const operationId = `progress:guest:${crypto.randomUUID()}`;
        if (!existing.has(operationId)) {
            operations.push({
                kind: "progress",
                operationId,
                experience: input.progress.experience,
                streakDays: input.progress.streakDays,
                longestStreak: input.progress.longestStreak,
                ...(input.progress.lastPracticeOn === undefined
                    ? {}
                    : { lastPracticeOn: input.progress.lastPracticeOn }),
                placementSkippedSkills: [...input.progress.placementSkippedSkills],
                achievements: input.progress.achievements.map(function idOf(record): string {
                    return record.achievementId;
                }),
            });
            existing.add(operationId);
        }
    }
    for (const record of input.evidence) {
        const operationId = `evidence:${record.id}`;
        if (existing.has(operationId)) {
            continue;
        }
        operations.push({
            kind: "evidence",
            operationId,
            evidence: {
                id: record.id,
                missionId: record.missionId,
                missionVersion: record.missionVersion,
                category: record.category,
                outcome: record.outcome,
                assistance: record.assistance,
                independence: record.independence,
                createdAt: record.createdAt,
                ...(record.stepId === undefined ? {} : { stepId: record.stepId }),
                ...(record.attemptId === undefined ? {} : { attemptId: record.attemptId }),
                ...(record.detail === undefined ? {} : { detail: record.detail }),
            },
        });
        existing.add(operationId);
    }
    for (const completion of input.completions) {
        const operationId = `completion:${completion.missionId}:${String(completion.version)}`;
        if (existing.has(operationId)) {
            continue;
        }
        operations.push({
            kind: "mission-completion",
            operationId,
            missionId: completion.missionId,
            missionVersion: completion.version,
            attemptId: completion.attemptId,
            independent: completion.independent,
            completedAt: completion.completedAt,
        });
        existing.add(operationId);
    }
    return operations;
}

export function summarizeSyncResults(
    rows: readonly OutboxRow[],
    results: readonly SyncResult[],
): SyncResultSummary {
    const deleteSeqs: number[] = [];
    const retained: RetainedSyncResult[] = [];
    let accepted = 0;
    for (const result of results) {
        const row = rows.find(function match(item): boolean {
            return item.operation.operationId === result.operationId;
        });
        if (row?.seq === undefined) {
            continue;
        }
        if (result.status === "accepted" || result.status === "duplicate") {
            accepted += 1;
            deleteSeqs.push(row.seq);
            continue;
        }
        retained.push({ row, result });
    }
    return { accepted, deleteSeqs, retained };
}

export function mergeProjectFiles(
    latest: Readonly<Record<string, string>> | undefined,
    local: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
    return { ...latest, ...local };
}

function sameFiles(
    left: Readonly<Record<string, string>>,
    right: Readonly<Record<string, string>>,
): boolean {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (let index = 0; index < leftKeys.length; index += 1) {
        const key = leftKeys[index];
        if (key !== rightKeys[index] || key === undefined || left[key] !== right[key]) {
            return false;
        }
    }
    return true;
}

export async function applySyncSnapshot(
    db: PraxbitDatabase,
    response: SyncResponse,
): Promise<void> {
    const local = await loadProgress(db);
    await setMastery(db, response.mastery);
    await setReviews(db, response.reviews);
    await setProgress(db, response.progress);
    await setAchievements(db, response.achievements);
    await setCompletions(db, response.completions);
    await setWorld(db, response.world);
    await savePreferences(db, response.preferences);
    const remote = await loadProgress(db);
    await saveProgress(db, mergeProgressSnapshots(local, remote));
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
            const rows = await this.db.outbox
                .orderBy("seq")
                .filter(function pending(row: OutboxRow): boolean {
                    return row.conflict === undefined;
                })
                .limit(batchSize)
                .toArray();
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
                await markOutboxFailure(
                    this.db,
                    rows[0]?.seq ?? 0,
                    error instanceof Error ? error.message : "Sync failed.",
                );
                return {
                    status: "failed",
                    accepted: 0,
                    conflicts: [],
                    message: error instanceof Error ? error.message : "Sync failed.",
                };
            }

            await setMastery(this.db, response.mastery);
            await setReviews(this.db, response.reviews);
            const localProgress = await loadProgress(this.db);
            await setProgress(this.db, response.progress);
            await setAchievements(this.db, response.achievements);
            await setCompletions(this.db, response.completions);
            await setWorld(this.db, response.world);
            await savePreferences(this.db, response.preferences);
            await saveProgress(
                this.db,
                mergeProgressSnapshots(localProgress, await loadProgress(this.db)),
            );

            const summary = summarizeSyncResults(rows, response.results);
            if (summary.deleteSeqs.length > 0) {
                await this.db.outbox.bulkDelete([...summary.deleteSeqs]);
            }
            for (const result of response.results) {
                if (
                    result.kind !== "project-revision" ||
                    result.revision === undefined ||
                    (result.status !== "accepted" && result.status !== "duplicate")
                ) {
                    continue;
                }
                const row = rows.find(function match(item): boolean {
                    return item.operation.operationId === result.operationId;
                });
                if (row?.operation.kind === "project-revision") {
                    await this.db.projects.update(row.operation.projectId, {
                        revision: result.revision,
                    });
                }
            }
            for (const retained of summary.retained) {
                if (retained.row.seq === undefined) {
                    continue;
                }
                await this.db.outbox.update(retained.row.seq, {
                    attempts: retained.row.attempts + 1,
                    lastError: retained.result.message ?? retained.result.code ?? "Sync conflict.",
                    conflict: {
                        code: retained.result.code,
                        message: retained.result.message,
                        at: new Date().toISOString(),
                    },
                });
            }

            return {
                status: summary.retained.length > 0 ? "partial" : "synced",
                accepted: summary.accepted,
                conflicts: summary.retained.map(function resultOf(entry): SyncResult {
                    return entry.result;
                }),
            };
        } finally {
            this.flushing = false;
        }
    }

    public async migrateGuestProgress(): Promise<SyncFlushResult> {
        await this.mergeGuestProjectDrafts();
        await this.enqueueGuestState();
        const conflicts: SyncResult[] = [];
        let accepted = 0;
        let status: SyncFlushResult["status"] = "idle";
        for (let batch = 0; batch < 40; batch += 1) {
            const result = await this.flush(50);
            accepted += result.accepted;
            conflicts.push(...result.conflicts);
            status = result.status;
            if (
                result.status === "idle" ||
                result.status === "offline" ||
                result.status === "unauthenticated" ||
                result.status === "failed" ||
                result.accepted === 0
            ) {
                break;
            }
        }
        return {
            status: conflicts.length > 0 ? "partial" : status,
            accepted,
            conflicts,
            ...(status === "failed"
                ? { message: "Guest progress remains saved on this device." }
                : {}),
        };
    }

    private async enqueueGuestState(): Promise<void> {
        const [storedProgress, evidence, completions, outbox, placementRow] = await Promise.all([
            loadProgress(this.db),
            this.db.evidence.toArray(),
            this.db.completions.toArray(),
            this.db.outbox.toArray(),
            this.db.meta.get("placement"),
        ]);
        let progress = storedProgress;
        if (placementRow !== undefined) {
            try {
                const parsed: unknown = JSON.parse(placementRow.value);
                if (typeof parsed === "object" && parsed !== null && "skippedSkills" in parsed) {
                    const skipped = (parsed as { readonly skippedSkills?: unknown }).skippedSkills;
                    if (
                        Array.isArray(skipped) &&
                        skipped.every(function isString(value): value is string {
                            return typeof value === "string";
                        })
                    ) {
                        progress = {
                            ...progress,
                            placementSkippedSkills: [
                                ...new Set([...progress.placementSkippedSkills, ...skipped]),
                            ],
                        };
                    }
                }
            } catch {
                // A malformed legacy placement row does not block the rest of the migration.
            }
        }
        const operations = planGuestMigration({
            progress,
            evidence,
            completions,
            existingOperationIds: outbox.map(function idOf(row): string {
                return row.operationId;
            }),
        });
        for (const operation of operations) {
            await queueOperation(this.db, operation);
        }
    }

    private async mergeGuestProjectDrafts(): Promise<void> {
        const rows = await this.db.projects.toArray();
        for (const row of rows) {
            await this.mergeProjectDraft(row);
        }
    }

    private async mergeProjectDraft(row: ProjectRow): Promise<void> {
        try {
            const detail = await this.api.getProject(row.id);
            const latest = detail.revisions[detail.revisions.length - 1];
            const merged = mergeProjectFiles(latest?.files, row.files);
            if (latest !== undefined && sameFiles(merged, latest.files)) {
                await this.db.projects.put({
                    ...row,
                    revision: detail.project.currentRevision,
                    updatedAt: new Date().toISOString(),
                });
                return;
            }
            const saved = await this.api.saveRevision(row.id, {
                baseRevision: detail.project.currentRevision,
                message: "Merged guest draft",
                files: merged,
            });
            await this.db.projects.put({
                ...row,
                files: merged,
                revision: saved.project.currentRevision,
                updatedAt: new Date().toISOString(),
            });
        } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
                await this.retryProjectMerge(row);
                return;
            }
            await this.queueProjectRevision({
                projectId: row.id,
                files: row.files,
                baseRevision: row.revision,
                message: "Guest draft",
            });
        }
    }

    private async retryProjectMerge(row: ProjectRow): Promise<void> {
        try {
            const detail = await this.api.getProject(row.id);
            const latest = detail.revisions[detail.revisions.length - 1];
            const merged = mergeProjectFiles(latest?.files, row.files);
            const saved = await this.api.saveRevision(row.id, {
                baseRevision: detail.project.currentRevision,
                message: "Merged guest draft",
                files: merged,
            });
            await this.db.projects.put({
                ...row,
                files: merged,
                revision: saved.project.currentRevision,
                updatedAt: new Date().toISOString(),
            });
        } catch {
            await this.queueProjectRevision({
                projectId: row.id,
                files: row.files,
                baseRevision: row.revision,
                message: "Guest draft",
            });
        }
    }

    public async queueProjectRevision(input: {
        readonly projectId: string;
        readonly files: Readonly<Record<string, string>>;
        readonly baseRevision: number;
        readonly message: string;
    }): Promise<void> {
        const pending = await this.db.outbox
            .filter(function matching(row: OutboxRow): boolean {
                return (
                    row.conflict === undefined &&
                    row.operation.kind === "project-revision" &&
                    row.operation.projectId === input.projectId
                );
            })
            .toArray();
        const pendingSeqs = pending
            .map(function seqOf(row): number | undefined {
                return row.seq;
            })
            .filter(function isNumber(value): value is number {
                return value !== undefined;
            });
        if (pendingSeqs.length > 0) {
            await this.db.outbox.bulkDelete(pendingSeqs);
        }
        await queueOperation(this.db, {
            kind: "project-revision",
            operationId: `project-revision:${crypto.randomUUID()}`,
            projectId: input.projectId,
            baseRevision: input.baseRevision,
            message: input.message,
            files: input.files,
        });
    }

    public async listConflicts(): Promise<readonly OutboxRow[]> {
        return this.db.outbox
            .filter(function conflicted(row: OutboxRow): boolean {
                return row.conflict !== undefined;
            })
            .toArray();
    }

    public async retryConflicts(): Promise<void> {
        const rows = await this.listConflicts();
        for (const row of rows) {
            if (row.seq === undefined) {
                continue;
            }
            await this.db.outbox.update(row.seq, {
                attempts: 0,
                lastError: undefined,
                conflict: undefined,
            });
        }
    }

    public async discardConflicts(): Promise<void> {
        const rows = await this.listConflicts();
        const seqs = rows
            .map(function seqOf(row): number | undefined {
                return row.seq;
            })
            .filter(function isNumber(value): value is number {
                return value !== undefined;
            });
        if (seqs.length > 0) {
            await this.db.outbox.bulkDelete(seqs);
        }
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
