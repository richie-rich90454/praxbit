import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import type { Pool } from "pg";
import type { ServerConfig } from "./config.ts";
import type { ContentCatalog } from "./content/catalog.ts";
import { createApplicationServices } from "./services/application-services.ts";
import { AppError, errorBody } from "./http/app-error.ts";
import {
    authenticationMiddleware,
    csrfMiddleware,
    globalRateLimitMiddleware,
    requestIdMiddleware,
    requestLogMiddleware,
    securityHeadersMiddleware,
} from "./http/middleware.ts";
import { describeZodError } from "./http/validation.ts";
import { createAuthRoutes } from "./routes/auth-routes.ts";
import { createMeRoutes } from "./routes/me-routes.ts";
import { createAttemptRoutes } from "./routes/attempt-routes.ts";
import { createSyncRoutes } from "./routes/sync-routes.ts";
import { createWorldRoutes } from "./routes/world-routes.ts";
import { createProjectRoutes } from "./routes/project-routes.ts";
import { createClubRoutes, createEventRoutes } from "./routes/club-routes.ts";
import { createAiRoutes } from "./routes/ai-routes.ts";
import { createAdminRoutes } from "./routes/admin-routes.ts";
import { createCatalogRoutes } from "./routes/catalog-routes.ts";
import { createHealthRoutes, createOpenApiRoutes } from "./routes/health-routes.ts";
import type { AppEnvironment } from "./types.ts";

export interface ApplicationDependencies {
    readonly config: ServerConfig;
    readonly pool: Pool;
    readonly content: ContentCatalog;
    readonly startedAt?: number;
}

export function createApplication(dependencies: ApplicationDependencies): Hono<AppEnvironment> {
    const services = createApplicationServices({
        config: dependencies.config,
        pool: dependencies.pool,
        content: dependencies.content,
    });
    const app = new Hono<AppEnvironment>();
    const startedAt = dependencies.startedAt ?? Date.now();

    app.use("*", requestIdMiddleware());
    app.use("*", requestLogMiddleware(dependencies.config.nodeEnvironment !== "test"));
    app.use("*", securityHeadersMiddleware(dependencies.config));

    if (dependencies.config.corsOrigins.length > 0) {
        const allowedOrigins = dependencies.config.corsOrigins;
        app.use(
            "*",
            cors({
                origin: function resolveOrigin(origin: string): string | undefined {
                    return allowedOrigins.includes(origin) ? origin : undefined;
                },
                allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
                allowHeaders: [
                    "authorization",
                    "content-type",
                    "x-csrf-token",
                    "x-praxbit-client",
                    "x-request-id",
                ],
                exposeHeaders: ["x-request-id", "retry-after", "x-ratelimit-remaining"],
                maxAge: 600,
                credentials: true,
            }),
        );
    }

    app.use(
        "/api/*",
        bodyLimit({
            maxSize: dependencies.config.bodyLimitBytes,
            onError: function payloadTooLarge(): never {
                throw new AppError(413, "payload_too_large", "The request body is too large.");
            },
        }),
    );
    app.use("/api/*", globalRateLimitMiddleware(services.rateLimiters.global, dependencies.config));
    app.use("/api/*", authenticationMiddleware(services.auth, dependencies.config));
    app.use("/api/*", csrfMiddleware());

    app.route("/", createHealthRoutes(services, startedAt));
    app.route("/api/v1", createOpenApiRoutes());
    app.route("/api/v1/auth", createAuthRoutes(services));
    app.route("/api/v1/me", createMeRoutes(services));
    app.route("/api/v1/attempts", createAttemptRoutes(services));
    app.route("/api/v1/sync", createSyncRoutes(services));
    app.route("/api/v1/worlds", createWorldRoutes(services));
    app.route("/api/v1/projects", createProjectRoutes(services));
    app.route("/api/v1/clubs", createClubRoutes(services));
    app.route("/api/v1/events", createEventRoutes(services));
    app.route("/api/v1/ai", createAiRoutes(services));
    app.route("/api/v1/admin", createAdminRoutes(services));
    app.route("/api/v1", createCatalogRoutes(services));

    app.notFound(function notFound(context): Response {
        return context.json(
            errorBody("not_found", "No route matches this request.", context.get("requestId")),
            404,
        );
    });

    app.onError(function handleError(error, context): Response {
        const requestId = context.get("requestId");
        if (error instanceof AppError) {
            if (error.retryAfterSeconds !== undefined) {
                context.header("retry-after", String(error.retryAfterSeconds));
            }
            return context.json(
                errorBody(error.code, error.message, requestId, error.details),
                error.status,
            );
        }
        if (error instanceof ZodError) {
            return context.json(
                errorBody("validation_error", "The request is invalid.", requestId, {
                    issues: describeZodError(error),
                }),
                400,
            );
        }
        console.error(
            JSON.stringify({
                level: "error",
                event: "unhandled_error",
                requestId,
                name: error.name,
                message: error.message,
            }),
        );
        return context.json(
            errorBody("internal_error", "An unexpected error occurred.", requestId),
            500,
        );
    });

    return app;
}
