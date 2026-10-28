import { ProjectFileMapSchema, type ProjectRevision } from "@praxbit/contracts";
import { toIsoString, type QueryExecutor } from "../db/rows.ts";

type ProjectRow = {
    user_id: string;
    project_id: string;
    current_revision: number;
    updated_at: Date | string;
};

type RevisionRow = {
    user_id: string;
    project_id: string;
    revision: number;
    message: string;
    files: unknown;
    created_at: Date | string;
};

export interface ProjectState {
    readonly projectId: string;
    readonly currentRevision: number;
    readonly updatedAt: string | undefined;
}

export class ProjectRepository {
    public async getProjectState(
        executor: QueryExecutor,
        userId: string,
        projectId: string,
    ): Promise<ProjectState | undefined> {
        const result = await executor.query<ProjectRow>(
            `
                SELECT user_id, project_id, current_revision, updated_at
                FROM projects
                WHERE user_id = $1 AND project_id = $2
            `,
            [userId, projectId],
        );
        const row = result.rows[0];
        if (row === undefined) {
            return undefined;
        }
        return {
            projectId: row.project_id,
            currentRevision: row.current_revision,
            updatedAt: toIsoString(row.updated_at),
        };
    }

    public async listProjectStates(
        executor: QueryExecutor,
        userId: string,
    ): Promise<ReadonlyMap<string, ProjectState>> {
        const result = await executor.query<ProjectRow>(
            `
                SELECT user_id, project_id, current_revision, updated_at
                FROM projects
                WHERE user_id = $1
                ORDER BY project_id ASC
            `,
            [userId],
        );
        const states = new Map<string, ProjectState>();
        for (const row of result.rows) {
            states.set(row.project_id, {
                projectId: row.project_id,
                currentRevision: row.current_revision,
                updatedAt: toIsoString(row.updated_at),
            });
        }
        return states;
    }

    public async listRevisions(
        executor: QueryExecutor,
        userId: string,
        projectId: string,
    ): Promise<readonly ProjectRevision[]> {
        const result = await executor.query<RevisionRow>(
            `
                SELECT user_id, project_id, revision, message, files, created_at
                FROM project_revisions
                WHERE user_id = $1 AND project_id = $2
                ORDER BY revision ASC
            `,
            [userId, projectId],
        );
        return result.rows.map(function revisionOf(row: RevisionRow): ProjectRevision {
            return {
                revision: row.revision,
                message: row.message,
                files: ProjectFileMapSchema.parse(row.files),
                createdAt: toIsoString(row.created_at),
            };
        });
    }

    public async ensureAndLockProject(
        executor: QueryExecutor,
        userId: string,
        projectId: string,
    ): Promise<number> {
        await executor.query(
            `
                INSERT INTO projects (user_id, project_id, current_revision)
                VALUES ($1, $2, 0)
                ON CONFLICT (user_id, project_id) DO NOTHING
            `,
            [userId, projectId],
        );
        const result = await executor.query<{ current_revision: number }>(
            `
                SELECT current_revision
                FROM projects
                WHERE user_id = $1 AND project_id = $2
                FOR UPDATE
            `,
            [userId, projectId],
        );
        return result.rows[0]?.current_revision ?? 0;
    }

    public async insertRevision(
        executor: QueryExecutor,
        input: {
            readonly userId: string;
            readonly projectId: string;
            readonly revision: number;
            readonly message: string;
            readonly files: Readonly<Record<string, string>>;
            readonly now: Date;
        },
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO project_revisions (user_id, project_id, revision, message, files, created_at)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            `,
            [
                input.userId,
                input.projectId,
                input.revision,
                input.message,
                JSON.stringify(input.files),
                input.now,
            ],
        );
        await executor.query(
            `
                UPDATE projects
                SET current_revision = $3, updated_at = $4
                WHERE user_id = $1 AND project_id = $2
            `,
            [input.userId, input.projectId, input.revision, input.now],
        );
    }
}
