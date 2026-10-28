import { Hono } from "hono";
import { SyncRequestSchema } from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { parseRequestBody } from "../http/validation.ts";
import { requireSession } from "../http/middleware.ts";
import type { AppEnvironment } from "../types.ts";

export function createSyncRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.post("/", async function synchronize(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, SyncRequestSchema);
        const response = await services.sync.synchronize({
            userId: session.user.id,
            operations: body.operations,
            now: new Date(),
        });
        return context.json(response);
    });

    return routes;
}
