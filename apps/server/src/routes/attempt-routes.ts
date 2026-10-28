import { Hono } from "hono";
import { z } from "zod";
import { AttemptEvidenceRequestSchema, AttemptStartRequestSchema } from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { withTransaction } from "../db/pool.ts";
import { AppError } from "../http/app-error.ts";
import { parseRequestBody } from "../http/validation.ts";
import { requireSession } from "../http/middleware.ts";
import type { AppEnvironment } from "../types.ts";

const AttemptIdSchema = z.uuid();

export function createAttemptRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.post("/", async function startAttempt(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, AttemptStartRequestSchema);
        const attempt = await services.attempt.startAttempt({
            userId: session.user.id,
            missionId: body.missionId,
            missionVersion: body.missionVersion,
            now: new Date(),
        });
        return context.json(attempt, 201);
    });

    routes.post("/:id/evidence", async function submitAttemptEvidence(context): Promise<Response> {
        const session = requireSession(context);
        const parsedId = AttemptIdSchema.safeParse(context.req.param("id"));
        if (!parsedId.success) {
            throw new AppError(400, "validation_error", "The attempt id is invalid.");
        }
        const body = await parseRequestBody(context, AttemptEvidenceRequestSchema);
        await services.attempt.requireAttempt(session.user.id, parsedId.data);
        if (body.evidence.attemptId !== undefined && body.evidence.attemptId !== parsedId.data) {
            throw new AppError(
                400,
                "attempt_mismatch",
                "The evidence belongs to a different attempt.",
            );
        }
        const evidence =
            body.evidence.attemptId === undefined
                ? { ...body.evidence, attemptId: parsedId.data }
                : body.evidence;
        const result = await withTransaction(services.pool, async function work(client) {
            return services.evidence.applyEvidence(client, session.user.id, evidence, new Date());
        });
        return context.json(result);
    });

    return routes;
}
