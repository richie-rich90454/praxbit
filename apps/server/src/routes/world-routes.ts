import { Hono } from "hono";
import { WorldActionRequestSchema } from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { AppError } from "../http/app-error.ts";
import { parseRequestBody } from "../http/validation.ts";
import { requireSession } from "../http/middleware.ts";
import type { AppEnvironment } from "../types.ts";

export function createWorldRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/:id", async function getWorld(context): Promise<Response> {
        const session = requireSession(context);
        const worldId = context.req.param("id");
        if (worldId !== "campus") {
            throw new AppError(404, "world_not_found", "Unknown world.");
        }
        const world = await services.world.getWorld(session.user.id);
        return context.json({ world });
    });

    routes.post("/campus/actions", async function applyAction(context): Promise<Response> {
        const session = requireSession(context);
        const body = await parseRequestBody(context, WorldActionRequestSchema);
        const outcome = await services.world.applyAction({
            userId: session.user.id,
            expectedVersion: body.expectedVersion,
            action: body.action,
            now: new Date(),
        });
        return context.json({
            world: outcome.world,
            changed: outcome.changed,
            message: outcome.message,
        });
    });

    return routes;
}
