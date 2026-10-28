import type { ProjectDetail, ProjectRevision } from "@praxbit/contracts";
import type { Pool } from "pg";
import { AppError, validationError } from "../http/app-error.ts";
import { withTransaction } from "../db/pool.ts";
import type { QueryExecutor } from "../db/rows.ts";
import type { ContentCatalog } from "../content/catalog.ts";
import type { ProjectRepository, ProjectState } from "../repositories/project-repository.ts";

const MAXIMUM_FILES = 80;
const MAXIMUM_TOTAL_BYTES = 900000;

export function sanitizeProjectFiles(
    files: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
    const entries = Object.entries(files);
    if (entries.length === 0) {
        throw validationError("A revision needs at least one file.", { field: "files" });
    }
    if (entries.length > MAXIMUM_FILES) {
        throw validationError("A revision contains too many files.", { maximum: MAXIMUM_FILES });
    }
    const sanitized: Record<string, string> = {};
    let totalBytes = 0;
    for (const [path, content] of entries) {
        let hasControlCharacter = false;
        for (const character of path) {
            if (character.charCodeAt(0) < 32) {
                hasControlCharacter = true;
                break;
            }
        }
        if (
            path.length === 0 ||
            path.length > 200 ||
            path.startsWith("/") ||
            path.includes("\\") ||
            /^[A-Za-z]:/.test(path) ||
            /(^|\/)\.\.?(\/|$)/.test(path) ||
            hasControlCharacter
        ) {
            throw validationError("The revision contains an unsafe file path.", { path });
        }
        sanitized[path] = content;
        totalBytes += Buffer.byteLength(path, "utf8") + Buffer.byteLength(content, "utf8");
    }
    if (totalBytes > MAXIMUM_TOTAL_BYTES) {
        throw validationError("The revision is too large.", { maximumBytes: MAXIMUM_TOTAL_BYTES });
    }
    return sanitized;
}

function summarize(options: {
    readonly projectId: string;
    readonly title: string;
    readonly summary: string;
    readonly difficulty: string;
    readonly estimatedMinutes: number;
    readonly skills: readonly string[];
    readonly currentRevision: number;
    readonly updatedAt: string | undefined;
}): ProjectDetail["project"] {
    const base: ProjectDetail["project"] = {
        id: options.projectId,
        title: options.title,
        summary: options.summary,
        difficulty: options.difficulty,
        estimatedMinutes: options.estimatedMinutes,
        skills: [...options.skills],
        currentRevision: options.currentRevision,
    };
    return options.updatedAt === undefined ? base : { ...base, updatedAt: options.updatedAt };
}

export class ProjectService {
    private readonly pool: Pool;
    private readonly content: ContentCatalog;
    private readonly projects: ProjectRepository;

    public constructor(dependencies: {
        readonly pool: Pool;
        readonly content: ContentCatalog;
        readonly projects: ProjectRepository;
    }) {
        this.pool = dependencies.pool;
        this.content = dependencies.content;
        this.projects = dependencies.projects;
    }

    public async listProjects(userId: string | undefined): Promise<readonly ProjectDetail[]> {
        const states =
            userId === undefined
                ? new Map<string, ProjectState>()
                : await this.projects.listProjectStates(this.pool, userId);
        return this.content.projects.map(function detailOf(project): ProjectDetail {
            const state = states.get(project.id);
            return {
                project: summarize({
                    projectId: project.id,
                    title: project.title,
                    summary: project.summary,
                    difficulty: project.difficulty,
                    estimatedMinutes: project.estimatedMinutes,
                    skills: project.skills,
                    currentRevision: state?.currentRevision ?? 0,
                    updatedAt: state?.updatedAt,
                }),
                revisions: [],
            };
        });
    }

