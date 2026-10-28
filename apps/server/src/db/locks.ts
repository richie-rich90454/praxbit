import type { QueryExecutor } from "./rows.ts";

/**
 * Serializes learning writes for one account across processes. PostgreSQL
 * advisory locks are transaction-scoped and released on commit or rollback.
 */
export async function lockUserLearning(executor: QueryExecutor, userId: string): Promise<void> {
    await executor.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [userId]);
}
