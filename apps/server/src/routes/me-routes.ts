import { Hono } from "hono";
import { z } from "zod";
import { AttemptEvidenceRequestSchema } from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { withTransaction } from "../db/pool.ts";
import { parseRequestBody } from "../http/validation.ts";
import { clearSessionCookie, requireSession } from "../http/middleware.ts";
import type { AppEnvironment } from "../types.ts";

const EmptyRequestSchema = z.strictObject({});

export function createMeRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/", async function me(context): Promise<Response> {
        const session = requireSession(context);
        const preferences = await services.users.getPreferences(services.pool, session.user.id);
        const progress = await services.users.getProgress(services.pool, session.user.id);
        const completions = await services.users.listCompletions(services.pool, session.user.id);
        return context.json({
            user: session.user,
            preferences,
            progress,
            completions: [...completions],
        });
    });

    routes.get("/progress", async function progress(context): Promise<Response> {
        const session = requireSession(context);
        const row = await services.users.getProgress(services.pool, session.user.id);
        const mastery = await services.users.listMastery(services.pool, session.user.id);
        const reviews = await services.users.listReviews(services.pool, session.user.id);
        return context.json({ progress: row, mastery: [...mastery], reviews: [...reviews] });
    });

    routes.post("/export", async function exportAccount(context): Promise<Response> {
        const session = requireSession(context);
        await parseRequestBody(context, EmptyRequestSchema);
        const bundle = await services.account.exportAccount(session.user.id, new Date());
        return context.json(bundle);
    });

    routes.delete("/", async function deleteAccount(context): Promise<Response> {
        const session = requireSession(context);
        await services.account.deleteAccount({
            userId: session.user.id,
            requestId: context.get("requestId"),
            now: new Date(),
        });
        clearSessionCookie(context, services.config);
        return context.body(null, 204);
    });

    routes.post("/evidence", async function submitEvidence(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, AttemptEvidenceRequestSchema);
        const result = await withTransaction(services.pool, async function work(client) {
            return services.evidence.applyEvidence(
                client,
                session.user.id,
                body.evidence,
                new Date(),
            );
        });
        return context.json(result);
    });

    return routes;
}