    public async getProject(userId: string | undefined, projectId: string): Promise<ProjectDetail> {
        const project = this.content.getProject(projectId);
        if (project === undefined) {
            throw new AppError(404, "project_not_found", "Unknown project.");
        }
        if (userId === undefined) {
            return {
                project: summarize({
                    projectId: project.id,
                    title: project.title,
                    summary: project.summary,
                    difficulty: project.difficulty,
                    estimatedMinutes: project.estimatedMinutes,
                    skills: project.skills,
                    currentRevision: 0,
                    updatedAt: undefined,
                }),
                revisions: [],
            };
        }
        const state = await this.projects.getProjectState(this.pool, userId, projectId);
        const revisions = await this.projects.listRevisions(this.pool, userId, projectId);
        return {
            project: summarize({
                projectId: project.id,
                title: project.title,
                summary: project.summary,
                difficulty: project.difficulty,
                estimatedMinutes: project.estimatedMinutes,
                skills: project.skills,
                currentRevision: state?.currentRevision ?? 0,
                updatedAt: state?.updatedAt,
            }),
            revisions: [...revisions],
        };
    }

    public async saveRevision(input: {
        readonly userId: string;
        readonly projectId: string;
        readonly baseRevision: number;
        readonly message: string;
        readonly files: Readonly<Record<string, string>>;
        readonly now: Date;
    }): Promise<ProjectDetail> {
        const project = this.content.getProject(input.projectId);
        if (project === undefined) {
            throw new AppError(404, "project_not_found", "Unknown project.");
        }
        const files = sanitizeProjectFiles(input.files);
        const revisions = await withTransaction(
            this.pool,
            this.saveRevisionWork.bind(this, input, files),
        );

        const state = await this.projects.getProjectState(this.pool, input.userId, input.projectId);
        return {
            project: summarize({
                projectId: project.id,
                title: project.title,
                summary: project.summary,
                difficulty: project.difficulty,
                estimatedMinutes: project.estimatedMinutes,
                skills: project.skills,
                currentRevision: state?.currentRevision ?? revisions.length,
                updatedAt: state?.updatedAt,
            }),
            revisions: [...revisions],
        };
    }

    private async saveRevisionWork(
        input: {
            readonly userId: string;
            readonly projectId: string;
            readonly baseRevision: number;
            readonly message: string;
            readonly now: Date;
        },
        files: Readonly<Record<string, string>>,
        client: QueryExecutor,
    ): Promise<readonly ProjectRevision[]> {
        const currentRevision = await this.projects.ensureAndLockProject(
            client,
            input.userId,
            input.projectId,
        );
        if (currentRevision !== input.baseRevision) {
            throw new AppError(
                409,
                "project_revision_conflict",
                "This project changed on another device.",
                { currentRevision },
            );
        }
        await this.projects.insertRevision(client, {
            userId: input.userId,
            projectId: input.projectId,
            revision: currentRevision + 1,
            message: input.message,
            files,
            now: input.now,
        });
        return this.projects.listRevisions(client, input.userId, input.projectId);
    }

    public async appendRevision(
        executor: QueryExecutor,
        input: {
            readonly userId: string;
            readonly projectId: string;
            readonly baseRevision: number;
            readonly message: string;
            readonly files: Readonly<Record<string, string>>;
            readonly now: Date;
        },
    ): Promise<number> {
        const project = this.content.getProject(input.projectId);
        if (project === undefined) {
            throw new AppError(404, "project_not_found", "Unknown project.");
        }
        const files = sanitizeProjectFiles(input.files);
        const currentRevision = await this.projects.ensureAndLockProject(
            executor,
            input.userId,
            input.projectId,
        );
        if (currentRevision !== input.baseRevision) {
            throw new AppError(
                409,
                "project_revision_conflict",
                "This project changed on another device.",
                {
                    currentRevision,
                },
            );
        }
        const nextRevision = currentRevision + 1;
        await this.projects.insertRevision(executor, {
            userId: input.userId,
            projectId: input.projectId,
            revision: nextRevision,
            message: input.message,
            files,
            now: input.now,
        });
        return nextRevision;
    }
}
