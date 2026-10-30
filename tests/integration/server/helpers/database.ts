import { createApplication } from "../../../../apps/server/src/app.ts";
import type { ServerConfig } from "../../../../apps/server/src/config.ts";
import { loadContent } from "../../../../apps/server/src/content/loader.ts";
import type { ContentCatalog } from "../../../../apps/server/src/content/catalog.ts";
import { seedContentReferenceData } from "../../../../apps/server/src/content/seed.ts";
import { createDatabasePool } from "../../../../apps/server/src/db/pool.ts";

export const TEST_PASSWORD = "correct horse battery";
export const ADMIN_HANDLE = "admin_handle";

export type TestPool = ReturnType<typeof createDatabasePool>;
export type TestApplication = ReturnType<typeof createApplication>;

export interface TestContext {
    readonly pool: TestPool;
    readonly app: TestApplication;
    readonly content: ContentCatalog;
    readonly config: ServerConfig;
}

function requireDatabaseUrl(): string {
    const value = process.env["DATABASE_URL"];
    if (value === undefined || value.length === 0) {
        throw new Error(
            "DATABASE_URL is required. Run pnpm --filter @praxbit/server test:integration.",
        );
    }
    return value;
}

export function buildTestConfig(databaseUrl: string): ServerConfig {
    return {
        nodeEnvironment: "test",
        host: "127.0.0.1",
        port: 0,
        databaseUrl,
        databasePoolSize: 2,
        contentDirectory: undefined,
        webDirectory: undefined,
        corsOrigins: [],
        adminHandles: [ADMIN_HANDLE],
        cookieSecure: false,
        trustProxy: false,
        ai: undefined,
        bodyLimitBytes: 262144,
        rateLimits: {
            globalPerMinute: 100000,
            registerPerHour: 10000,
            loginPerQuarterHour: 10000,
            aiHintsPerHour: 10,
            eventSubmissionsPerHour: 10000,
        },
    };
}

export async function createTestContext(): Promise<TestContext> {
    const databaseUrl = requireDatabaseUrl();
    const config = buildTestConfig(databaseUrl);
    const content = await loadContent();
    const pool = createDatabasePool(config);
    await pool.query("SELECT 1");
    const app = createApplication({ config, pool, content });
    return { pool, app, content, config };
}

export async function resetDatabase(context: TestContext): Promise<void> {
    await context.pool.query(
        `
            TRUNCATE TABLE
                users,
                clubs,
                club_events,
                achievements,
                audit_events,
                club_reports
            RESTART IDENTITY CASCADE
        `,
    );
    await seedContentReferenceData(context.pool, context.content);
}

export async function closeTestContext(context: TestContext): Promise<void> {
    await context.pool.end();
}
