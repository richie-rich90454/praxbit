import { Hono } from "hono";
import type { ApplicationServices } from "../services/application-services.ts";
import type { AppEnvironment } from "../types.ts";
import { OPENAPI_DOCUMENT } from "../openapi/document.ts";

export function createHealthRoutes(
    services: ApplicationServices,
    startedAt: number,
): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/healthz", function health(context): Response {
        return context.json({
            status: "ok",
            uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        });
    });

    routes.get("/readyz", async function ready(context): Promise<Response> {
        try {
            await services.pool.query("SELECT 1");
            return context.json({ status: "ready" });
        } catch {
            return context.json({ status: "not_ready" }, 503);
        }
    });

    return routes;
}

export function createOpenApiRoutes(): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/openapi.json", function openapi(context): Response {
        return context.json(OPENAPI_DOCUMENT);
    });

    return routes;
}
