import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createHash, randomUUID } from "node:crypto";
import { AppError, forbidden, unauthorized } from "./app-error.ts";
import { constantTimeEquals } from "../security/tokens.ts";
import type { AuthService } from "../services/auth-service.ts";
import type { RateLimiter } from "./rate-limit.ts";
import type { AppEnvironment, AuthenticatedSession } from "../types.ts";
import type { ServerConfig } from "../config.ts";

export const SESSION_COOKIE = "praxbit_session";
export const CSRF_COOKIE = "praxbit_csrf";
export const NATIVE_CLIENT_HEADER = "x-praxbit-client";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,80}$/;
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const ADDRESS_HASH_SALT = randomUUID();

function normalizeAddress(address: string | undefined): string | undefined {
    const value = address?.trim();
    if (value === undefined || value.length === 0) {
        return undefined;
    }
    return value.startsWith("::ffff:") ? value.slice(7) : value;
}

function forwardedAddress(context: Context<AppEnvironment>): string | undefined {
    const forwarded = context.req.header("x-forwarded-for");
    if (forwarded !== undefined) {
        const first = normalizeAddress(forwarded.split(",")[0]);
        if (first !== undefined) {
            return first;
        }
    }
    return normalizeAddress(context.req.header("x-real-ip"));
}

function socketAddress(context: Context<AppEnvironment>): string | undefined {
    try {
        return normalizeAddress(getConnInfo(context).remote.address);
    } catch {
        return undefined;
    }
}

function hashAddress(address: string): string {
    return `forwarded:${createHash("sha256").update(ADDRESS_HASH_SALT).update(address).digest("hex").slice(0, 32)}`;
}

export function clientAddress(context: Context<AppEnvironment>, trustProxy: boolean): string {
    const forwarded = forwardedAddress(context);
    if (trustProxy && forwarded !== undefined) {
        return forwarded;
    }
    const socket = socketAddress(context);
    if (socket !== undefined) {
        return socket;
    }
    // Untrusted proxy headers still separate clients without retaining raw addresses.
    return forwarded === undefined ? "unknown" : hashAddress(forwarded);
}

export function requestIdMiddleware(): MiddlewareHandler<AppEnvironment> {
    return async function handle(context, next): Promise<void> {
        const incoming = context.req.header("x-request-id");
        const requestId =
            incoming !== undefined && REQUEST_ID_PATTERN.test(incoming)
                ? incoming
                : crypto.randomUUID();
        context.set("requestId", requestId);
        context.header("x-request-id", requestId);
        await next();
    };
}

export function requestLogMiddleware(enabled: boolean): MiddlewareHandler<AppEnvironment> {
    return async function handle(context, next): Promise<void> {
        if (!enabled) {
            await next();
            return;
        }
        const startedAt = Date.now();
        await next();
        console.info(
            JSON.stringify({
                level: "info",
                event: "http_request",
                requestId: context.get("requestId"),
                method: context.req.method,
                path: context.req.path,
                status: context.res.status,
                durationMs: Date.now() - startedAt,
            }),
        );
    };
}

