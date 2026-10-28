import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
    ClubDetailSchema,
    ClubSchema,
    EventSubmissionResponseSchema,
} from "../../../packages/contracts/src/index.ts";
import {
    closeTestContext,
    createTestContext,
    resetDatabase,
    type TestContext,
} from "./helpers/database.ts";
import { TestClient, expectApiError, field, readJson, register } from "./helpers/client.ts";

function hashAnswer(salt: string, answer: string): string {
    return createHash("sha256").update(`${salt}${answer}`).digest("hex");
}

describe("clubs, verified events, and moderation", function clubSuite(): void {
    let context: TestContext;

    beforeAll(async function setup(): Promise<void> {
        context = await createTestContext();
    });

    afterAll(async function teardown(): Promise<void> {
        await closeTestContext(context);
    });

    beforeEach(async function reset(): Promise<void> {
        await resetDatabase(context);
    });

    it("creates clubs, joins with invite codes, and enforces membership", async function testClubs(): Promise<void> {
        const owner = new TestClient(context.app);
        const member = new TestClient(context.app);
        const outsider = new TestClient(context.app);
        await register(owner, "club_owner");
        await register(member, "club_member");
        await register(outsider, "club_outsider");

        const created = await owner.post("/api/v1/clubs", { name: "Campus Repair Guild" });
        expect(created.status).toBe(201);
        const club = ClubSchema.parse(await readJson(created));
        expect(club.role).toBe("owner");
        expect(club.inviteCode).toBeDefined();
        expect(club.memberCount).toBe(1);

        const joined = await member.post("/api/v1/clubs/join", {
            inviteCode: club.inviteCode ?? "",
        });
        expect(joined.status).toBe(200);
        const joinedClub = ClubSchema.parse(await readJson(joined));
        expect(joinedClub.role).toBe("member");
        expect(joinedClub.memberCount).toBe(2);

        const denied = await outsider.get(`/api/v1/clubs/${club.id}`);
        expect(denied.status).toBe(403);
        expectApiError(await readJson(denied), "club_forbidden");

        const anonymous = await new TestClient(context.app).get(`/api/v1/clubs/${club.id}`);
        expect(anonymous.status).toBe(401);

        const detail = await owner.get(`/api/v1/clubs/${club.id}`);
        expect(detail.status).toBe(200);
        const parsed = ClubDetailSchema.parse(await readJson(detail));
        expect(parsed.members.length).toBe(2);
        expect(parsed.events.length).toBeGreaterThan(0);
        const event = parsed.events[0];
        expect(event).toBeDefined();
        if (event !== undefined) {
            expect("answerHash" in event).toBe(false);
            expect("answerSalt" in event).toBe(false);
        }
    });

    it("verifies hashed event answers and counts only verified points once", async function testEventVerification(): Promise<void> {
        const event = context.content.clubEvents[0];
        if (event === undefined) {
            throw new Error("The content catalog has no club event.");
        }
        const validAnswer = "idempotency-key";
        expect(hashAnswer(event.answerSalt, validAnswer)).toBe(event.answerHash);

        const owner = new TestClient(context.app);
        const member = new TestClient(context.app);
        await register(owner, "event_owner");
        await register(member, "event_member");

        const created = await owner.post("/api/v1/clubs", { name: "Incident Club" });
        const club = ClubSchema.parse(await readJson(created));
        await member.post("/api/v1/clubs/join", { inviteCode: club.inviteCode ?? "" });

        const wrong = await member.post(`/api/v1/events/${event.id}/submissions`, {
            eventId: event.id,
            answer: "sleep",
        });
        expect(wrong.status).toBe(200);
        const wrongResult = EventSubmissionResponseSchema.parse(await readJson(wrong));
        expect(wrongResult.verified).toBe(false);
        expect(wrongResult.points).toBe(0);
        expect(wrongResult.leaderboard.length).toBe(0);

        const correct = await member.post(`/api/v1/events/${event.id}/submissions`, {
            eventId: event.id,
            answer: validAnswer,
        });
        expect(correct.status).toBe(200);
        const correctResult = EventSubmissionResponseSchema.parse(await readJson(correct));
        expect(correctResult.verified).toBe(true);
        expect(correctResult.points).toBe(event.points);
        const memberEntry = correctResult.leaderboard.find(function handleOf(entry): boolean {
            return entry.handle === "event_member";
        });
        expect(memberEntry?.points).toBe(event.points);

        const replay = await member.post(`/api/v1/events/${event.id}/submissions`, {
            eventId: event.id,
            answer: validAnswer,
        });
        const replayResult = EventSubmissionResponseSchema.parse(await readJson(replay));
        expect(replayResult.verified).toBe(true);
        expect(replayResult.points).toBe(event.points);
        const replayEntry = replayResult.leaderboard.find(function handleOf(entry): boolean {
            return entry.handle === "event_member";
        });
        expect(replayEntry?.points).toBe(event.points);

        const ownerSubmission = await owner.post(`/api/v1/events/${event.id}/submissions`, {
            eventId: event.id,
            answer: validAnswer,
        });
        const ownerResult = EventSubmissionResponseSchema.parse(await readJson(ownerSubmission));
        expect(ownerResult.leaderboard.length).toBe(2);

        const detail = await member.get(`/api/v1/clubs/${club.id}`);
        const parsed = ClubDetailSchema.parse(await readJson(detail));
        expect(parsed.submissions.length).toBe(1);
        expect(parsed.submissions[0]?.points).toBe(event.points);
    });

    it("reports clubs and lets administrators review reports", async function testReports(): Promise<void> {
        const owner = new TestClient(context.app);
        const reporter = new TestClient(context.app);
        const admin = new TestClient(context.app);
        await register(owner, "report_owner");
        await register(reporter, "report_member");
        await register(admin, "admin_handle");

        const created = await owner.post("/api/v1/clubs", { name: "Reported Club" });
        const club = ClubSchema.parse(await readJson(created));
        await reporter.post("/api/v1/clubs/join", { inviteCode: club.inviteCode ?? "" });

        const report = await reporter.post(`/api/v1/clubs/${club.id}/reports`, {
            reason: "A club member is sharing unsafe external links.",
        });
        expect(report.status).toBe(201);
        const reportId = field(await readJson(report), "reportId");
        expect(typeof reportId).toBe("string");

        const denied = await reporter.get("/api/v1/admin/reports");
        expect(denied.status).toBe(403);

        const listed = await admin.get("/api/v1/admin/reports");
        expect(listed.status).toBe(200);
        const items = field(await readJson(listed), "items");
        expect(Array.isArray(items)).toBe(true);
        if (Array.isArray(items)) {
            expect(items.length).toBe(1);
        }

        const resolved = await admin.post(`/api/v1/admin/reports/${String(reportId)}/resolve`, {});
        expect(resolved.status).toBe(204);

        const after = await admin.get("/api/v1/admin/reports");
        const afterItems = field(await readJson(after), "items");
        expect(Array.isArray(afterItems)).toBe(true);
        if (Array.isArray(afterItems)) {
            expect(afterItems.length).toBe(0);
        }
    });
});
