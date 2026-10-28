import { Pool, types, type PoolClient } from "pg";
import type { ServerConfig } from "../config.ts";

function returnDateAsString(value: string): string {
    return value;
}

types.setTypeParser(types.builtins.DATE, returnDateAsString);

export function createDatabasePool(config: ServerConfig): Pool {
    const pool = new Pool({
        connectionString: config.databaseUrl,
        max: config.databasePoolSize,
        min: 0,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
        query_timeout: 5000,
        application_name: "praxbit",
    });
    pool.on("error", function handlePoolError(error: Error): void {
        console.error(
            JSON.stringify({
                level: "error",
                event: "database_pool_error",
                message: error.message,
            }),
        );
    });
    return pool;
}

export async function withTransaction<T>(
    pool: Pool,
    work: (client: PoolClient) => Promise<T>,
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // The original failure is more useful than a rollback failure.
        }
        throw error;
    } finally {
        client.release();
    }
}
