import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
    AttemptStartResponseSchema,
    EvidenceResultSchema,
    ProjectDetailSchema,
    WorldResponseSchema,
} from "../../../packages/contracts/src/index.ts";
import {
    closeTestContext,
    createTestContext,
    resetDatabase,
    type TestContext,
} from "./helpers/database.ts";
import {
    TestClient,
    buildCompletionOperation,
    buildEvidence,
    expectApiError,
    field,
    postSync,
    readJson,
    register,
} from "./helpers/client.ts";

const MISSION_ID = "before-code.make-it-respond";
let MISSION_VERSION = 1;
const PROJECT_ID = "projects.campus-status-board";

describe("synchronization, mastery, worlds, and projects", function syncSuite(): void {
    let context: TestContext;

    beforeAll(async function setup(): Promise<void> {
        context = await createTestContext();
        MISSION_VERSION = context.content.getMission(MISSION_ID)?.version ?? 1;
    });

    afterAll(async function teardown(): Promise<void> {
        await closeTestContext(context);
    });

    beforeEach(async function reset(): Promise<void> {
        await resetDatabase(context);
    });

    it("recomputes mastery and idempotently rewards a mission once", async function testMasteryAndRewards(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "sync_learner");

        const evidence = buildEvidence(MISSION_ID, MISSION_VERSION);
        const evidenceResponse = await client.post("/api/v1/me/evidence", { evidence });
        expect(evidenceResponse.status).toBe(200);
        const evidenceResult = EvidenceResultSchema.parse(await readJson(evidenceResponse));
        const mastery = evidenceResult.mastery.find(function concept(row): boolean {
            return row.skillId === "concept.computation";
        });
        expect(mastery).toBeDefined();
        expect(mastery?.score ?? 0).toBeGreaterThan(0);
        expect(mastery?.evidenceCount).toBe(1);
        expect(evidenceResult.reviews.length).toBe(0);

        const completion = buildCompletionOperation(
            "completion-op-1",
            MISSION_ID,
            MISSION_VERSION,
            "attempt-complete-1",
        );
        const first = await postSync(client, [completion]);
        expect(first.results[0]?.status).toBe("accepted");
        expect(first.progress.experience).toBe(57);
        expect(first.progress.streakDays).toBe(1);
        expect(first.progress.lastPracticeOn).toBe(new Date().toISOString().slice(0, 10));
        expect(first.completions.length).toBe(1);
        expect(
            first.reviews.some(function concept(review): boolean {
                return review.skillId === "concept.computation";
            }),
        ).toBe(true);

        const replay = await postSync(client, [completion]);
        expect(replay.results[0]?.status).toBe("duplicate");
        expect(replay.progress.experience).toBe(57);
        expect(replay.completions.length).toBe(1);

        const secondCompletion = buildCompletionOperation(
            "completion-op-2",
            MISSION_ID,
            MISSION_VERSION,
            "attempt-complete-2",
        );
        const second = await postSync(client, [secondCompletion]);
        expect(second.results[0]?.status).toBe("duplicate");
        expect(second.results[0]?.code).toBe("already_completed");
        expect(second.progress.experience).toBe(57);

        const duplicateEvidence = await postSync(client, [
            { kind: "evidence", operationId: "evidence-op-duplicate", evidence },
        ]);
        expect(duplicateEvidence.results[0]?.status).toBe("accepted");
        const conceptMastery = duplicateEvidence.mastery.find(function concept(row): boolean {
            return row.skillId === "concept.computation";
        });
        expect(conceptMastery?.evidenceCount).toBe(1);
    });

    it("applies preference operations and returns the snapshot", async function testPreferences(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "preference_user");
        const snapshot = await postSync(client, [
            {
                kind: "preferences",
                operationId: "preferences-op-1",
                preferences: {
                    interests: ["ai", "professional"],
                    textScale: 1.15,
                    motion: "reduce",
                    sound: false,
                    challenge: "gentle",
                    reminders: { enabled: true, quietStart: "20:30", quietEnd: "06:45" },
                    aiTutor: true,
                },
            },
        ]);
        expect(snapshot.results[0]?.status).toBe("accepted");
        expect(snapshot.preferences.textScale).toBe(1.15);
        expect(snapshot.preferences.interests).toEqual(["ai", "professional"]);

        const me = await client.get("/api/v1/me");
        expect(me.status).toBe(200);
        const meBody = await readJson(me);
        const preferences = field(meBody, "preferences");
        expect(field(preferences, "aiTutor")).toBe(true);
    });

    it("detects world version conflicts for routes and sync operations", async function testWorldConflict(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "world_user");

        const action = { action: { id: "repair-inventory" }, expectedVersion: 0 };
        const first = await client.post("/api/v1/worlds/campus/actions", action);
        expect(first.status).toBe(200);
        const firstWorld = WorldResponseSchema.parse(await readJson(first));
        expect(firstWorld.world.version).toBe(1);

        const conflict = await client.post("/api/v1/worlds/campus/actions", action);
        expect(conflict.status).toBe(409);
        const conflictBody = await readJson(conflict);
        expectApiError(conflictBody, "world_version_conflict");
        const details = field(conflictBody, "error");
        expect(field(details, "details")).toMatchObject({ currentVersion: 1 });

        const syncConflict = await postSync(client, [
            {
                kind: "world-action",
                operationId: "world-conflict-op",
                expectedVersion: 0,
                action: { id: "publish-storefront" },
            },
        ]);
        expect(syncConflict.results[0]?.status).toBe("conflict");
        expect(syncConflict.results[0]?.code).toBe("world_version_conflict");
        expect(syncConflict.world.version).toBe(1);

        const accepted = await postSync(client, [
            {
                kind: "world-action",
                operationId: "world-accepted-op",
                expectedVersion: 1,
                action: { id: "publish-storefront" },
            },
        ]);
        expect(accepted.results[0]?.status).toBe("accepted");
        expect(accepted.results[0]?.worldVersion).toBe(2);
        expect(accepted.world.version).toBe(2);
    });

    it("saves project revisions with conflict detection and safe paths", async function testProjects(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "project_user");

        const files = { "index.html": "<!doctype html><html><body>Status</body></html>" };
        const first = await client.post(`/api/v1/projects/${PROJECT_ID}/revisions`, {
            baseRevision: 0,
            message: "Initial structure",
            files,
        });
        expect(first.status).toBe(200);
        const firstDetail = ProjectDetailSchema.parse(await readJson(first));
        expect(firstDetail.project.currentRevision).toBe(1);
        expect(firstDetail.revisions.length).toBe(1);

        const conflict = await client.post(`/api/v1/projects/${PROJECT_ID}/revisions`, {
            baseRevision: 0,
            message: "Stale edit",
            files,
        });
        expect(conflict.status).toBe(409);
        const conflictBody = await readJson(conflict);
        expectApiError(conflictBody, "project_revision_conflict");
        expect(field(field(conflictBody, "error"), "details")).toMatchObject({
            currentRevision: 1,
        });

        const unsafe = await client.post(`/api/v1/projects/${PROJECT_ID}/revisions`, {
            baseRevision: 1,
            message: "Unsafe",
            files: { "../escape.txt": "no" },
        });
        expect(unsafe.status).toBe(400);
        expectApiError(await readJson(unsafe), "validation_error");

        const syncConflict = await postSync(client, [
            {
                kind: "project-revision",
                operationId: "project-conflict-op",
                projectId: PROJECT_ID,
                baseRevision: 0,
                message: "Stale sync",
                files,
            },
        ]);
        expect(syncConflict.results[0]?.status).toBe("conflict");
        expect(syncConflict.results[0]?.code).toBe("project_revision_conflict");

        const syncAccepted = await postSync(client, [
            {
                kind: "project-revision",
                operationId: "project-accepted-op",
                projectId: PROJECT_ID,
                baseRevision: 1,
                message: "Second revision",
                files,
            },
        ]);
        expect(syncAccepted.results[0]?.status).toBe("accepted");
        expect(syncAccepted.results[0]?.revision).toBe(2);

        const detail = await client.get(`/api/v1/projects/${PROJECT_ID}`);
        expect(detail.status).toBe(200);
        const parsed = ProjectDetailSchema.parse(await readJson(detail));
        expect(parsed.revisions.length).toBe(2);
        expect(parsed.project.currentRevision).toBe(2);
    });

    it("creates attempts and links attempt evidence", async function testAttempts(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "attempt_user");

        const started = await client.post("/api/v1/attempts", {
            missionId: MISSION_ID,
            missionVersion: MISSION_VERSION,
        });
        expect(started.status).toBe(201);
        const attempt = AttemptStartResponseSchema.parse(await readJson(started));

        const evidence = buildEvidence(MISSION_ID, MISSION_VERSION);
        const submitted = await client.post(`/api/v1/attempts/${attempt.attemptId}/evidence`, {
            evidence,
        });
        expect(submitted.status).toBe(200);
        EvidenceResultSchema.parse(await readJson(submitted));

        const stored = await context.pool.query<{ attempt_id: string | null; mission_id: string }>(
            "SELECT attempt_id, mission_id FROM learning_evidence WHERE id = $1",
            [evidence.id],
        );
        expect(stored.rows[0]?.attempt_id).toBe(attempt.attemptId);
        expect(stored.rows[0]?.mission_id).toBe(MISSION_ID);

        const mismatch = await client.post(`/api/v1/attempts/${attempt.attemptId}/evidence`, {
            evidence: { ...evidence, id: crypto.randomUUID(), attemptId: crypto.randomUUID() },
        });
        expect(mismatch.status).toBe(400);
        expectApiError(await readJson(mismatch), "attempt_mismatch");
    });

    it("grants achievements from aggregated evidence", async function testAchievements(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "achievement_user");
        let snapshot = await postSync(client, []);
        for (let index = 0; index < 3; index += 1) {
            snapshot = await postSync(client, [
                {
                    kind: "evidence",
                    operationId: `testing-evidence-${String(index)}`,
                    evidence: buildEvidence(MISSION_ID, MISSION_VERSION, {
                        id: crypto.randomUUID(),
                        category: "testing",
                    }),
                },
            ]);
        }
        expect(
            snapshot.achievements.some(function boundary(record): boolean {
                return record.achievementId === "achievement.boundary-finder";
            }),
        ).toBe(true);
        expect(snapshot.progress.achievements.length).toBeGreaterThan(0);
    });

    it("calculates project, debugging, and static-analysis achievement counters", async function testAchievementCounters(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "achievement_counters");

        await client.post("/api/v1/me/evidence", {
            evidence: buildEvidence(PROJECT_ID, 1, {
                id: crypto.randomUUID(),
                category: "construction",
            }),
        });
        await postSync(client, [
            buildCompletionOperation("static-analysis-c", "c.memory", 1, "attempt-c-1"),
            buildCompletionOperation(
                "static-analysis-python",
                "python.values",
                1,
                "attempt-python-1",
            ),
        ]);
        await client.post("/api/v1/me/evidence", {
            evidence: buildEvidence(MISSION_ID, MISSION_VERSION, {
                id: crypto.randomUUID(),
                category: "construction",
            }),
        });
        for (let index = 0; index < 5; index += 1) {
            await client.post("/api/v1/me/evidence", {
                evidence: buildEvidence(MISSION_ID, MISSION_VERSION, {
                    id: crypto.randomUUID(),
                    category: "debugging",
                }),
            });
        }

        const snapshot = await postSync(client, []);
        const earned = new Set(
            snapshot.achievements.map(function idOf(record): string {
                return record.achievementId;
            }),
        );
        expect(earned.has("achievement.project-shipper")).toBe(true);
        expect(earned.has("achievement.debugger")).toBe(true);
        expect(earned.has("achievement.polyglot")).toBe(true);
    });

    it("merges guest progress without lowering newer account data", async function testGuestProgressMerge(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "guest_progress_user");
        const completion = buildCompletionOperation(
            "guest-completion-op",
            MISSION_ID,
            MISSION_VERSION,
            "guest-attempt-op",
        );
        const first = await postSync(client, [completion]);
        expect(first.progress.experience).toBe(57);

        const merged = await postSync(client, [
            {
                kind: "progress",
                operationId: "guest-progress-lower",
                experience: 10,
                streakDays: 1,
                longestStreak: 1,
                lastPracticeOn: "2020-01-01",
                placementSkippedSkills: ["concept.state"],
                achievements: ["achievement.first-transfer"],
            },
        ]);
        expect(merged.progress.experience).toBe(57);
        expect(merged.progress.streakDays).toBe(1);
        expect(merged.progress.placementSkippedSkills).toContain("concept.state");
        expect(
            merged.achievements.some(function transfer(record): boolean {
                return record.achievementId === "achievement.first-transfer";
            }),
        ).toBe(true);

        const second = await postSync(client, [
            {
                kind: "progress",
                operationId: "guest-progress-newer",
                experience: 500,
                streakDays: 4,
                longestStreak: 9,
                lastPracticeOn: "2026-10-20",
                placementSkippedSkills: ["concept.computation"],
                achievements: ["achievement.unknown"],
            },
        ]);
        expect(second.progress.experience).toBe(500);
        expect(second.progress.streakDays).toBe(4);
        expect(second.progress.longestStreak).toBe(9);
        expect(second.progress.lastPracticeOn).not.toBe("2020-01-01");
        expect(second.progress.placementSkippedSkills).toEqual([
            "concept.state",
            "concept.computation",
        ]);
        expect(
            second.achievements.some(function unknown(record): boolean {
                return record.achievementId === "achievement.unknown";
            }),
        ).toBe(false);
    });

    it("does not advance reviews for assisted completion or assisted review evidence", async function testReviewEvidence(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "review_evidence_user");

        for (let index = 0; index < 2; index += 1) {
            await client.post("/api/v1/me/evidence", {
                evidence: buildEvidence(MISSION_ID, MISSION_VERSION, {
                    id: crypto.randomUUID(),
                    category: "review",
                }),
            });
        }
        const advanced = await postSync(client, []);
        const before = advanced.reviews.find(function concept(review): boolean {
            return review.skillId === "concept.computation";
        });
        expect(before?.intervalIndex).toBe(1);

        const assisted = await postSync(client, [
            {
                kind: "mission-completion",
                operationId: "assisted-completion-op",
                missionId: MISSION_ID,
                missionVersion: MISSION_VERSION,
                attemptId: "assisted-attempt-op",
                independent: false,
                completedAt: new Date().toISOString(),
            },
        ]);
        const after = assisted.reviews.find(function concept(review): boolean {
            return review.skillId === "concept.computation";
        });
        expect(after?.intervalIndex).toBe(0);
        expect(after?.lastOutcome).toBe("failure");

        await client.post("/api/v1/me/evidence", {
            evidence: buildEvidence(
                "before-code.remember-this",
                context.content.getMission("before-code.remember-this")?.version ?? 1,
                {
                    id: crypto.randomUUID(),
                    category: "review",
                    assistance: "hint-1",
                    independence: 0.8,
                },
            ),
        });
        const snapshot = await postSync(client, []);
        const assistedReview = snapshot.reviews.find(function state(review): boolean {
            return review.skillId === "concept.state";
        });
        expect(assistedReview?.lastOutcome).toBe("failure");
        expect(assistedReview?.intervalIndex).toBe(0);
    });

    it("rejects unknown missions and version mismatches without failing the batch", async function testRejectedOperations(): Promise<void> {
        const client = new TestClient(context.app);
        await register(client, "rejected_user");
        const snapshot = await postSync(client, [
            {
                kind: "evidence",
                operationId: "unknown-mission-op",
                evidence: buildEvidence("unknown.mission", 1),
            },
            {
                kind: "evidence",
                operationId: "wrong-version-op",
                evidence: buildEvidence(MISSION_ID, 99),
            },
        ]);
        expect(snapshot.results.length).toBe(2);
        expect(snapshot.results[0]?.status).toBe("rejected");
        expect(snapshot.results[0]?.code).toBe("unknown_mission");
        expect(snapshot.results[1]?.status).toBe("rejected");
        expect(snapshot.results[1]?.code).toBe("mission_version_mismatch");
        expect(snapshot.mastery.length).toBe(0);
    });
});
