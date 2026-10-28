import type { AttemptStartResponse } from "@praxbit/contracts";
import type { Pool } from "pg";
import { AppError } from "../http/app-error.ts";
import type { ContentCatalog } from "../content/catalog.ts";
import type { MissionRepository } from "../repositories/mission-repository.ts";

export class AttemptService {
    private readonly pool: Pool;
    private readonly content: ContentCatalog;
    private readonly missions: MissionRepository;

    public constructor(dependencies: {
        readonly pool: Pool;
        readonly content: ContentCatalog;
        readonly missions: MissionRepository;
    }) {
        this.pool = dependencies.pool;
        this.content = dependencies.content;
        this.missions = dependencies.missions;
    }

    public async startAttempt(input: {
        readonly userId: string;
        readonly missionId: string;
        readonly missionVersion: number;
        readonly now: Date;
    }): Promise<AttemptStartResponse> {
        const mission = this.content.getMission(input.missionId);
        if (mission === undefined) {
            throw new AppError(404, "mission_not_found", "Unknown mission.");
        }
        if (mission.version !== input.missionVersion) {
            throw new AppError(
                400,
                "mission_version_mismatch",
                "This mission has a newer version. Refresh the mission before starting.",
            );
        }
        const attemptId = crypto.randomUUID();
        await this.missions.insertAttempt(this.pool, {
            id: attemptId,
            userId: input.userId,
            missionId: mission.id,
            missionVersion: mission.version,
            startedAt: input.now,
        });
        return { attemptId, startedAt: input.now.toISOString() };
    }

    public async requireAttempt(userId: string, attemptId: string): Promise<void> {
        const attempt = await this.missions.findAttempt(this.pool, userId, attemptId);
        if (attempt === undefined) {
            throw new AppError(404, "attempt_not_found", "Unknown attempt.");
        }
    }
}
