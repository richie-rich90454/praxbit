import type { Pool } from "pg";
import type { ServerConfig } from "../config.ts";
import type { ContentCatalog } from "../content/catalog.ts";
import { RateLimiter } from "../http/rate-limit.ts";
import { AdminRepository } from "../repositories/admin-repository.ts";
import { AuditRepository } from "../repositories/audit-repository.ts";
import { ClubRepository } from "../repositories/club-repository.ts";
import { EvidenceRepository } from "../repositories/evidence-repository.ts";
import { MissionRepository } from "../repositories/mission-repository.ts";
import { ProjectRepository } from "../repositories/project-repository.ts";
import { SessionRepository } from "../repositories/session-repository.ts";
import { SyncRepository } from "../repositories/sync-repository.ts";
import { UserRepository } from "../repositories/user-repository.ts";
import { WorldRepository } from "../repositories/world-repository.ts";
import { AccountService } from "./account-service.ts";
import { AchievementService } from "./achievement-service.ts";
import { AiService } from "./ai-service.ts";
import { AttemptService } from "./attempt-service.ts";
import { AuthService } from "./auth-service.ts";
import { ClubService } from "./club-service.ts";
import { CompletionService } from "./completion-service.ts";
import { EvidenceService } from "./evidence-service.ts";
import { ProjectService } from "./project-service.ts";
import { SyncService } from "./sync-service.ts";
import { WorldService } from "./world-service.ts";

export interface RateLimiters {
    readonly global: RateLimiter;
    readonly register: RateLimiter;
    readonly login: RateLimiter;
    readonly ai: RateLimiter;
}

export interface ApplicationServices {
    readonly config: ServerConfig;
    readonly pool: Pool;
    readonly content: ContentCatalog;
    readonly rateLimiters: RateLimiters;
    readonly users: UserRepository;
    readonly sessions: SessionRepository;
    readonly evidenceRecords: EvidenceRepository;
    readonly worlds: WorldRepository;
    readonly projects: ProjectRepository;
    readonly clubs: ClubRepository;
    readonly audit: AuditRepository;
    readonly admin: AdminRepository;
    readonly syncOperations: SyncRepository;
    readonly missions: MissionRepository;
    readonly auth: AuthService;
    readonly account: AccountService;
    readonly achievements: AchievementService;
    readonly evidence: EvidenceService;
    readonly completion: CompletionService;
    readonly world: WorldService;
    readonly project: ProjectService;
    readonly club: ClubService;
    readonly ai: AiService;
    readonly attempt: AttemptService;
    readonly sync: SyncService;
}

export function createApplicationServices(input: {
    readonly config: ServerConfig;
    readonly pool: Pool;
    readonly content: ContentCatalog;
}): ApplicationServices {
    const users = new UserRepository();
    const sessions = new SessionRepository();
    const evidenceRecords = new EvidenceRepository();
    const worlds = new WorldRepository();
    const projects = new ProjectRepository();
    const clubs = new ClubRepository();
    const audit = new AuditRepository();
    const admin = new AdminRepository();
    const syncOperations = new SyncRepository();
    const missions = new MissionRepository();

    const rateLimiters: RateLimiters = {
        global: new RateLimiter(input.config.rateLimits.globalPerMinute, 60_000),
        register: new RateLimiter(input.config.rateLimits.registerPerHour, 3_600_000),
        login: new RateLimiter(input.config.rateLimits.loginPerQuarterHour, 900_000),
        ai: new RateLimiter(input.config.rateLimits.aiHintsPerHour, 3_600_000),
    };

    const achievements = new AchievementService({
        users,
        clubs,
        worlds,
        content: input.content,
    });
    const evidence = new EvidenceService({
        content: input.content,
        users,
        evidence: evidenceRecords,
        achievements,
    });
    const completion = new CompletionService({
        content: input.content,
        users,
        missions,
        evidence: evidenceRecords,
        achievements,
    });
    const world = new WorldService({ pool: input.pool, worlds, achievements });
    const project = new ProjectService({ pool: input.pool, content: input.content, projects });
    const club = new ClubService({
        pool: input.pool,
        content: input.content,
        clubs,
        achievements,
    });
    const auth = new AuthService({
        pool: input.pool,
        config: input.config,
        users,
        sessions,
        worlds,
        audit,
    });
    const account = new AccountService({
        pool: input.pool,
        users,
        worlds,
        projects,
        clubs,
        audit,
    });
    const ai = new AiService({
        pool: input.pool,
        ai: input.config.ai,
        content: input.content,
        users,
        limiter: rateLimiters.ai,
    });
    const attempt = new AttemptService({ pool: input.pool, content: input.content, missions });
    const sync = new SyncService({
        pool: input.pool,
        users,
        worlds,
        sync: syncOperations,
        content: input.content,
        evidence,
        completions: completion,
        projects: project,
        worldService: world,
        achievements,
    });

    return {
        config: input.config,
        pool: input.pool,
        content: input.content,
        rateLimiters,
        users,
        sessions,
        evidenceRecords,
        worlds,
        projects,
        clubs,
        audit,
        admin,
        syncOperations,
        missions,
        auth,
        account,
        achievements,
        evidence,
        completion,
        world,
        project,
        club,
        ai,
        attempt,
        sync,
    };
}
