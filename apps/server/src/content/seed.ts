import type { Pool } from "pg";
import type { ContentCatalog } from "../content/catalog.ts";
import type { QueryExecutor } from "../db/rows.ts";

export async function seedContentReferenceData(
    client: QueryExecutor,
    content: ContentCatalog,
): Promise<void> {
    for (const achievement of content.achievements) {
        await client.query(
            `
                INSERT INTO achievements (id, title, description, kind, rule, updated_at)
                VALUES ($1, $2, $3, $4, $5, now())
                ON CONFLICT (id) DO UPDATE
                SET title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    kind = EXCLUDED.kind,
                    rule = EXCLUDED.rule,
                    updated_at = now()
            `,
            [
                achievement.id,
                achievement.title,
                achievement.description,
                achievement.kind,
                achievement.rule,
            ],
        );
    }

    for (const event of content.clubEvents) {
        await client.query(
            `
                INSERT INTO club_events (id, title, summary, week_of, skill_ids, points, updated_at)
                VALUES ($1, $2, $3, $4, $5::text[], $6, now())
                ON CONFLICT (id) DO UPDATE
                SET title = EXCLUDED.title,
                    summary = EXCLUDED.summary,
                    week_of = EXCLUDED.week_of,
                    skill_ids = EXCLUDED.skill_ids,
                    points = EXCLUDED.points,
                    updated_at = now()
            `,
            [event.id, event.title, event.summary, event.weekOf, event.skillIds, event.points],
        );
    }
}

export async function bootstrapAdministrators(
    client: QueryExecutor,
    handles: readonly string[],
): Promise<void> {
    if (handles.length === 0) {
        return;
    }
    await client.query(
        `
            UPDATE users
            SET role = 'admin'
            WHERE lower(handle) = ANY($1::text[])
        `,
        [handles],
    );
}

export async function initializeDatabase(
    pool: Pool,
    content: ContentCatalog,
    adminHandles: readonly string[],
): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await seedContentReferenceData(client, content);
        await bootstrapAdministrators(client, adminHandles);
        await client.query("COMMIT");
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            // Preserve the original initialization failure.
        }
        throw error;
    } finally {
        client.release();
    }
}
