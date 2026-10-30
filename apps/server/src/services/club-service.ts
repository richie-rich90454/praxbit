import type {
    Club,
    ClubDetail,
    ClubEvent,
    ClubEventSummary,
    ClubInvite,
    ClubWeek,
    CooperativeChallenge,
    EventSubmissionResponse,
} from "@praxbit/contracts";
import type { Pool } from "pg";
import { AppError, forbidden, notFound, validationError } from "../http/app-error.ts";
import { withTransaction } from "../db/pool.ts";
import type { QueryExecutor } from "../db/rows.ts";
import type { ContentCatalog } from "../content/catalog.ts";
import { constantTimeEquals, createInviteCode, sha256Hex } from "../security/tokens.ts";
import type { ClubRepository } from "../repositories/club-repository.ts";
import type { AchievementService } from "./achievement-service.ts";

const MAXIMUM_INVITE_ATTEMPTS = 5;
const REQUIRED_COOPERATIVE_MEMBERS = 2;

function dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
}

export function clubWeek(now: Date): ClubWeek {
    const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = startsAt.getUTCDay();
    startsAt.setUTCDate(startsAt.getUTCDate() - (day === 0 ? 6 : day - 1));
    const endsAt = new Date(startsAt);
    endsAt.setUTCDate(endsAt.getUTCDate() + 7);
    return {
        activeWeekOf: dateOnly(startsAt),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
    };
}

