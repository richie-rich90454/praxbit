import type { Preferences, User } from "@praxbit/contracts";
import type { Pool } from "pg";
import { AppError, conflict } from "../http/app-error.ts";
import { withTransaction } from "../db/pool.ts";
import type { QueryExecutor } from "../db/rows.ts";
import { createOpaqueToken, hashToken } from "../security/tokens.ts";
import { hashPassword, verifyPassword } from "../security/password.ts";
import type { AuditRepository } from "../repositories/audit-repository.ts";
import type { SessionRepository } from "../repositories/session-repository.ts";
import type { UserRepository } from "../repositories/user-repository.ts";
import type { WorldRepository } from "../repositories/world-repository.ts";
import type { ServerConfig } from "../config.ts";

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedSession {
    readonly token: string;
    readonly expiresAt: Date;
}

export interface LoginResult {
    readonly user: User;
    readonly session: IssuedSession;
}

export interface RegisterInput {
    readonly handle: string;
    readonly displayName: string | undefined;
    readonly password: string;
    readonly requestId: string;
    readonly now: Date;
}

export interface LoginInput {
    readonly handle: string;
    readonly password: string;
    readonly requestId: string;
    readonly now: Date;
}

interface RegistrationResult {
    readonly user: User;
    readonly preferences: Preferences;
    readonly session: IssuedSession;
}

function isUniqueViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) {
        return false;
    }
    return error.code === "23505";
}

export class AuthService {
    private readonly pool: Pool;
    private readonly config: ServerConfig;
    private readonly users: UserRepository;
    private readonly sessions: SessionRepository;
    private readonly worlds: WorldRepository;
    private readonly audit: AuditRepository;

    public constructor(dependencies: {
        readonly pool: Pool;
        readonly config: ServerConfig;
        readonly users: UserRepository;
        readonly sessions: SessionRepository;
        readonly worlds: WorldRepository;
        readonly audit: AuditRepository;
    }) {
        this.pool = dependencies.pool;
        this.config = dependencies.config;
        this.users = dependencies.users;
        this.sessions = dependencies.sessions;
        this.worlds = dependencies.worlds;
        this.audit = dependencies.audit;
    }

    public async register(input: RegisterInput): Promise<RegistrationResult> {
        const passwordHash = await hashPassword(input.password);
        const role = this.config.adminHandles.includes(input.handle.toLowerCase())
            ? "admin"
            : "member";
        const displayName = input.displayName ?? input.handle;

        try {
            return await withTransaction(
                this.pool,
                this.registerWork.bind(this, input, passwordHash, role, displayName),
            );
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw conflict("handle_taken", "That handle is already in use.");
            }
            throw error;
        }
    }

    private async registerWork(
        input: RegisterInput,
        passwordHash: string,
        role: "member" | "admin",
        displayName: string,
        client: QueryExecutor,
    ): Promise<RegistrationResult> {
        const user = await this.users.createUser(client, {
            id: crypto.randomUUID(),
            handle: input.handle,
            displayName,
            role,
            passwordHash,
            identityId: crypto.randomUUID(),
        });
        await this.worlds.ensureWorld(client, user.user.id);
        await this.audit.record(client, {
            actorUserId: user.user.id,
            action: "account.registered",
            targetType: "user",
            targetId: user.user.id,
            requestId: input.requestId,
            metadata: { role },
            now: input.now,
        });
        const session = await this.issueSession(client, user.user.id, input.now);
        return { user: user.user, preferences: user.preferences, session };
    }

    public async login(input: LoginInput): Promise<LoginResult> {
        const record = await this.users.findUserWithSecretByHandle(this.pool, input.handle);
        if (record === undefined) {
            await hashPassword(input.password);
            throw new AppError(401, "invalid_credentials", "The handle or password is incorrect.");
        }
        const matches = await verifyPassword(input.password, record.passwordHash);
        if (!matches) {
            throw new AppError(401, "invalid_credentials", "The handle or password is incorrect.");
        }
        const session = await withTransaction(this.pool, this.loginWork.bind(this, input, record));
        return { user: record.user, session };
    }

    private async loginWork(
        input: LoginInput,
        record: { readonly user: User; readonly passwordHash: string },
        client: QueryExecutor,
    ): Promise<IssuedSession> {
        await this.audit.record(client, {
            actorUserId: record.user.id,
            action: "account.logged_in",
            targetType: "user",
            targetId: record.user.id,
            requestId: input.requestId,
            metadata: {},
            now: input.now,
        });
        return this.issueSession(client, record.user.id, input.now);
    }

    public async resolveSessionUser(
        rawToken: string,
        now: Date,
    ): Promise<
        { readonly sessionId: string; readonly user: User; readonly tokenHash: string } | undefined
    > {
        const tokenHash = hashToken(rawToken);
        const active = await this.sessions.findActiveSessionByTokenHash(this.pool, tokenHash, now);
        if (active === undefined) {
            return undefined;
        }
        return { sessionId: active.sessionId, user: active.user, tokenHash };
    }

    public async logoutSession(sessionId: string, now: Date): Promise<void> {
        await this.sessions.revokeSessionById(this.pool, sessionId, now);
    }

    public async revokeAllSessions(userId: string, now: Date): Promise<void> {
        await this.sessions.revokeAllSessions(this.pool, userId, now);
    }

    private async issueSession(
        executor: QueryExecutor,
        userId: string,
        now: Date,
    ): Promise<IssuedSession> {
        const token = createOpaqueToken();
        const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
        await this.sessions.createSession(executor, {
            id: crypto.randomUUID(),
            userId,
            tokenHash: hashToken(token),
            createdAt: now,
            expiresAt,
        });
        return { token, expiresAt };
    }
}
