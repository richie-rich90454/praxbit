import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { LoginRequestSchema, RegisterRequestSchema } from "@praxbit/contracts";
import type { ApplicationServices } from "../services/application-services.ts";
import { AppError } from "../http/app-error.ts";
import type { RateLimiter } from "../http/rate-limit.ts";
import { parseRequestBody } from "../http/validation.ts";
import {
    CSRF_COOKIE,
    NATIVE_CLIENT_HEADER,
    clearSessionCookie,
    clientAddress,
    requireSession,
    setCsrfCookie,
    setSessionCookie,
} from "../http/middleware.ts";
import { createOpaqueToken } from "../security/tokens.ts";
import type { AppEnvironment } from "../types.ts";

const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

function enforceRateLimit(limiter: RateLimiter, key: string, scope: string): void {
    const decision = limiter.consume(key);
    if (!decision.allowed) {
        throw new AppError(
            429,
            "rate_limited",
            "Too many attempts. Try again shortly.",
            { scope, retryAfterSeconds: decision.retryAfterSeconds },
            decision.retryAfterSeconds,
        );
    }
}

function isNativeClient(header: string | undefined): boolean {
    return header !== undefined && header.toLowerCase() === "native";
}

export function createAuthRoutes(services: ApplicationServices): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get("/csrf", function issueCsrf(context): Response {
        const existing = getCookie(context, CSRF_COOKIE);
        const token =
            existing !== undefined && CSRF_TOKEN_PATTERN.test(existing)
                ? existing
                : createOpaqueToken();
        setCsrfCookie(context, services.config, token);
        return context.json({ csrfToken: token });
    });

    routes.post("/register", async function register(context): Promise<Response> {
        const body = await parseRequestBody(context, RegisterRequestSchema);
        enforceRateLimit(
            services.rateLimiters.register,
            `${clientAddress(context, services.config.trustProxy)}:${body.handle}`,
            "register",
        );
        const created = await services.auth.register({
            handle: body.handle,
            displayName: body.displayName,
            password: body.password,
            requestId: context.get("requestId"),
            now: new Date(),
        });
        setSessionCookie(context, services.config, created.session.token);
        const nativeToken = isNativeClient(context.req.header(NATIVE_CLIENT_HEADER))
            ? created.session.token
            : undefined;
        return context.json(
            nativeToken === undefined
                ? { user: created.user, preferences: created.preferences }
                : { user: created.user, preferences: created.preferences, nativeToken },
            201,
        );
    });

    routes.post("/login", async function login(context): Promise<Response> {
        const body = await parseRequestBody(context, LoginRequestSchema);
        enforceRateLimit(
            services.rateLimiters.login,
            `${clientAddress(context, services.config.trustProxy)}:${body.handle}`,
            "login",
        );
        const result = await services.auth.login({
            handle: body.handle,
            password: body.password,
            requestId: context.get("requestId"),
            now: new Date(),
        });
        const preferences = await services.users.getPreferences(services.pool, result.user.id);
        setSessionCookie(context, services.config, result.session.token);
        const nativeToken = isNativeClient(context.req.header(NATIVE_CLIENT_HEADER))
            ? result.session.token
            : undefined;
        return context.json(
            nativeToken === undefined
                ? { user: result.user, preferences }
                : { user: result.user, preferences, nativeToken },
        );
    });

    routes.post("/logout", async function logout(context): Promise<Response> {
        const session = context.get("session");
        if (session !== null) {
            await services.auth.logoutSession(session.sessionId, new Date());
        }
        clearSessionCookie(context, services.config);
        return context.body(null, 204);
    });

    routes.delete("/sessions", async function revokeAll(context): Promise<Response> {
        const session = requireSession(context);
        await services.auth.revokeAllSessions(session.user.id, new Date());
        clearSessionCookie(context, services.config);
        return context.body(null, 204);
    });

    return routes;
}
