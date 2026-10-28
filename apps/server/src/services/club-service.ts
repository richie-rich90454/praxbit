import type { Club, ClubDetail, ClubEvent, EventSubmissionResponse } from "@praxbit/contracts";
import type { Pool } from "pg";
import { AppError, validationError } from "../http/app-error.ts";
import { withTransaction } from "../db/pool.ts";
import type { QueryExecutor } from "../db/rows.ts";
import type { ContentCatalog } from "../content/catalog.ts";
import { constantTimeEquals, createInviteCode, sha256Hex } from "../security/tokens.ts";
import type { ClubRepository } from "../repositories/club-repository.ts";
import type { AchievementService } from "./achievement-service.ts";

const MAXIMUM_INVITE_ATTEMPTS = 5;

type PublicClubEvent = Omit<ClubEvent, "answerHash" | "answerSalt">;

function toPublicEvent(event: ClubEvent): PublicClubEvent {
    return {
        id: event.id,
        title: event.title,
        summary: event.summary,
        weekOf: event.weekOf,
        skillIds: [...event.skillIds],
        options: event.options.map(function optionOf(option): { id: string; label: string } {
            return { id: option.id, label: option.label };
        }),
        points: event.points,
    };
}

function isUniqueViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) {
        return false;
    }
    return error.code === "23505";
}

export class ClubService {
    private readonly pool: Pool;
    private readonly content: ContentCatalog;
    private readonly clubs: ClubRepository;
    private readonly achievements: AchievementService;

    public constructor(dependencies: {
        readonly pool: Pool;
        readonly content: ContentCatalog;
        readonly clubs: ClubRepository;
        readonly achievements: AchievementService;
    }) {
        this.pool = dependencies.pool;
        this.content = dependencies.content;
        this.clubs = dependencies.clubs;
        this.achievements = dependencies.achievements;
    }

    public async listClubs(userId: string): Promise<readonly Club[]> {
        return this.clubs.listClubsForUser(this.pool, userId);
    }

    public async createClub(input: {
        readonly userId: string;
        readonly name: string;
        readonly now: Date;
    }): Promise<Club> {
        const name = input.name.trim();
        if (name.length < 2) {
            throw validationError("A club name needs at least two visible characters.", {
                field: "name",
            });
        }

        for (let attempt = 0; attempt < MAXIMUM_INVITE_ATTEMPTS; attempt += 1) {
            const inviteCode = createInviteCode();
            try {
                return await withTransaction(
                    this.pool,
                    this.createClubWork.bind(this, name, inviteCode, input),
                );
            } catch (error) {
                if (isUniqueViolation(error)) {
                    continue;
                }
                throw error;
            }
        }
        throw new AppError(
            503,
            "invite_code_exhausted",
            "Could not allocate an invite code. Try again.",
        );
    }

    private async createClubWork(
        name: string,
        inviteCode: string,
        input: {
            readonly userId: string;
            readonly now: Date;
        },
        client: QueryExecutor,
    ): Promise<Club> {
        return this.clubs.createClub(client, {
            id: crypto.randomUUID(),
            name,
            inviteCode,
            ownerId: input.userId,
            now: input.now,
        });
    }

    public async joinByInviteCode(input: {
        readonly userId: string;
        readonly inviteCode: string;
        readonly now: Date;
    }): Promise<Club> {
        return withTransaction(this.pool, this.joinByCodeWork.bind(this, input));
    }

    private async joinByCodeWork(
        input: {
            readonly userId: string;
            readonly inviteCode: string;
            readonly now: Date;
        },
        client: QueryExecutor,
    ): Promise<Club> {
        const club = await this.clubs.findClubByInviteCode(client, input.inviteCode);
        if (club === undefined) {
            throw new AppError(404, "club_not_found", "No club matches that invite code.");
        }
        await this.clubs.addMember(client, club.id, input.userId, input.now);
        const joined = await this.clubs.findClubForUser(client, input.userId, club.id);
        if (joined === undefined) {
            throw new Error("Club membership was not readable after joining.");
        }
        return joined;
    }

    public async joinClub(input: {
        readonly userId: string;
        readonly clubId: string;
        readonly inviteCode: string;
        readonly now: Date;
    }): Promise<Club> {
        return withTransaction(this.pool, this.joinClubWork.bind(this, input));
    }

    private async joinClubWork(
        input: {
            readonly userId: string;
            readonly clubId: string;
            readonly inviteCode: string;
            readonly now: Date;
        },
        client: QueryExecutor,
    ): Promise<Club> {
        const club = await this.clubs.findClubById(client, input.clubId);
        if (club === undefined) {
            throw new AppError(404, "club_not_found", "Unknown club.");
        }
        const stored = await this.clubs.findClubByInviteCode(client, input.inviteCode);
        if (stored === undefined || stored.id !== club.id) {
            throw new AppError(
                403,
                "invalid_invite_code",
                "The invite code does not belong to this club.",
            );
        }
        await this.clubs.addMember(client, club.id, input.userId, input.now);
        const joined = await this.clubs.findClubForUser(client, input.userId, club.id);
        if (joined === undefined) {
            throw new Error("Club membership was not readable after joining.");
        }
        return joined;
    }

