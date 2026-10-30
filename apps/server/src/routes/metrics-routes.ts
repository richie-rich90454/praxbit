import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Pool } from "pg";
import { ZodError } from "zod";
import type { ApplicationServices } from "../services/application-services.ts";
import { constantTimeEquals } from "../security/tokens.ts";
import { AppError, errorBody } from "../http/app-error.ts";
import type { AppEnvironment } from "../types.ts";

const METRICS_PATH = "/metrics";
const DURATION_BUCKETS_SECONDS: readonly number[] = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];
const STANDARD_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

const eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopMonitor.enable();

interface RequestCount {
    readonly method: string;
    readonly status: number;
    count: number;
}

interface RequestDuration {
    readonly method: string;
    readonly route: string;
    readonly buckets: number[];
    sum: number;
    count: number;
}

export interface MetricsSnapshot {
    readonly counts: readonly RequestCount[];
    readonly durations: readonly RequestDuration[];
}

export interface MetricsRuntime {
    readonly webBuildPresent: boolean;
    readonly webBuildRequired: boolean;
}

export interface MetricsRegistry {
    recordRequest(input: {
        readonly method: string;
        readonly status: number;
        readonly routePath: string;
        readonly durationSeconds: number;
    }): void;
    snapshot(): MetricsSnapshot;
}

export function createMetricsRegistry(): MetricsRegistry {
    const counts = new Map<string, RequestCount>();
    const durations = new Map<string, RequestDuration>();

    return {
        recordRequest(input): void {
            const method = STANDARD_METHODS.has(input.method) ? input.method : "OTHER";
            const status = Number.isInteger(input.status) ? input.status : 0;
            const countKey = `${method} ${String(status)}`;
            const existingCount = counts.get(countKey);
            if (existingCount === undefined) {
                counts.set(countKey, { method, status, count: 1 });
            } else {
                existingCount.count += 1;
            }

            const route = routeLabel(input.routePath);
            const durationKey = `${method} ${route}`;
            let duration = durations.get(durationKey);
            if (duration === undefined) {
                duration = {
                    method,
                    route,
                    buckets: DURATION_BUCKETS_SECONDS.map(function zero(): number {
                        return 0;
                    }),
                    sum: 0,
                    count: 0,
                };
                durations.set(durationKey, duration);
            }
            duration.count += 1;
            duration.sum += Math.max(0, input.durationSeconds);
            for (let index = 0; index < DURATION_BUCKETS_SECONDS.length; index += 1) {
                const bucket = DURATION_BUCKETS_SECONDS[index];
                if (bucket === undefined || input.durationSeconds > bucket) {
                    continue;
                }
                duration.buckets[index] = (duration.buckets[index] ?? 0) + 1;
            }
        },
        snapshot(): MetricsSnapshot {
            return {
                counts: [...counts.values()],
                durations: [...durations.values()],
            };
        },
    };
}

function routeLabel(routePath: string): string {
    if (routePath === "" || routePath === "*" || routePath === "/*") {
        return "static";
    }
    return routePath;
}

function escapeLabel(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
}

function formatNumber(value: number): string {
    return Number.isFinite(value) ? String(value) : "0";
}

export function metricsMiddleware(registry: MetricsRegistry): MiddlewareHandler<AppEnvironment> {
    return async function handle(context, next): Promise<void> {
        const startedAt = performance.now();
        let status = 500;
        try {
            await next();
            status = context.res.status;
        } catch (error) {
            status = errorStatus(error);
            throw error;
        } finally {
            registry.recordRequest({
                method: context.req.method,
                status,
                routePath: requestRoutePath(context),
                durationSeconds: (performance.now() - startedAt) / 1000,
            });
        }
    };
}

function errorStatus(error: unknown): number {
    if (error instanceof AppError) {
        return error.status;
    }
    if (error instanceof ZodError) {
        return 400;
    }
    return 500;
}

function requestRoutePath(context: Context<AppEnvironment>): string {
    try {
        return context.req.routePath;
    } catch {
        return "*";
    }
}

function isLoopbackRequest(context: Context<AppEnvironment>): boolean {
    if (
        context.req.header("x-forwarded-for") !== undefined ||
        context.req.header("x-real-ip") !== undefined
    ) {
        return false;
    }
    try {
        const address = getConnInfo(context).remote.address;
        return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
    } catch {
        return false;
    }
}

function bearerToken(context: Context<AppEnvironment>): string | undefined {
    const header = context.req.header("authorization");
    if (header === undefined) {
        return undefined;
    }
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (match === null) {
        return undefined;
    }
    const token = match[1];
    return token === undefined || token.length === 0 ? undefined : token;
}

async function metricsAuthorized(
    context: Context<AppEnvironment>,
    services: ApplicationServices,
): Promise<boolean> {
    if (services.config.nodeEnvironment !== "production") {
        return true;
    }
    if (isLoopbackRequest(context)) {
        return true;
    }
    const token = bearerToken(context);
    if (token === undefined) {
        return false;
    }
    const expected = process.env["PRAXBIT_METRICS_TOKEN"]?.trim();
    if (expected !== undefined && expected.length > 0 && constantTimeEquals(token, expected)) {
        return true;
    }
    const resolved = await services.auth.resolveSessionUser(token, new Date());
    return resolved !== undefined && resolved.user.role === "admin";
}

