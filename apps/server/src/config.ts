import { existsSync } from "node:fs";
import { join } from "node:path";

export type NodeEnvironment = "development" | "test" | "production";

export const SERVER_VERSION = "0.1.0";

export interface AiConfiguration {
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly model: string;
    readonly timeoutMs: number;
}

export interface ServerConfig {
    readonly nodeEnvironment: NodeEnvironment;
    readonly host: string;
    readonly port: number;
    readonly databaseUrl: string;
    readonly databasePoolSize: number;
    readonly contentDirectory: string | undefined;
    readonly webDirectory: string | undefined;
    readonly corsOrigins: readonly string[];
    readonly adminHandles: readonly string[];
    readonly cookieSecure: boolean;
    readonly trustProxy: boolean;
    readonly ai: AiConfiguration | undefined;
    readonly bodyLimitBytes: number;
    readonly rateLimits: RateLimitConfiguration;
}

export interface RateLimitConfiguration {
    readonly globalPerMinute: number;
    readonly registerPerHour: number;
    readonly loginPerQuarterHour: number;
    readonly aiHintsPerHour: number;
    readonly eventSubmissionsPerHour: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfiguration = {
    globalPerMinute: 1200,
    registerPerHour: 20,
    loginPerQuarterHour: 15,
    aiHintsPerHour: 10,
    eventSubmissionsPerHour: 30,
};

export function isWebBuildPresent(webDirectory: string | undefined): boolean {
    return webDirectory !== undefined && existsSync(join(webDirectory, "index.html"));
}

export function assertProductionWebBuild(
    webDirectory: string,
    nodeEnvironment: NodeEnvironment,
): void {
    if (nodeEnvironment === "production" && !isWebBuildPresent(webDirectory)) {
        throw new Error(
            `The web build is missing at ${webDirectory}. Run "pnpm build" before starting the server in production.`,
        );
    }
}

const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

function requireString(environment: NodeJS.ProcessEnv, name: string): string {
    const value = environment[name];
    if (value === undefined || value.trim() === "") {
        throw new Error(`Missing required environment variable ${name}.`);
    }
    return value;
}

function optionalString(environment: NodeJS.ProcessEnv, name: string): string | undefined {
    const value = environment[name];
    if (value === undefined || value.trim() === "") {
        return undefined;
    }
    return value.trim();
}

function parseInteger(value: string, name: string, minimum: number, maximum: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
    }
    return parsed;
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
    if (value === "production" || value === "test") {
        return value;
    }
    return "development";
}

function parseOrigins(value: string | undefined): readonly string[] {
    if (value === undefined) {
        return [];
    }
    return value
        .split(",")
        .map(function trimOrigin(origin: string): string {
            return origin.trim();
        })
        .filter(function present(origin: string): boolean {
            return origin.length > 0;
        });
}

function parseHandles(value: string | undefined): readonly string[] {
    if (value === undefined) {
        return [];
    }
    return value
        .split(",")
        .map(function normalizeHandle(handle: string): string {
            return handle.trim().toLowerCase();
        })
        .filter(function present(handle: string): boolean {
            return handle.length > 0;
        });
}

function validateAdminHandles(handles: readonly string[]): void {
    for (const handle of handles) {
        if (!HANDLE_PATTERN.test(handle)) {
            throw new Error(`ADMIN_HANDLES contains an invalid handle: ${handle}.`);
        }
    }
}

function validateDatabaseUrl(value: string): void {
    if (!value.startsWith("postgres://") && !value.startsWith("postgresql://")) {
        throw new Error("DATABASE_URL must be a postgres:// or postgresql:// connection string.");
    }
}

function parseAi(environment: NodeJS.ProcessEnv): AiConfiguration | undefined {
    const baseUrl = optionalString(environment, "AI_BASE_URL");
    const apiKey = optionalString(environment, "AI_API_KEY");
    const model = optionalString(environment, "AI_MODEL");
    if (baseUrl === undefined || apiKey === undefined || model === undefined) {
        return undefined;
    }
    const timeoutValue = optionalString(environment, "AI_TIMEOUT_MS");
    const timeoutMs =
        timeoutValue === undefined
            ? 12000
            : parseInteger(timeoutValue, "AI_TIMEOUT_MS", 1000, 60000);
    return { baseUrl, apiKey, model, timeoutMs };
}

export function loadConfiguration(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
    const nodeEnvironment = parseNodeEnvironment(environment["NODE_ENV"]);
    const databaseUrl = requireString(environment, "DATABASE_URL");
    validateDatabaseUrl(databaseUrl);

    const portValue = optionalString(environment, "PORT");
    const port = portValue === undefined ? 8787 : parseInteger(portValue, "PORT", 1, 65535);

    const poolValue = optionalString(environment, "DB_POOL_SIZE");
    const databasePoolSize =
        poolValue === undefined ? 3 : parseInteger(poolValue, "DB_POOL_SIZE", 2, 4);

    const adminHandles = parseHandles(optionalString(environment, "ADMIN_HANDLES"));
    validateAdminHandles(adminHandles);

    const corsOrigins = parseOrigins(optionalString(environment, "CORS_ORIGINS"));
    for (const origin of corsOrigins) {
        if (
            !origin.startsWith("http://") &&
            !origin.startsWith("https://") &&
            !origin.startsWith("capacitor://")
        ) {
            throw new Error(
                `CORS_ORIGINS entries must be absolute http(s) or capacitor:// origins: ${origin}.`,
            );
        }
    }

    const cookieSecureOverride = optionalString(environment, "COOKIE_SECURE");
    const cookieSecure =
        cookieSecureOverride === undefined
            ? nodeEnvironment === "production"
            : cookieSecureOverride === "true" || cookieSecureOverride === "1";

    const trustProxyValue = optionalString(environment, "TRUST_PROXY");
    const trustProxy = trustProxyValue === "true" || trustProxyValue === "1";

    const bodyLimitValue = optionalString(environment, "BODY_LIMIT_BYTES");
    const bodyLimitBytes =
        bodyLimitValue === undefined
            ? 1048576
            : parseInteger(bodyLimitValue, "BODY_LIMIT_BYTES", 16384, 2097152);

    return {
        nodeEnvironment,
        host: optionalString(environment, "HOST") ?? "127.0.0.1",
        port,
        databaseUrl,
        databasePoolSize,
        contentDirectory: optionalString(environment, "CONTENT_DIR"),
        webDirectory: optionalString(environment, "WEB_DIST"),
        corsOrigins,
        adminHandles,
        cookieSecure,
        trustProxy,
        ai: parseAi(environment),
        bodyLimitBytes,
        rateLimits: DEFAULT_RATE_LIMITS,
    };
}