function toPublicEvent(event: ClubEvent, activeWeekOf: string): ClubEventSummary {
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
        participationOpen: event.weekOf === activeWeekOf,
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
        const invite = await this.clubs.findActiveInviteByCode(client, input.inviteCode, input.now);
        if (invite !== undefined) {
            const club = await this.clubs.findClubById(client, invite.clubId);
            if (club === undefined) {
                throw notFound("club_not_found", "No club matches that invite code.");
            }
            const membership = await this.clubs.findMembership(client, club.id, input.userId);
            if (membership === undefined) {
                const consumed = await this.clubs.consumeInvite(client, invite.id, input.now);
                if (!consumed) {
                    throw new AppError(
                        409,
                        "invite_unavailable",
                        "That invite expired or reached its use limit.",
                    );
                }
                await this.clubs.addMember(client, club.id, input.userId, input.now);
            }
            const joined = await this.clubs.findClubForUser(client, input.userId, club.id);
            if (joined === undefined) {
                throw new Error("Club membership was not readable after joining.");
            }
            return joined;
        }

        const knownInvite = await this.clubs.findInviteByCode(client, input.inviteCode);
        if (knownInvite !== undefined) {
            throw new AppError(
                409,
                "invite_unavailable",
                "That invite expired, was revoked, or reached its use limit.",
            );
        }
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
        const invite = await this.clubs.findActiveInviteByCode(client, input.inviteCode, input.now);
        if (invite !== undefined) {
            if (invite.clubId !== club.id) {
                throw new AppError(
                    403,
                    "invalid_invite_code",
                    "The invite code does not belong to this club.",
                );
            }
            const membership = await this.clubs.findMembership(client, club.id, input.userId);
            if (membership === undefined) {
                const consumed = await this.clubs.consumeInvite(client, invite.id, input.now);
                if (!consumed) {
                    throw new AppError(
                        409,
                        "invite_unavailable",
                        "That invite expired or reached its use limit.",
                    );
                }
                await this.clubs.addMember(client, club.id, input.userId, input.now);
            }
        } else {
            const knownInvite = await this.clubs.findInviteByCode(client, input.inviteCode);
            if (knownInvite !== undefined) {
                if (knownInvite.clubId !== club.id) {
                    throw new AppError(
                        403,
                        "invalid_invite_code",
                        "The invite code does not belong to this club.",
                    );
                }
                throw new AppError(
                    409,
                    "invite_unavailable",
                    "That invite expired, was revoked, or reached its use limit.",
                );
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
        }
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
        readonly now: Date;
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
        const week = clubWeek(input.now);
        const events = this.content.clubEvents
            .slice()
            .sort(function newestFirst(left: ClubEvent, right: ClubEvent): number {
                return right.weekOf.localeCompare(left.weekOf);
            })
            .map(function eventOf(event: ClubEvent): ClubEventSummary {
                return toPublicEvent(event, week.activeWeekOf);
            });
        const activeEvent = this.content.clubEvents.find(function active(event): boolean {
            return event.weekOf === week.activeWeekOf;
        });
        const cooperativeChallenge =
            activeEvent === undefined
                ? null
                : await this.buildCooperativeChallenge(input.clubId, activeEvent);
        return {
            club,
            members: [...members],
            events: [...events],
            week,
            cooperativeChallenge,
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

    private async buildCooperativeChallenge(
        clubId: string,
        event: ClubEvent,
    ): Promise<CooperativeChallenge> {
        const participants = await this.clubs.listVerifiedParticipants(this.pool, clubId, event.id);
        return {
            eventId: event.id,
            title: `Cooperative challenge: ${event.title}`,
            description:
                "At least two club members must submit verified answers for the active event. Individual points do not complete this challenge.",
            requiredMembers: REQUIRED_COOPERATIVE_MEMBERS,
            verifiedMembers: participants.length,
            completed: participants.length >= REQUIRED_COOPERATIVE_MEMBERS,
            participants: participants.map(function handleOf(participant): string {
                return participant.handle;
            }),
        };
    }

    public listEvents(now: Date): readonly ClubEventSummary[] {
        const week = clubWeek(now);
        return this.content.clubEvents
            .slice()
            .sort(function newestFirst(left: ClubEvent, right: ClubEvent): number {
                return right.weekOf.localeCompare(left.weekOf);
            })
            .map(function eventOf(event: ClubEvent): ClubEventSummary {
                return toPublicEvent(event, week.activeWeekOf);
            });
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
        if (event.weekOf !== clubWeek(input.now).activeWeekOf) {
            throw new AppError(
                409,
                "event_closed",
                "This event is closed. Only the active week's event accepts answers.",
            );
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

    private async requireOwner(
        executor: QueryExecutor,
        clubId: string,
        userId: string,
    ): Promise<void> {
        const membership = await this.clubs.findMembership(executor, clubId, userId);
        if (membership === undefined) {
            throw forbidden("club_forbidden", "Join this club before managing it.");
        }
        if (membership.role !== "owner") {
            throw forbidden("club_owner_required", "Only club owners can do that.");
        }
    }

    public async updateMemberRole(input: {
        readonly actorUserId: string;
        readonly clubId: string;
        readonly handle: string;
        readonly role: "owner" | "member";
    }): Promise<void> {
        await withTransaction(this.pool, this.updateMemberRoleWork.bind(this, input));
    }

    private async updateMemberRoleWork(
        input: {
            readonly actorUserId: string;
            readonly clubId: string;
            readonly handle: string;
            readonly role: "owner" | "member";
        },
        client: QueryExecutor,
    ): Promise<void> {
        await this.requireOwner(client, input.clubId, input.actorUserId);
        const target = await this.clubs.findMembershipByHandle(client, input.clubId, input.handle);
        if (target === undefined) {
            throw notFound("club_member_not_found", "That member is not in this club.");
        }
        if (target.role === input.role) {
            return;
        }
        if (input.role === "member") {
            const owners = await this.clubs.countOwners(client, input.clubId);
            if (owners <= 1) {
                throw new AppError(
                    409,
                    "last_owner_required",
                    "A club needs at least one owner. Promote another member first.",
                );
            }
        }
        await this.clubs.setMemberRole(client, input.clubId, input.handle, input.role);
    }

    public async removeMember(input: {
        readonly actorUserId: string;
        readonly clubId: string;
        readonly handle: string;
    }): Promise<void> {
        await withTransaction(this.pool, this.removeMemberWork.bind(this, input));
    }

    private async removeMemberWork(
        input: {
            readonly actorUserId: string;
            readonly clubId: string;
            readonly handle: string;
        },
        client: QueryExecutor,
    ): Promise<void> {
        await this.requireOwner(client, input.clubId, input.actorUserId);
        const target = await this.clubs.findMembershipByHandle(client, input.clubId, input.handle);
        if (target === undefined) {
            throw notFound("club_member_not_found", "That member is not in this club.");
        }
        if (target.role === "owner") {
            const owners = await this.clubs.countOwners(client, input.clubId);
            if (owners <= 1) {
                throw new AppError(
                    409,
                    "last_owner_required",
                    "The last owner cannot be removed. Promote another member first.",
                );
            }
        }
        await this.clubs.removeMember(client, input.clubId, input.handle);
    }

    public async listInvites(input: {
        readonly userId: string;
        readonly clubId: string;
    }): Promise<readonly ClubInvite[]> {
        await this.requireOwner(this.pool, input.clubId, input.userId);
        return this.clubs.listInvites(this.pool, input.clubId);
    }

    public async createInvite(input: {
        readonly userId: string;
        readonly clubId: string;
        readonly maxUses: number;
        readonly expiresInHours: number;
        readonly now: Date;
    }): Promise<ClubInvite> {
        for (let attempt = 0; attempt < MAXIMUM_INVITE_ATTEMPTS; attempt += 1) {
            try {
                return await withTransaction(this.pool, this.createInviteWork.bind(this, input));
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

    private async createInviteWork(
        input: {
            readonly userId: string;
            readonly clubId: string;
            readonly maxUses: number;
            readonly expiresInHours: number;
            readonly now: Date;
        },
        client: QueryExecutor,
    ): Promise<ClubInvite> {
        await this.requireOwner(client, input.clubId, input.userId);
        const expiresAt = new Date(input.now.getTime() + input.expiresInHours * 3_600_000);
        const inviteId = crypto.randomUUID();
        await this.clubs.createInvite(client, {
            id: inviteId,
            clubId: input.clubId,
            code: createInviteCode(),
            createdBy: input.userId,
            maxUses: input.maxUses,
            expiresAt,
            now: input.now,
        });
        const invite = await this.clubs.findInviteById(client, input.clubId, inviteId);
        if (invite === undefined) {
            throw new Error("Invite was not readable after creation.");
        }
        return invite;
    }

    public async revokeInvite(input: {
        readonly userId: string;
        readonly clubId: string;
        readonly inviteId: string;
        readonly now: Date;
    }): Promise<void> {
        await withTransaction(this.pool, this.revokeInviteWork.bind(this, input));
    }

    private async revokeInviteWork(
        input: {
            readonly userId: string;
            readonly clubId: string;
            readonly inviteId: string;
            readonly now: Date;
        },
        client: QueryExecutor,
    ): Promise<void> {
        await this.requireOwner(client, input.clubId, input.userId);
        const revoked = await this.clubs.revokeInvite(
            client,
            input.clubId,
            input.inviteId,
            input.now,
        );
        if (!revoked) {
            throw notFound("club_invite_not_found", "Unknown active invite.");
        }
    }

    public async reportClub(input: {
        readonly userId: string;
        readonly role: "member" | "admin";
        readonly clubId: string;
        readonly reason: string;
        readonly details: string | undefined;
        readonly targetType: "club" | "member" | "event" | undefined;
        readonly targetHandle: string | undefined;
        readonly targetEventId: string | undefined;
        readonly now: Date;
    }): Promise<string> {
        const club = await this.clubs.findClubById(this.pool, input.clubId);
        if (club === undefined) {
            throw new AppError(404, "club_not_found", "Unknown club.");
        }
        if (input.role !== "admin") {
            const membership = await this.clubs.findMembership(
                this.pool,
                input.clubId,
                input.userId,
            );
            if (membership === undefined) {
                throw forbidden("club_forbidden", "Join this club before reporting it.");
            }
        }
        const reason = input.reason.trim();
        if (reason.length < 5) {
            throw validationError("A report needs a short description.", { field: "reason" });
        }
        const details = input.details?.trim();
        if (details !== undefined && details.length < 5) {
            throw validationError("Report details need at least five characters.", {
                field: "details",
            });
        }
        const targetType =
            input.targetType ??
            (input.targetHandle !== undefined
                ? "member"
                : input.targetEventId !== undefined
                  ? "event"
                  : "club");
        if (targetType === "member") {
            if (input.targetHandle === undefined) {
                throw validationError("Choose the member you are reporting.", {
                    field: "targetHandle",
                });
            }
            const target = await this.clubs.findMembershipByHandle(
                this.pool,
                input.clubId,
                input.targetHandle,
            );
            if (target === undefined) {
                throw notFound("club_member_not_found", "That member is not in this club.");
            }
        }
        if (targetType === "event") {
            if (input.targetEventId === undefined) {
                throw validationError("Choose the event you are reporting.", {
                    field: "targetEventId",
                });
            }
            if (this.content.getClubEvent(input.targetEventId) === undefined) {
                throw notFound("event_not_found", "Unknown club event.");
            }
        }
        const reportId = crypto.randomUUID();
        await this.clubs.createReport(this.pool, {
            id: reportId,
            clubId: input.clubId,
            reporterUserId: input.userId,
            reason,
            targetType,
            targetHandle: targetType === "member" ? input.targetHandle : undefined,
            targetEventId: targetType === "event" ? input.targetEventId : undefined,
            details,
            now: input.now,
        });
        return reportId;
    }
}