    public async getDetail(input: {
        readonly userId: string;
        readonly role: "member" | "admin";
        readonly clubId: string;
    }): Promise<ClubDetail> {
        const membership = await this.clubs.findMembership(this.pool, input.clubId, input.userId);
        if (membership === undefined && input.role !== "admin") {
            throw new AppError(403, "club_forbidden", "Join this club to see its activity.");
        }
        const club =
            membership === undefined
                ? await this.clubs.findClubById(this.pool, input.clubId)
                : await this.clubs.findClubForUser(this.pool, input.userId, input.clubId);
        if (club === undefined) {
            throw new AppError(404, "club_not_found", "Unknown club.");
        }
        const members = await this.clubs.listMembers(this.pool, input.clubId);
        const leaderboard = await this.clubs.listLeaderboard(this.pool, input.clubId);
        const submissions = await this.clubs.listVerifiedSubmissions(
            this.pool,
            input.clubId,
            input.userId,
        );
        const events = this.content.clubEvents
            .slice()
            .sort(function newestFirst(left: ClubEvent, right: ClubEvent): number {
                return right.weekOf.localeCompare(left.weekOf);
            })
            .map(toPublicEvent);
        return {
            club,
            members: [...members],
            events: [...events],
            leaderboard: [...leaderboard],
            submissions: submissions.map(function submissionOf(item): {
                eventId: string;
                points: number;
                verifiedAt: string;
            } {
                return { eventId: item.eventId, points: item.points, verifiedAt: item.verifiedAt };
            }),
        };
    }

    public listEvents(): readonly PublicClubEvent[] {
        return this.content.clubEvents
            .slice()
            .sort(function newestFirst(left: ClubEvent, right: ClubEvent): number {
                return right.weekOf.localeCompare(left.weekOf);
            })
            .map(toPublicEvent);
    }

    public async submitEvent(input: {
        readonly userId: string;
        readonly eventId: string;
        readonly answer: string;
        readonly now: Date;
    }): Promise<EventSubmissionResponse> {
        const event = this.content.getClubEvent(input.eventId);
        if (event === undefined) {
            throw new AppError(404, "event_not_found", "Unknown club event.");
        }
        const club = await this.clubs.findFirstClubForUser(this.pool, input.userId);
        if (club === undefined) {
            throw new AppError(
                403,
                "club_required",
                "Join a club before submitting an event answer.",
            );
        }

        const computed = sha256Hex(`${event.answerSalt}${input.answer}`);
        const verified = constantTimeEquals(computed, event.answerHash);

        return withTransaction(
            this.pool,
            this.submitEventWork.bind(this, event, club, verified, input),
        );
    }

    private async submitEventWork(
        event: ClubEvent,
        club: Club,
        verified: boolean,
        input: {
            readonly userId: string;
            readonly answer: string;
            readonly now: Date;
        },
        client: QueryExecutor,
    ): Promise<EventSubmissionResponse> {
        await this.clubs.ensureClubEvent(client, {
            id: event.id,
            title: event.title,
            summary: event.summary,
            weekOf: event.weekOf,
            skillIds: event.skillIds,
            points: event.points,
        });
        const state = await this.clubs.saveSubmission(client, {
            id: crypto.randomUUID(),
            clubId: club.id,
            eventId: event.id,
            userId: input.userId,
            answer: input.answer,
            verified,
            points: verified ? event.points : 0,
            now: input.now,
        });
        const leaderboard = await this.clubs.listLeaderboard(client, club.id);
        if (state.verified) {
            await this.achievements.evaluate(client, input.userId, input.now);
        }
        return {
            verified: state.verified,
            points: state.verified ? state.points : 0,
            leaderboard: [...leaderboard],
        };
    }

    public async reportClub(input: {
        readonly userId: string;
        readonly clubId: string;
        readonly reason: string;
        readonly now: Date;
    }): Promise<string> {
        const club = await this.clubs.findClubById(this.pool, input.clubId);
        if (club === undefined) {
            throw new AppError(404, "club_not_found", "Unknown club.");
        }
        const reason = input.reason.trim();
        if (reason.length < 5) {
            throw validationError("A report needs a short description.", { field: "reason" });
        }
        const reportId = crypto.randomUUID();
        await this.clubs.createReport(this.pool, {
            id: reportId,
            clubId: input.clubId,
            reporterUserId: input.userId,
            reason,
            now: input.now,
        });
        return reportId;
    }
}
