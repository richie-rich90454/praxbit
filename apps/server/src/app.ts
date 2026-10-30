import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { ZodError } from "zod";
import type { Pool } from "pg";
import { isWebBuildPresent, type ServerConfig } from "./config.ts";
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
import {
    createHealthRoutes,
    createCapabilityRoutes,
    createOpenApiRoutes,
} from "./routes/health-routes.ts";
import {
    createMetricsRegistry,
    createMetricsRoutes,
    metricsMiddleware,
} from "./routes/metrics-routes.ts";
import type { AppEnvironment } from "./types.ts";

export interface ApplicationDependencies {
    readonly config: ServerConfig;
    readonly pool: Pool;
    readonly content: ContentCatalog;
    readonly webDirectory?: string;
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
    const metrics = createMetricsRegistry();
    const webRoot =
        dependencies.webDirectory === undefined ? undefined : resolve(dependencies.webDirectory);
    const webBuildPresent = isWebBuildPresent(webRoot);

    app.use("*", requestIdMiddleware());
    app.use("*", metricsMiddleware(metrics));
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

    app.route(
        "/",
        createHealthRoutes(services, {
            startedAt,
            webBuildPresent,
            webBuildRequired: dependencies.config.nodeEnvironment === "production",
        }),
    );
    app.route("/api/v1", createOpenApiRoutes());
    app.route("/api/v1", createCapabilityRoutes(services));
    app.route(
        "/",
        createMetricsRoutes(services, metrics, {
            webBuildPresent,
            webBuildRequired: dependencies.config.nodeEnvironment === "production",
        }),
    );
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

    if (webRoot !== undefined && existsSync(webRoot)) {
        const webRootPath: string = webRoot;
        const contentTypes: Readonly<Record<string, string>> = {
            ".css": "text/css; charset=utf-8",
            ".html": "text/html; charset=utf-8",
            ".ico": "image/x-icon",
            ".js": "text/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".map": "application/json; charset=utf-8",
            ".mjs": "text/javascript; charset=utf-8",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".wasm": "application/wasm",
            ".webmanifest": "application/manifest+json; charset=utf-8",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
        };

        async function readWebFile(
            pathname: string,
        ): Promise<
            { readonly body: Blob; readonly type: string; readonly cache: string } | undefined
        > {
            const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
            const absolute = resolve(webRootPath, relative);
            if (absolute !== webRootPath && !absolute.startsWith(`${webRootPath}${sep}`)) {
                return undefined;
            }
            try {
                const information = await stat(absolute);
                if (!information.isFile()) {
                    return undefined;
                }
                return {
                    body: new Blob([new Uint8Array(await readFile(absolute))]),
                    type:
                        contentTypes[extname(absolute).toLowerCase()] ?? "application/octet-stream",
                    cache: relative.startsWith("assets/")
                        ? "public, max-age=31536000, immutable"
                        : "no-cache",
                };
            } catch {
                return undefined;
            }
        }

        app.all("/api", function apiRootNotFound(context): Response {
            return context.json(
                errorBody("not_found", "No route matches this request.", context.get("requestId")),
                404,
            );
        });
        app.all("/api/*", function apiNotFound(context): Response {
            return context.json(
                errorBody("not_found", "No route matches this request.", context.get("requestId")),
                404,
            );
        });
        app.get("*", async function serveWeb(context): Promise<Response> {
            const requested = await readWebFile(context.req.path);
            if (requested !== undefined) {
                return context.body(requested.body, 200, {
                    "content-type": requested.type,
                    "cache-control": requested.cache,
                });
            }
            const extension = extname(context.req.path).toLowerCase();
            const looksLikeAsset =
                context.req.path.startsWith("/assets/") ||
                (extension.length > 0 && contentTypes[extension] !== undefined);
            if (looksLikeAsset) {
                return context.text("Not found", 404);
            }
            const shell = await readWebFile("/");
            if (shell === undefined) {
                return context.json(
                    errorBody(
                        "web_build_missing",
                        "The web build is missing. Run pnpm build before starting the server.",
                        context.get("requestId"),
                    ),
                    503,
                );
            }
            return context.body(shell.body, 200, {
                "content-type": shell.type,
                "cache-control": "no-cache",
            });
        });
    }

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
