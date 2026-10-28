import { Hono } from "hono";
import { AiHintRequestSchema } from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { parseRequestBody } from "../http/validation.ts";
import { requireSession } from "../http/middleware.ts";
import type { AppEnvironment } from "../types.ts";

export function createAiRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.post("/hints", async function requestHint(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, AiHintRequestSchema);
        const response = await services.ai.requestHint({
            userId: session.user.id,
            request: body,
        });
        return context.json(response);
    });

    return routes;
}
