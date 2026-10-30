import { Hono } from "hono";
import { z } from "zod";
import {
    CreateClubInviteRequestSchema,
    CreateClubRequestSchema,
    EventSubmissionRequestSchema,
    JoinClubRequestSchema,
    ReportClubRequestSchema,
    UpdateClubMemberRoleRequestSchema,
} from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { AppError } from "../http/app-error.ts";
import { RateLimiter } from "../http/rate-limit.ts";
import { parseRequestBody } from "../http/validation.ts";
import { requireSession } from "../http/middleware.ts";
import type { AppEnvironment } from "../types.ts";

const ClubIdSchema = z.uuid();
const InviteIdSchema = z.uuid();
const MemberHandleSchema = z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/i);

function requireClubId(value: string): string {
    const parsed = ClubIdSchema.safeParse(value);
    if (!parsed.success) {
        throw new AppError(400, "validation_error", "The club id is invalid.");
    }
    return parsed.data;
}

function requireInviteId(value: string): string {
    const parsed = InviteIdSchema.safeParse(value);
    if (!parsed.success) {
        throw new AppError(400, "validation_error", "The invite id is invalid.");
    }
    return parsed.data;
}

function requireHandle(value: string): string {
    const parsed = MemberHandleSchema.safeParse(value);
    if (!parsed.success) {
        throw new AppError(400, "validation_error", "The member handle is invalid.");
    }
    return parsed.data;
}

export function createClubRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/", async function listClubs(context): Promise<Response> {
        const session = context.get("session");
        if (session === null) {
            return context.json([]);
        }
        const clubs = await services.club.listClubs(session.user.id);
        return context.json(clubs);
    });

    routes.post("/", async function createClub(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, CreateClubRequestSchema);
        const club = await services.club.createClub({
            userId: session.user.id,
            name: body.name,
            now: new Date(),
        });
        return context.json(club, 201);
    });

    routes.post("/join", async function joinByCode(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, JoinClubRequestSchema);
        const club = await services.club.joinByInviteCode({
            userId: session.user.id,
            inviteCode: body.inviteCode,
            now: new Date(),
        });
        return context.json(club);
    });

    routes.get("/:id", async function getClub(context): Promise<Response> {
        const session = requireSession(context);
        const detail = await services.club.getDetail({
            userId: session.user.id,
            role: session.user.role,
            clubId: requireClubId(context.req.param("id")),
            now: new Date(),
        });
        return context.json(detail);
    });

    routes.post(
        "/:id/members/:handle/role",
        async function updateMemberRole(context): Promise<Response> {
            const session = requireSession(context);
            const body = await parseRequestBody(context, UpdateClubMemberRoleRequestSchema);
            await services.club.updateMemberRole({
                actorUserId: session.user.id,
                clubId: requireClubId(context.req.param("id")),
                handle: requireHandle(context.req.param("handle")),
                role: body.role,
            });
            return context.body(null, 204);
        },
    );

    routes.delete("/:id/members/:handle", async function removeMember(context): Promise<Response> {
        const session = requireSession(context);
        await services.club.removeMember({
            actorUserId: session.user.id,
            clubId: requireClubId(context.req.param("id")),
            handle: requireHandle(context.req.param("handle")),
        });
        return context.body(null, 204);
    });

    routes.get("/:id/invites", async function listInvites(context): Promise<Response> {
        const session = requireSession(context);
        const invites = await services.club.listInvites({
            userId: session.user.id,
            clubId: requireClubId(context.req.param("id")),
        });
        return context.json({ invites });
    });

    routes.post("/:id/invites", async function createInvite(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, CreateClubInviteRequestSchema);
        const invite = await services.club.createInvite({
            userId: session.user.id,
            clubId: requireClubId(context.req.param("id")),
            maxUses: body.maxUses,
            expiresInHours: body.expiresInHours,
            now: new Date(),
        });
        return context.json(invite, 201);
    });

    routes.post(
        "/:id/invites/:inviteId/revoke",
        async function revokeInvite(context): Promise<Response> {
            const session = requireSession(context);
            await services.club.revokeInvite({
                userId: session.user.id,
                clubId: requireClubId(context.req.param("id")),
                inviteId: requireInviteId(context.req.param("inviteId")),
                now: new Date(),
            });
            return context.body(null, 204);
        },
    );

    routes.post("/:id/join", async function joinClub(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, JoinClubRequestSchema);
        const club = await services.club.joinClub({
            userId: session.user.id,
            clubId: requireClubId(context.req.param("id")),
            inviteCode: body.inviteCode,
            now: new Date(),
        });
        return context.json(club);
    });

    routes.post("/:id/reports", async function reportClub(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, ReportClubRequestSchema);
        const reportId = await services.club.reportClub({
            userId: session.user.id,
            role: session.user.role,
            clubId: requireClubId(context.req.param("id")),
            reason: body.reason,
            details: body.details,
            targetType: body.targetType,
            targetHandle: body.targetHandle,
            targetEventId: body.targetEventId,
            now: new Date(),
        });
        return context.json({ reportId }, 201);
    });

    return routes;
}

export function createEventRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();
    const submissionLimiter = new RateLimiter(
        services.config.rateLimits.eventSubmissionsPerHour,
        3_600_000,
    );

    routes.get("/", function listEvents(context): Response {
        const events = services.club.listEvents(new Date());
        return context.json(events);
    });

    routes.post("/:id/submissions", async function submitEvent(context): Promise<Response> {
        const session = requireSession(context);
        const eventId = context.req.param("id");
        const decision = submissionLimiter.consume(session.user.id);
        context.header("x-ratelimit-remaining", String(decision.remaining));
        if (!decision.allowed) {
            throw new AppError(
                429,
                "rate_limited",
                "Too many event submissions. Try again shortly.",
                { scope: "event-submission", retryAfterSeconds: decision.retryAfterSeconds },
                decision.retryAfterSeconds,
            );
        }
        const body = await parseRequestBody(context, EventSubmissionRequestSchema);
        if (body.eventId !== eventId) {
            throw new AppError(
                400,
                "validation_error",
                "The event id does not match the request path.",
            );
        }
        const result = await services.club.submitEvent({
            userId: session.user.id,
            eventId,
            answer: body.answer,
            now: new Date(),
        });
        return context.json(result);
    });

    return routes;
}
