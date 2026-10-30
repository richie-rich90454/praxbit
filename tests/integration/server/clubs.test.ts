import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
    ClubDetailSchema,
    ClubEventSummarySchema,
    ClubInvitesResponseSchema,
    ClubInviteSchema,
    ClubSchema,
    EventSubmissionResponseSchema,
    MeResponseSchema,
    WorldActionResponseSchema,
    WorldResponseSchema,
    type ClubEvent,
} from "../../../packages/contracts/src/index.ts";
import { isWorldRecovered } from "../../../packages/domain/src/index.ts";
import { createApplication } from "../../../apps/server/src/app.ts";
import { ContentCatalog } from "../../../apps/server/src/content/catalog.ts";
import { clubWeek } from "../../../apps/server/src/services/club-service.ts";
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

function addDays(isoDate: string, days: number): string {
    const value = new Date(`${isoDate}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

function catalogForActiveWeek(context: TestContext): {
    readonly catalog: ContentCatalog;
    readonly activeEvent: ClubEvent;
    readonly pastEvent: ClubEvent;
    readonly activeWeekOf: string;
} {
    const base = context.content.clubEvents[0];
    if (base === undefined) {
        throw new Error("The content catalog has no club event.");
    }
    const activeWeekOf = clubWeek(new Date()).activeWeekOf;
    const activeEvent: ClubEvent = { ...base, weekOf: activeWeekOf };
    const pastEvent: ClubEvent = {
        ...base,
        id: "campus.past-week",
        title: `${base.title} (past week)`,
        weekOf: addDays(activeWeekOf, -7),
    };
    const catalog = new ContentCatalog({
        missions: context.content.missions,
        skills: context.content.skills,
        tracks: context.content.tracks,
        projects: context.content.projects,
        achievements: context.content.achievements,
        clubEvents: [activeEvent, pastEvent],
        placement: context.content.placement,
        skillGraph: context.content.skillGraph,
    });
    return { catalog, activeEvent, pastEvent, activeWeekOf };
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
        const weekly = catalogForActiveWeek(context);
        const event = weekly.activeEvent;
        const app = createApplication({
            config: context.config,
            pool: context.pool,
            content: weekly.catalog,
        });
        const validAnswer = "idempotency-key";
        expect(hashAnswer(event.answerSalt, validAnswer)).toBe(event.answerHash);

        const owner = new TestClient(app);
        const member = new TestClient(app);
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
            details: "The links appeared in a verified event answer thread.",
            targetType: "member",
            targetHandle: "report_member",
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
            const records: readonly unknown[] = items as readonly unknown[];
            const item = records[0];
            expect(field(item, "targetType")).toBe("member");
            expect(field(item, "targetHandle")).toBe("report_member");
            expect(field(item, "details")).toBe(
                "The links appeared in a verified event answer thread.",
            );
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

    it("lets owners promote, demote, and remove members while keeping a last owner", async function testRoles(): Promise<void> {
        const owner = new TestClient(context.app);
        const member = new TestClient(context.app);
        await register(owner, "role_owner");
        await register(member, "role_member");

        const created = await owner.post("/api/v1/clubs", { name: "Role Club" });
        const club = ClubSchema.parse(await readJson(created));
        await member.post("/api/v1/clubs/join", { inviteCode: club.inviteCode ?? "" });

        const denied = await member.post(`/api/v1/clubs/${club.id}/members/role_owner/role`, {
            role: "member",
        });
        expect(denied.status).toBe(403);
        expectApiError(await readJson(denied), "club_owner_required");

        const promoted = await owner.post(`/api/v1/clubs/${club.id}/members/role_member/role`, {
            role: "owner",
        });
        expect(promoted.status).toBe(204);

        const afterPromotion = ClubDetailSchema.parse(
            await readJson(await owner.get(`/api/v1/clubs/${club.id}`)),
        );
        expect(
            afterPromotion.members.filter(function ownerRole(item): boolean {
                return item.role === "owner";
            }).length,
        ).toBe(2);

        const demoted = await member.post(`/api/v1/clubs/${club.id}/members/role_owner/role`, {
            role: "member",
        });
        expect(demoted.status).toBe(204);

        const lastOwnerDemote = await member.post(
            `/api/v1/clubs/${club.id}/members/role_member/role`,
            { role: "member" },
        );
        expect(lastOwnerDemote.status).toBe(409);
        expectApiError(await readJson(lastOwnerDemote), "last_owner_required");

        const lastOwnerRemove = await member.delete(`/api/v1/clubs/${club.id}/members/role_member`);
        expect(lastOwnerRemove.status).toBe(409);
        expectApiError(await readJson(lastOwnerRemove), "last_owner_required");

        const removed = await member.delete(`/api/v1/clubs/${club.id}/members/role_owner`);
        expect(removed.status).toBe(204);

        const finalDetail = ClubDetailSchema.parse(
            await readJson(await member.get(`/api/v1/clubs/${club.id}`)),
        );
        expect(finalDetail.members).toHaveLength(1);
        expect(finalDetail.members[0]?.role).toBe("owner");
    });

    it("enforces invite expiry, use limits, revocation, and legacy codes", async function testInvites(): Promise<void> {
        const owner = new TestClient(context.app);
        const first = new TestClient(context.app);
        const second = new TestClient(context.app);
        const third = new TestClient(context.app);
        await register(owner, "invite_owner");
        await register(first, "invite_first");
        await register(second, "invite_second");
        await register(third, "invite_third");

        const created = await owner.post("/api/v1/clubs", { name: "Invite Club" });
        const club = ClubSchema.parse(await readJson(created));

        const denied = await first.get(`/api/v1/clubs/${club.id}/invites`);
        expect(denied.status).toBe(403);

        const singleUse = await owner.post(`/api/v1/clubs/${club.id}/invites`, {
            maxUses: 1,
            expiresInHours: 2,
        });
        expect(singleUse.status).toBe(201);
        const invite = ClubInviteSchema.parse(await readJson(singleUse));

        const joined = await first.post("/api/v1/clubs/join", { inviteCode: invite.code });
        expect(joined.status).toBe(200);

        const reused = await second.post("/api/v1/clubs/join", { inviteCode: invite.code });
        expect(reused.status).toBe(409);
        expectApiError(await readJson(reused), "invite_unavailable");

        const expiring = await owner.post(`/api/v1/clubs/${club.id}/invites`, {
            maxUses: 5,
            expiresInHours: 1,
        });
        const expiringInvite = ClubInviteSchema.parse(await readJson(expiring));
        await context.pool.query(
            "UPDATE club_invites SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE id = $1",
            [expiringInvite.id],
        );
        const expired = await second.post("/api/v1/clubs/join", {
            inviteCode: expiringInvite.code,
        });
        expect(expired.status).toBe(409);
        expectApiError(await readJson(expired), "invite_unavailable");

        const revocable = await owner.post(`/api/v1/clubs/${club.id}/invites`, {
            maxUses: 5,
            expiresInHours: 2,
        });
        const revocableInvite = ClubInviteSchema.parse(await readJson(revocable));
        const revoked = await owner.post(
            `/api/v1/clubs/${club.id}/invites/${revocableInvite.id}/revoke`,
            {},
        );
        expect(revoked.status).toBe(204);

        const listed = ClubInvitesResponseSchema.parse(
            await readJson(await owner.get(`/api/v1/clubs/${club.id}/invites`)),
        );
        const revokedEntry = listed.invites.find(function match(item): boolean {
            return item.id === revocableInvite.id;
        });
        expect(revokedEntry?.revokedAt).toBeDefined();

        const revokedJoin = await second.post("/api/v1/clubs/join", {
            inviteCode: revocableInvite.code,
        });
        expect(revokedJoin.status).toBe(409);
        expectApiError(await readJson(revokedJoin), "invite_unavailable");

        const legacyJoin = await third.post("/api/v1/clubs/join", {
            inviteCode: club.inviteCode ?? "",
        });
        expect(legacyJoin.status).toBe(200);
    });

    it("returns the active week for participation and keeps past events closed", async function testWeekFiltering(): Promise<void> {
        const weekly = catalogForActiveWeek(context);
        const app = createApplication({
            config: context.config,
            pool: context.pool,
            content: weekly.catalog,
        });
        const owner = new TestClient(app);
        const member = new TestClient(app);
        await register(owner, "week_owner");
        await register(member, "week_member");

        const created = await owner.post("/api/v1/clubs", { name: "Weekly Club" });
        const club = ClubSchema.parse(await readJson(created));
        await member.post("/api/v1/clubs/join", { inviteCode: club.inviteCode ?? "" });

        const events = ClubEventSummarySchema.array().parse(
            await readJson(await owner.get("/api/v1/events")),
        );
        const active = events.find(function match(item): boolean {
            return item.id === weekly.activeEvent.id;
        });
        const past = events.find(function match(item): boolean {
            return item.id === weekly.pastEvent.id;
        });
        expect(active?.participationOpen).toBe(true);
        expect(past?.participationOpen).toBe(false);

        const detail = ClubDetailSchema.parse(
            await readJson(await owner.get(`/api/v1/clubs/${club.id}`)),
        );
        expect(detail.week.activeWeekOf).toBe(weekly.activeWeekOf);

        const closed = await member.post(`/api/v1/events/${weekly.pastEvent.id}/submissions`, {
            eventId: weekly.pastEvent.id,
            answer: "idempotency-key",
        });
        expect(closed.status).toBe(409);
        expectApiError(await readJson(closed), "event_closed");

        const open = await member.post(`/api/v1/events/${weekly.activeEvent.id}/submissions`, {
            eventId: weekly.activeEvent.id,
            answer: "idempotency-key",
        });
        expect(open.status).toBe(200);
        const openResult = EventSubmissionResponseSchema.parse(await readJson(open));
        expect(openResult.verified).toBe(true);
    });

    it("requires two verified members for the cooperative challenge and team achievement", async function testCooperativeChallenge(): Promise<void> {
        const weekly = catalogForActiveWeek(context);
        const app = createApplication({
            config: context.config,
            pool: context.pool,
            content: weekly.catalog,
        });
        const owner = new TestClient(app);
        const member = new TestClient(app);
        await register(owner, "coop_owner");
        await register(member, "coop_member");

        const created = await owner.post("/api/v1/clubs", { name: "Coop Club" });
        const club = ClubSchema.parse(await readJson(created));
        await member.post("/api/v1/clubs/join", { inviteCode: club.inviteCode ?? "" });

        const first = await member.post(`/api/v1/events/${weekly.activeEvent.id}/submissions`, {
            eventId: weekly.activeEvent.id,
            answer: "idempotency-key",
        });
        expect(first.status).toBe(200);

        const single = ClubDetailSchema.parse(
            await readJson(await member.get(`/api/v1/clubs/${club.id}`)),
        );
        expect(single.cooperativeChallenge?.verifiedMembers).toBe(1);
        expect(single.cooperativeChallenge?.completed).toBe(false);

        const memberMe = MeResponseSchema.parse(await readJson(await member.get("/api/v1/me")));
        expect(
            memberMe.progress.achievements.some(function teammate(item): boolean {
                return item.achievementId === "achievement.teammate";
            }),
        ).toBe(false);

        const second = await owner.post(`/api/v1/events/${weekly.activeEvent.id}/submissions`, {
            eventId: weekly.activeEvent.id,
            answer: "idempotency-key",
        });
        expect(second.status).toBe(200);

        const complete = ClubDetailSchema.parse(
            await readJson(await member.get(`/api/v1/clubs/${club.id}`)),
        );
        expect(complete.cooperativeChallenge?.verifiedMembers).toBe(2);
        expect(complete.cooperativeChallenge?.completed).toBe(true);
        expect(complete.cooperativeChallenge?.participants).toEqual(
            expect.arrayContaining(["coop_owner", "coop_member"]),
        );

        const ownerMe = MeResponseSchema.parse(await readJson(await owner.get("/api/v1/me")));
        expect(
            ownerMe.progress.achievements.some(function teammate(item): boolean {
                return item.achievementId === "achievement.teammate";
            }),
        ).toBe(true);
    });

    it("turns an incorrect restart into an incident and requires a verified recovery", async function testWorldIncident(): Promise<void> {
        const user = new TestClient(context.app);
        await register(user, "world_actor");

        const initial = WorldResponseSchema.parse(
            await readJson(await user.get("/api/v1/worlds/campus")),
        );
        expect(initial.world.flags["incidentOpen"]).toBeUndefined();

        const failed = await user.post("/api/v1/worlds/campus/actions", {
            expectedVersion: initial.world.version,
            action: { id: "restart-service", systemId: "robotics" },
        });
        expect(failed.status).toBe(200);
        const failedOutcome = WorldActionResponseSchema.parse(await readJson(failed));
        expect(failedOutcome.changed).toBe(true);
        expect(failedOutcome.world.flags["incidentOpen"]).toBe(true);
        expect(
            failedOutcome.world.systems.find(function robotics(system): boolean {
                return system.id === "robotics";
            })?.status,
        ).toBe("down");

        const blocked = await user.post("/api/v1/worlds/campus/actions", {
            expectedVersion: failedOutcome.world.version,
            action: { id: "resolve-incident" },
        });
        const blockedOutcome = WorldActionResponseSchema.parse(await readJson(blocked));
        expect(blockedOutcome.changed).toBe(false);
        expect(blockedOutcome.world.flags["incidentResolved"]).toBe(false);

        let version = blockedOutcome.world.version;
        for (const action of [
            { id: "integrate-systems" as const },
            { id: "enable-robotics" as const },
            { id: "restart-service" as const, systemId: "robotics" as const },
            { id: "restore-deploy" as const },
            { id: "publish-storefront" as const },
        ]) {
            const response = await user.post("/api/v1/worlds/campus/actions", {
                expectedVersion: version,
                action,
            });
            expect(response.status).toBe(200);
            version = WorldActionResponseSchema.parse(await readJson(response)).world.version;
        }

        const resolved = await user.post("/api/v1/worlds/campus/actions", {
            expectedVersion: version,
            action: { id: "resolve-incident" },
        });
        expect(resolved.status).toBe(200);
        const resolvedOutcome = WorldActionResponseSchema.parse(await readJson(resolved));
        expect(resolvedOutcome.world.flags["incidentOpen"]).toBeFalsy();
        expect(resolvedOutcome.world.flags["incidentResolved"]).toBe(true);
        expect(isWorldRecovered(resolvedOutcome.world)).toBe(true);
    });
});
