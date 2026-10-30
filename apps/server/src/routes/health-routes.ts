import { Hono } from "hono";
import type { ApplicationServices } from "../services/application-services.ts";
import type { AppEnvironment } from "../types.ts";
import { OPENAPI_DOCUMENT } from "../openapi/document.ts";
import { SERVER_VERSION } from "../config.ts";

export interface HealthRuntime {
    readonly startedAt: number;
    readonly webBuildPresent: boolean;
    readonly webBuildRequired: boolean;
}

export function createHealthRoutes(
    services: ApplicationServices,
    runtime: HealthRuntime,
): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    function metadata(): Record<string, unknown> {
        return {
            version: SERVER_VERSION,
            environment: services.config.nodeEnvironment,
            capabilities: { aiTutor: services.config.ai !== undefined },
            webBuild: runtime.webBuildPresent,
        };
    }

    routes.get("/healthz", function health(context): Response {
        return context.json({
            status: "ok",
            uptimeSeconds: Math.floor((Date.now() - runtime.startedAt) / 1000),
            ...metadata(),
        });
    });

    routes.get("/readyz", async function ready(context): Promise<Response> {
        let databaseReady = true;
        try {
            await services.pool.query("SELECT 1");
        } catch {
            databaseReady = false;
        }
        const webBuildStatus = runtime.webBuildPresent
            ? "ok"
            : runtime.webBuildRequired
              ? "missing"
              : "disabled";
        const isReady = databaseReady && webBuildStatus !== "missing";
        return context.json(
            {
                status: isReady ? "ready" : "not_ready",
                uptimeSeconds: Math.floor((Date.now() - runtime.startedAt) / 1000),
                ...metadata(),
                checks: {
                    database: databaseReady ? "ok" : "failed",
                    webBuild: webBuildStatus,
                },
            },
            isReady ? 200 : 503,
        );
    });

    return routes;
}

export function createCapabilityRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/capabilities", function capabilities(context): Response {
        return context.json({ aiTutor: services.config.ai !== undefined });
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