async function databaseReady(pool: Pool): Promise<boolean> {
    try {
        await pool.query("SELECT 1");
        return true;
    } catch {
        return false;
    }
}

function eventLoopSeconds(value: number): number {
    return Number.isFinite(value) ? value / 1e9 : 0;
}

async function renderMetrics(
    pool: Pool,
    registry: MetricsRegistry,
    runtime: MetricsRuntime,
): Promise<string> {
    const memory = process.memoryUsage();
    const ready = await databaseReady(pool);
    const webBuildReady = runtime.webBuildPresent || !runtime.webBuildRequired;
    const lines: string[] = [];

    function gauge(name: string, help: string, value: number): void {
        lines.push(`# HELP ${name} ${help}`);
        lines.push(`# TYPE ${name} gauge`);
        lines.push(`${name} ${formatNumber(value)}`);
    }

    gauge("process_uptime_seconds", "Process uptime in seconds.", process.uptime());
    gauge("process_resident_memory_bytes", "Resident memory size in bytes.", memory.rss);
    gauge("nodejs_heap_used_bytes", "V8 heap used in bytes.", memory.heapUsed);
    gauge("nodejs_heap_total_bytes", "V8 heap total in bytes.", memory.heapTotal);
    gauge("nodejs_external_memory_bytes", "V8 external memory in bytes.", memory.external);

    const lagP50 = eventLoopSeconds(eventLoopMonitor.percentile(50));
    const lagP99 = eventLoopSeconds(eventLoopMonitor.percentile(99));
    const lagMax = eventLoopSeconds(eventLoopMonitor.max);
    eventLoopMonitor.reset();
    lines.push("# HELP nodejs_event_loop_lag_seconds Event loop delay in seconds.");
    lines.push("# TYPE nodejs_event_loop_lag_seconds gauge");
    lines.push(`nodejs_event_loop_lag_seconds{quantile="0.5"} ${formatNumber(lagP50)}`);
    lines.push(`nodejs_event_loop_lag_seconds{quantile="0.99"} ${formatNumber(lagP99)}`);
    lines.push(`nodejs_event_loop_lag_max_seconds ${formatNumber(lagMax)}`);

    gauge("praxbit_db_pool_total", "Total PostgreSQL pool clients.", pool.totalCount);
    gauge("praxbit_db_pool_idle", "Idle PostgreSQL pool clients.", pool.idleCount);
    gauge(
        "praxbit_db_pool_waiting",
        "Requests waiting for a PostgreSQL pool client.",
        pool.waitingCount,
    );
    gauge("praxbit_db_ready", "Database readiness: 1 ready, 0 not ready.", ready ? 1 : 0);
    gauge(
        "praxbit_ready",
        "Overall readiness: 1 ready, 0 not ready.",
        ready && webBuildReady ? 1 : 0,
    );

    lines.push("# HELP praxbit_http_requests_total Total HTTP requests.");
    lines.push("# TYPE praxbit_http_requests_total counter");
    const snapshot = registry.snapshot();
    const counts = snapshot.counts.slice().sort(function byKey(
        left: RequestCount,
        right: RequestCount,
    ): number {
        return left.method.localeCompare(right.method) || left.status - right.status;
    });
    for (const entry of counts) {
        lines.push(
            `praxbit_http_requests_total{method="${escapeLabel(entry.method)}",status="${String(entry.status)}"} ${String(entry.count)}`,
        );
    }

    lines.push("# HELP praxbit_http_request_duration_seconds HTTP request duration in seconds.");
    lines.push("# TYPE praxbit_http_request_duration_seconds histogram");
    const durations = snapshot.durations.slice().sort(function byKey(
        left: RequestDuration,
        right: RequestDuration,
    ): number {
        return left.method.localeCompare(right.method) || left.route.localeCompare(right.route);
    });
    for (const entry of durations) {
        const labels = `method="${escapeLabel(entry.method)}",route="${escapeLabel(entry.route)}"`;
        for (let index = 0; index < DURATION_BUCKETS_SECONDS.length; index += 1) {
            const bucket = DURATION_BUCKETS_SECONDS[index];
            if (bucket === undefined) {
                continue;
            }
            lines.push(
                `praxbit_http_request_duration_seconds_bucket{${labels},le="${String(bucket)}"} ${String(entry.buckets[index] ?? 0)}`,
            );
        }
        lines.push(
            `praxbit_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${String(entry.count)}`,
        );
        lines.push(
            `praxbit_http_request_duration_seconds_sum{${labels}} ${formatNumber(entry.sum)}`,
        );
        lines.push(`praxbit_http_request_duration_seconds_count{${labels}} ${String(entry.count)}`);
    }

    return `${lines.join("\n")}\n`;
}

export function createMetricsRoutes(
    services: ApplicationServices,
    registry: MetricsRegistry,
    runtime: MetricsRuntime,
): Hono<AppEnvironment> {
    const routes = new Hono<AppEnvironment>();

    routes.get(METRICS_PATH, async function metrics(context): Promise<Response> {
        if (!(await metricsAuthorized(context, services))) {
            return context.json(
                errorBody("not_found", "No route matches this request.", context.get("requestId")),
                404,
            );
        }
        const body = await renderMetrics(services.pool, registry, runtime);
        return context.body(body, 200, {
            "content-type": "text/plain; version=0.0.4; charset=utf-8",
            "cache-control": "no-store",
        });
    });

    return routes;
}
