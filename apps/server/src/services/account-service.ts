import type { ExportBundle, ProjectExport } from "@praxbit/contracts";
import type { Pool } from "pg";
import { AppError } from "../http/app-error.ts";
import { withTransaction } from "../db/pool.ts";
import type { QueryExecutor } from "../db/rows.ts";
import type { AuditRepository } from "../repositories/audit-repository.ts";
import type { ClubRepository } from "../repositories/club-repository.ts";
import type { ProjectRepository } from "../repositories/project-repository.ts";
import type { UserRepository } from "../repositories/user-repository.ts";
import type { WorldRepository } from "../repositories/world-repository.ts";

export class AccountService {
    private readonly pool: Pool;
    private readonly users: UserRepository;
    private readonly worlds: WorldRepository;
    private readonly projects: ProjectRepository;
    private readonly clubs: ClubRepository;
    private readonly audit: AuditRepository;

    public constructor(dependencies: {
        readonly pool: Pool;
        readonly users: UserRepository;
        readonly worlds: WorldRepository;
        readonly projects: ProjectRepository;
        readonly clubs: ClubRepository;
        readonly audit: AuditRepository;
    }) {
        this.pool = dependencies.pool;
        this.users = dependencies.users;
        this.worlds = dependencies.worlds;
        this.projects = dependencies.projects;
        this.clubs = dependencies.clubs;
        this.audit = dependencies.audit;
    }

    public async exportAccount(userId: string, now: Date): Promise<ExportBundle> {
        return withTransaction(this.pool, this.exportWork.bind(this, userId, now));
    }

    private async exportWork(
        userId: string,
        now: Date,
        client: QueryExecutor,
    ): Promise<ExportBundle> {
        const user = await this.users.findUserById(client, userId);
        if (user === undefined) {
            throw new AppError(404, "user_not_found", "Unknown account.");
        }
        const preferences = await this.users.getPreferences(client, userId);
        const progress = await this.users.getProgress(client, userId);
        const mastery = await this.users.listMastery(client, userId);
        const reviews = await this.users.listReviews(client, userId);
        const evidence = await this.users.listEvidence(client, userId);
        const completions = await this.users.listCompletions(client, userId);
        const worlds = await this.worlds.listWorlds(client, userId);
        const states = await this.projects.listProjectStates(client, userId);
        const projects: ProjectExport[] = [];
        for (const state of states.values()) {
            const revisions = await this.projects.listRevisions(client, userId, state.projectId);
            projects.push({
                projectId: state.projectId,
                currentRevision: state.currentRevision,
                ...(state.updatedAt === undefined ? {} : { updatedAt: state.updatedAt }),
                revisions: [...revisions],
            });
        }
        const clubMemberships = await this.clubs.listMembershipsForUser(client, userId);
        const reports = await this.clubs.listReportsForUser(client, userId);
        return {
            exportedAt: now.toISOString(),
            user,
            preferences,
            progress,
            mastery: [...mastery],
            reviews: [...reviews],
            evidence: [...evidence],
            completions: [...completions],
            worlds: [...worlds],
            achievements: [...progress.achievements],
            projects,
            clubMemberships: [...clubMemberships],
            reports: [...reports],
        };
    }

    public async deleteAccount(input: {
        readonly userId: string;
        readonly requestId: string;
        readonly now: Date;
    }): Promise<void> {
        await withTransaction(this.pool, this.deleteAccountWork.bind(this, input));
    }

    private async deleteAccountWork(
        input: {
            readonly userId: string;
            readonly requestId: string;
            readonly now: Date;
        },
        client: QueryExecutor,
    ): Promise<void> {
        const user = await this.users.findUserById(client, input.userId);
        if (user === undefined) {
            throw new AppError(404, "user_not_found", "Unknown account.");
        }
        const deleted = await this.users.deleteUser(client, input.userId);
        if (!deleted) {
            throw new AppError(404, "user_not_found", "Unknown account.");
        }
        await this.audit.record(client, {
            actorUserId: null,
            action: "account.deleted",
            targetType: "user",
            targetId: undefined,
            requestId: input.requestId,
            metadata: {},
            now: input.now,
        });
    }
}
