import { describe, expect, it } from "vitest";
import type { EvidenceRecord, SyncResult } from "../../packages/contracts/src/index.ts";
import {
    mergeProgressSnapshots,
    mergeProjectFiles,
    planGuestMigration,
    summarizeSyncResults,
} from "../../packages/client/src/synchronization/index.ts";
import type {
    CompletionRow,
    LocalProgress,
    OutboxRow,
} from "../../packages/client/src/persistence/index.ts";

const NOW = "2026-10-28T10:00:00.000Z";

function evidenceRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
    return {
        id: "evidence-0001",
        missionId: "before-code.make-it-respond",
        missionVersion: 1,
        category: "prediction",
        outcome: "success",
        assistance: "independent",
        independence: 1,
        createdAt: NOW,
        skills: ["concept.computation"],
        ...overrides,
    };
}

function completionRow(overrides: Partial<CompletionRow> = {}): CompletionRow {
    return {
        id: "before-code.make-it-respond@1",
        missionId: "before-code.make-it-respond",
        version: 1,
        attemptId: "attempt-0001",
        completedAt: NOW,
        independent: true,
        ...overrides,
    };
}

function outboxRow(operationId: string, seq: number): OutboxRow {
    return {
        seq,
        operationId,
        operation: {
            kind: "preferences",
            operationId,
            preferences: {
                interests: ["everything"],
                textScale: 1,
                motion: "system",
                sound: false,
                challenge: "standard",
                reminders: { enabled: false, quietStart: "22:00", quietEnd: "08:00" },
                aiTutor: false,
            },
        },
        queuedAt: NOW,
        attempts: 0,
    };
}

function result(operationId: string, status: SyncResult["status"], code?: string): SyncResult {
    return {
        operationId,
        kind: "preferences",
        status,
        ...(code === undefined ? {} : { code }),
    };
}

describe("guest progress migration", function guestMigration(): void {
    it("plans evidence, completions, placement, streaks, and achievements", function plans(): void {
        const progress: LocalProgress = {
            id: "local",
            experience: 240,
            level: 2,
            streakDays: 4,
            longestStreak: 6,
            lastPracticeOn: "2026-10-27",
            placementSkippedSkills: ["concept.computation"],
            achievements: [{ achievementId: "achievement.first-transfer", earnedAt: NOW }],
        };
        const operations = planGuestMigration({
            progress,
            evidence: [evidenceRecord()],
            completions: [completionRow()],
            existingOperationIds: [],
        });
        expect(
            operations.map(function kindOf(operation): string {
                return operation.kind;
            }),
        ).toEqual(["progress", "evidence", "mission-completion"]);
        const progressOperation = operations[0];
        expect(progressOperation?.kind).toBe("progress");
        if (progressOperation?.kind === "progress") {
            expect(progressOperation.streakDays).toBe(4);
            expect(progressOperation.placementSkippedSkills).toEqual(["concept.computation"]);
            expect(progressOperation.achievements).toEqual(["achievement.first-transfer"]);
        }
    });

    it("does not queue an item that is already in the outbox", function dedupe(): void {
        const operations = planGuestMigration({
            progress: {
                id: "local",
                experience: 0,
                level: 1,
                streakDays: 0,
                longestStreak: 0,
                placementSkippedSkills: [],
                achievements: [],
            },
            evidence: [evidenceRecord()],
            completions: [completionRow()],
            existingOperationIds: ["evidence:evidence-0001"],
        });
        expect(operations).toHaveLength(1);
        expect(operations[0]?.kind).toBe("mission-completion");
    });
});

describe("guest project draft merge", function projectMerge(): void {
    it("keeps account files that the guest draft did not touch", function merge(): void {
        const merged = mergeProjectFiles(
            { "index.html": "<h1>Account</h1>", "style.css": "body { color: red; }" },
            { "index.html": "<h1>Guest edit</h1>" },
        );
        expect(merged["index.html"]).toBe("<h1>Guest edit</h1>");
        expect(merged["style.css"]).toBe("body { color: red; }");
    });
});

describe("sync conflict retention", function syncConflicts(): void {
    it("deletes accepted work and retains conflicts and rejections", function retain(): void {
        const rows = [
            outboxRow("accepted-operation", 1),
            outboxRow("duplicate-operation", 2),
            outboxRow("conflict-operation", 3),
            outboxRow("rejected-operation", 4),
        ];
        const summary = summarizeSyncResults(rows, [
            result("accepted-operation", "accepted"),
            result("duplicate-operation", "duplicate"),
            result("conflict-operation", "conflict", "project_revision_conflict"),
            result("rejected-operation", "rejected", "unknown_mission"),
        ]);
        expect(summary.accepted).toBe(2);
        expect(summary.deleteSeqs).toEqual([1, 2]);
        expect(
            summary.retained.map(function idOf(entry): string {
                return entry.row.operationId;
            }),
        ).toEqual(["conflict-operation", "rejected-operation"]);
        expect(
            summary.retained.map(function idOf(entry): string | undefined {
                return entry.row.seq?.toString();
            }),
        ).toEqual(["3", "4"]);
    });
});

describe("progress snapshot merge", function progressMerge(): void {
    it("keeps newer account data and still merges guest achievements and placement", function merge(): void {
        const local: LocalProgress = {
            id: "local",
            experience: 120,
            level: 1,
            streakDays: 2,
            longestStreak: 5,
            lastPracticeOn: "2026-10-20",
            placementSkippedSkills: ["concept.state"],
            achievements: [{ achievementId: "achievement.first-transfer", earnedAt: NOW }],
        };
        const merged = mergeProgressSnapshots(local, {
            experience: 300,
            level: 3,
            streakDays: 6,
            longestStreak: 8,
            lastPracticeOn: "2026-10-27",
            placementSkippedSkills: ["concept.computation"],
            achievements: [{ achievementId: "achievement.debugger", earnedAt: NOW }],
        });
        expect(merged.experience).toBe(300);
        expect(merged.level).toBe(3);
        expect(merged.streakDays).toBe(6);
        expect(merged.longestStreak).toBe(8);
        expect(merged.lastPracticeOn).toBe("2026-10-27");
        expect(merged.placementSkippedSkills).toEqual(["concept.computation", "concept.state"]);
        expect(
            merged.achievements.map(function idOf(record): string {
                return record.achievementId;
            }),
        ).toEqual(["achievement.debugger", "achievement.first-transfer"]);
    });
});
