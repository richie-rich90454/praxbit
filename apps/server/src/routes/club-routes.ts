import { Hono } from "hono";
import { z } from "zod";
import {
    CreateClubRequestSchema,
    EventSubmissionRequestSchema,
    JoinClubRequestSchema,
} from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { AppError } from "../http/app-error.ts";
import { parseRequestBody } from "../http/validation.ts";
import { requireSession } from "../http/middleware.ts";
import type { AppEnvironment } from "../types.ts";

const ReportClubRequestSchema = z.strictObject({
    reason: z.string().min(5).max(500),
});

const ClubIdSchema = z.uuid();

function requireClubId(value: string): string {
    const parsed = ClubIdSchema.safeParse(value);
    if (!parsed.success) {
        throw new AppError(400, "validation_error", "The club id is invalid.");
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
        });
        return context.json(detail);
    });

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
            clubId: requireClubId(context.req.param("id")),
            reason: body.reason,
            now: new Date(),
        });
        return context.json({ reportId }, 201);
    });

    return routes;
}

export function createEventRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/", function listEvents(context): Response {
        const events = services.club.listEvents();
        return context.json(events);
    });

    routes.post("/:id/submissions", async function submitEvent(context): Promise<Response> {
        const session = requireSession(context);
        const eventId = context.req.param("id");
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