export function securityHeadersMiddleware(config: ServerConfig): MiddlewareHandler<AppEnvironment> {
    return async function handle(context, next): Promise<void> {
        context.header("x-content-type-options", "nosniff");
        context.header("x-frame-options", "DENY");
        context.header("referrer-policy", "no-referrer");
        context.header("cross-origin-opener-policy", "same-origin");
        context.header(
            "permissions-policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        );
        if (context.req.path.startsWith("/api/")) {
            context.header(
                "content-security-policy",
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            );
            context.header("cache-control", "no-store");
        } else {
            context.header(
                "content-security-policy",
                [
                    "default-src 'self'",
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob:",
                    "font-src 'self' data:",
                    "connect-src 'self'",
                    "worker-src 'self' blob:",
                    "child-src 'self' blob: data:",
                    "frame-src 'self' blob: data:",
                    "manifest-src 'self'",
                    "object-src 'none'",
                    "base-uri 'none'",
                    "frame-ancestors 'none'",
                ].join("; "),
            );
        }
        if (config.cookieSecure) {
            context.header("strict-transport-security", "max-age=31536000; includeSubDomains");
        }
        await next();
    };
}

export function authenticationMiddleware(
    auth: AuthService,
    _config: ServerConfig,
): MiddlewareHandler<AppEnvironment> {
    return async function handle(context, next): Promise<void> {
        context.set("session", null);
        const authorization = context.req.header("authorization");
        const cookieToken = getCookie(context, SESSION_COOKIE);
        const now = new Date();

        if (authorization !== undefined) {
            const match = /^Bearer\s+(.+)$/i.exec(authorization);
            if (match === null || match[1] === undefined || match[1].length === 0) {
                throw new AppError(401, "invalid_token", "The authorization header is malformed.");
            }
            const resolved = await auth.resolveSessionUser(match[1], now);
            if (resolved === undefined) {
                throw new AppError(401, "invalid_token", "The session is invalid or has expired.");
            }
            context.set("session", {
                user: resolved.user,
                sessionId: resolved.sessionId,
                tokenHash: resolved.tokenHash,
                method: "bearer",
            });
        } else if (cookieToken !== undefined && cookieToken.length > 0) {
            const resolved = await auth.resolveSessionUser(cookieToken, now);
            if (resolved !== undefined) {
                context.set("session", {
                    user: resolved.user,
                    sessionId: resolved.sessionId,
                    tokenHash: resolved.tokenHash,
                    method: "cookie",
                });
            }
        }

        await next();
    };
}

export function csrfMiddleware(): MiddlewareHandler<AppEnvironment> {
    return async function handle(context, next): Promise<void> {
        if (SAFE_METHODS.has(context.req.method)) {
            await next();
            return;
        }
        const session = context.get("session");
        if (session !== null && session.method === "bearer") {
            await next();
            return;
        }
        // A native client establishes its bearer session before it has a
        // session cookie. The custom header forces a CORS preflight, so the
        // configured origin allowlist remains the gate.
        if (
            context.req.header(NATIVE_CLIENT_HEADER)?.toLowerCase() === "native" &&
            getCookie(context, SESSION_COOKIE) === undefined
        ) {
            await next();
            return;
        }
        const cookieToken = getCookie(context, CSRF_COOKIE);
        const headerToken = context.req.header("x-csrf-token");
        if (
            cookieToken === undefined ||
            headerToken === undefined ||
            cookieToken.length === 0 ||
            headerToken.length === 0 ||
            !constantTimeEquals(cookieToken, headerToken)
        ) {
            throw new AppError(403, "csrf_invalid", "Refresh the page and try again.");
        }
        await next();
    };
}

export function globalRateLimitMiddleware(
    limiter: RateLimiter,
    config: ServerConfig,
): MiddlewareHandler<AppEnvironment> {
    return async function handle(context, next): Promise<void> {
        const key = clientAddress(context, config.trustProxy);
        const decision = limiter.consume(key);
        context.header("x-ratelimit-remaining", String(decision.remaining));
        if (!decision.allowed) {
            context.header("retry-after", String(decision.retryAfterSeconds));
            throw new AppError(
                429,
                "rate_limited",
                "Too many requests. Try again shortly.",
                undefined,
                decision.retryAfterSeconds,
            );
        }
        await next();
    };
}

export function requireSession(context: Context<AppEnvironment>): AuthenticatedSession {
    const session = context.get("session");
    if (session === null) {
        throw unauthorized();
    }
    return session;
}

export function requireAdministrator(context: Context<AppEnvironment>): AuthenticatedSession {
    const session = requireSession(context);
    if (session.user.role !== "admin") {
        throw forbidden("admin_required", "Administrator access is required.");
    }
    return session;
}

export function setSessionCookie(
    context: Context<AppEnvironment>,
    config: ServerConfig,
    token: string,
): void {
    setCookie(context, SESSION_COOKIE, token, {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        maxAge: COOKIE_MAX_AGE_SECONDS,
        secure: config.cookieSecure,
    });
}

export function setCsrfCookie(
    context: Context<AppEnvironment>,
    config: ServerConfig,
    token: string,
): void {
    setCookie(context, CSRF_COOKIE, token, {
        path: "/",
        httpOnly: false,
        sameSite: "Lax",
        maxAge: COOKIE_MAX_AGE_SECONDS,
        secure: config.cookieSecure,
    });
}

export function clearSessionCookie(context: Context<AppEnvironment>, config: ServerConfig): void {
    deleteCookie(context, SESSION_COOKIE, {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: config.cookieSecure,
    });
}
