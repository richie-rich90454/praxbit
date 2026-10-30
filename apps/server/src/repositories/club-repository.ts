import type {
    Club,
    ClubInvite,
    ClubMember,
    ClubMembershipExport,
    ClubReportExport,
    LeaderboardEntry,
} from "@praxbit/contracts";
import { toIsoString, type QueryExecutor } from "../db/rows.ts";

type ClubRow = {
    id: string;
    name: string;
    invite_code: string;
    owner_id: string | null;
    created_at: Date | string;
    role: "owner" | "member" | null;
    member_count: string;
};

type MemberRow = {
    handle: string;
    display_name: string;
    role: "owner" | "member";
    joined_at: Date | string;
};

type LeaderboardRow = {
    handle: string;
    display_name: string;
    points: string;
    verified_at: Date | string;
};

type SubmissionRow = {
    id: string;
    event_id: string;
    user_id: string;
    answer: string;
    verified: boolean;
    points: number;
    submitted_at: Date | string;
    verified_at: Date | string | null;
};

export interface ClubMembership {
    readonly role: "owner" | "member";
}

export interface ClubSubmissionState {
    readonly verified: boolean;
    readonly points: number;
    readonly verifiedAt: string | undefined;
}

export interface StoredSubmission {
    readonly eventId: string;
    readonly points: number;
    readonly verifiedAt: string;
}

export interface StoredInvite {
    readonly id: string;
    readonly clubId: string;
    readonly maxUses: number;
    readonly usedCount: number;
}

export interface VerifiedParticipant {
    readonly handle: string;
    readonly displayName: string;
    readonly verifiedAt: string;
}

type InviteRow = {
    id: string;
    club_id: string;
    code: string;
    max_uses: number;
    used_count: number;
    expires_at: Date | string;
    created_at: Date | string;
    revoked_at: Date | string | null;
    created_by_handle: string | null;
};

type ParticipantRow = {
    handle: string;
    display_name: string;
    verified_at: Date | string;
};

function toInvite(row: InviteRow): ClubInvite {
    const invite: ClubInvite = {
        id: row.id,
        clubId: row.club_id,
        code: row.code,
        maxUses: row.max_uses,
        usedCount: row.used_count,
        expiresAt: toIsoString(row.expires_at),
        createdAt: toIsoString(row.created_at),
    };
    const withRevoked =
        row.revoked_at === null ? invite : { ...invite, revokedAt: toIsoString(row.revoked_at) };
    return row.created_by_handle === null
        ? withRevoked
        : { ...withRevoked, createdBy: row.created_by_handle };
}

function toClub(row: ClubRow): Club {
    const memberCount = Number(row.member_count);
    const role = row.role === null ? undefined : row.role;
    const inviteCode = row.role === "owner" ? row.invite_code : undefined;
    const base: Club = {
        id: row.id,
        name: row.name,
        memberCount,
        createdAt: toIsoString(row.created_at),
    };
    const withRole = role === undefined ? base : { ...base, role };
    return inviteCode === undefined ? withRole : { ...withRole, inviteCode };
}

export class ClubRepository {
    public async listClubsForUser(
        executor: QueryExecutor,
        userId: string,
    ): Promise<readonly Club[]> {
        const result = await executor.query<ClubRow>(
            `
                SELECT c.id, c.name, c.invite_code, c.owner_id, c.created_at, m.role,
                       (SELECT count(*)::text FROM club_memberships member WHERE member.club_id = c.id) AS member_count
                FROM clubs c
                JOIN club_memberships m ON m.club_id = c.id AND m.user_id = $1
                ORDER BY c.created_at ASC, c.name ASC
            `,
            [userId],
        );
        return result.rows.map(toClub);
    }

    public async findClubForUser(
        executor: QueryExecutor,
        userId: string,
        clubId: string,
    ): Promise<Club | undefined> {
        const result = await executor.query<ClubRow>(
            `
                SELECT c.id, c.name, c.invite_code, c.owner_id, c.created_at, m.role,
                       (SELECT count(*)::text FROM club_memberships member WHERE member.club_id = c.id) AS member_count
                FROM clubs c
                JOIN club_memberships m ON m.club_id = c.id AND m.user_id = $1
                WHERE c.id = $2
            `,
            [userId, clubId],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : toClub(row);
    }

    public async findClubById(executor: QueryExecutor, clubId: string): Promise<Club | undefined> {
        const result = await executor.query<ClubRow>(
            `
                SELECT c.id, c.name, c.invite_code, c.owner_id, c.created_at, NULL::text AS role,
                       (SELECT count(*)::text FROM club_memberships member WHERE member.club_id = c.id) AS member_count
                FROM clubs c
                WHERE c.id = $1
            `,
            [clubId],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : toClub(row);
    }

    public async findClubByInviteCode(
        executor: QueryExecutor,
        inviteCode: string,
    ): Promise<Club | undefined> {
        const result = await executor.query<ClubRow>(
            `
                SELECT c.id, c.name, c.invite_code, c.owner_id, c.created_at, NULL::text AS role,
                       (SELECT count(*)::text FROM club_memberships member WHERE member.club_id = c.id) AS member_count
                FROM clubs c
                WHERE upper(c.invite_code) = upper($1)
            `,
            [inviteCode],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : toClub(row);
    }

    public async createClub(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly name: string;
            readonly inviteCode: string;
            readonly ownerId: string;
            readonly now: Date;
        },
    ): Promise<Club> {
        await executor.query(
            `
                INSERT INTO clubs (id, name, invite_code, owner_id, created_at)
                VALUES ($1, $2, $3, $4, $5)
            `,
            [input.id, input.name, input.inviteCode, input.ownerId, input.now],
        );
        await executor.query(
            `
                INSERT INTO club_memberships (club_id, user_id, role, joined_at)
                VALUES ($1, $2, 'owner', $3)
            `,
            [input.id, input.ownerId, input.now],
        );
        return {
            id: input.id,
            name: input.name,
            role: "owner",
            memberCount: 1,
            inviteCode: input.inviteCode,
            createdAt: input.now.toISOString(),
        };
    }

    public async findMembership(
        executor: QueryExecutor,
        clubId: string,
        userId: string,
    ): Promise<ClubMembership | undefined> {
        const result = await executor.query<{ role: "owner" | "member" }>(
            `
                SELECT role
                FROM club_memberships
                WHERE club_id = $1 AND user_id = $2
            `,
            [clubId, userId],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : { role: row.role };
    }

    public async findFirstClubForUser(
        executor: QueryExecutor,
        userId: string,
    ): Promise<Club | undefined> {
        const result = await executor.query<ClubRow>(
            `
                SELECT c.id, c.name, c.invite_code, c.owner_id, c.created_at, m.role,
                       (SELECT count(*)::text FROM club_memberships member WHERE member.club_id = c.id) AS member_count
                FROM club_memberships m
                JOIN clubs c ON c.id = m.club_id
                WHERE m.user_id = $1
                ORDER BY m.joined_at ASC, c.created_at ASC
                LIMIT 1
            `,
            [userId],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : toClub(row);
    }

    public async findMembershipByHandle(
        executor: QueryExecutor,
        clubId: string,
        handle: string,
    ): Promise<ClubMembership | undefined> {
        const result = await executor.query<{ role: "owner" | "member" }>(
            `
                SELECT m.role
                FROM club_memberships m
                JOIN users u ON u.id = m.user_id
                WHERE m.club_id = $1 AND lower(u.handle) = lower($2)
            `,
            [clubId, handle],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : { role: row.role };
    }

    public async countOwners(executor: QueryExecutor, clubId: string): Promise<number> {
        const result = await executor.query<{ count: string }>(
            `
                SELECT count(*)::text AS count
                FROM club_memberships
                WHERE club_id = $1 AND role = 'owner'
            `,
            [clubId],
        );
        return Number(result.rows[0]?.count ?? "0");
    }

    public async setMemberRole(
        executor: QueryExecutor,
        clubId: string,
        handle: string,
        role: "owner" | "member",
    ): Promise<boolean> {
        const result = await executor.query(
            `
                UPDATE club_memberships m
                SET role = $3
                FROM users u
                WHERE m.user_id = u.id
                    AND m.club_id = $1
                    AND lower(u.handle) = lower($2)
            `,
            [clubId, handle, role],
        );
        return (result.rowCount ?? 0) > 0;
    }

    public async removeMember(
        executor: QueryExecutor,
        clubId: string,
        handle: string,
    ): Promise<boolean> {
        const result = await executor.query(
            `
                DELETE FROM club_memberships m
                USING users u
                WHERE m.user_id = u.id
                    AND m.club_id = $1
                    AND lower(u.handle) = lower($2)
            `,
            [clubId, handle],
        );
        return (result.rowCount ?? 0) > 0;
    }

    public async addMember(
        executor: QueryExecutor,
        clubId: string,
        userId: string,
        now: Date,
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO club_memberships (club_id, user_id, role, joined_at)
                VALUES ($1, $2, 'member', $3)
                ON CONFLICT (club_id, user_id) DO NOTHING
            `,
            [clubId, userId, now],
        );
    }

    public async listMembers(
        executor: QueryExecutor,
        clubId: string,
    ): Promise<readonly ClubMember[]> {
        const result = await executor.query<MemberRow>(
            `
                SELECT u.handle, u.display_name, m.role, m.joined_at
                FROM club_memberships m
                JOIN users u ON u.id = m.user_id
                WHERE m.club_id = $1
                ORDER BY m.joined_at ASC, u.handle ASC
            `,
            [clubId],
        );
        return result.rows.map(function memberOf(row: MemberRow): ClubMember {
            return {
                handle: row.handle,
                displayName: row.display_name,
                role: row.role,
                joinedAt: toIsoString(row.joined_at),
            };
        });
    }

    public async listLeaderboard(
        executor: QueryExecutor,
        clubId: string,
    ): Promise<readonly LeaderboardEntry[]> {
        const result = await executor.query<LeaderboardRow>(
            `
                SELECT u.handle, u.display_name, sum(es.points)::text AS points, max(es.verified_at) AS verified_at
                FROM event_submissions es
                JOIN users u ON u.id = es.user_id
                WHERE es.club_id = $1 AND es.verified = true
                GROUP BY u.id, u.handle, u.display_name
                ORDER BY sum(es.points) DESC, max(es.verified_at) ASC, u.handle ASC
                LIMIT 50
            `,
            [clubId],
        );
        return result.rows.map(function entryOf(row: LeaderboardRow): LeaderboardEntry {
            return {
                handle: row.handle,
                displayName: row.display_name,
                points: Number(row.points),
                verifiedAt: toIsoString(row.verified_at),
            };
        });
    }

    public async listVerifiedSubmissions(
        executor: QueryExecutor,
        clubId: string,
        userId: string,
    ): Promise<readonly StoredSubmission[]> {
        const result = await executor.query<SubmissionRow>(
            `
                SELECT id, event_id, user_id, answer, verified, points, submitted_at, verified_at
                FROM event_submissions
                WHERE club_id = $1 AND user_id = $2 AND verified = true
                ORDER BY verified_at ASC
            `,
            [clubId, userId],
        );
        const submissions: StoredSubmission[] = [];
        for (const row of result.rows) {
            if (row.verified_at === null) {
                continue;
            }
            submissions.push({
                eventId: row.event_id,
                points: row.points,
                verifiedAt: toIsoString(row.verified_at),
            });
        }
        return submissions;
    }

    public async ensureClubEvent(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly title: string;
            readonly summary: string;
            readonly weekOf: string;
            readonly skillIds: readonly string[];
            readonly points: number;
        },
    ): Promise<void> {
        await executor.query(
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
            [input.id, input.title, input.summary, input.weekOf, input.skillIds, input.points],
        );
    }

    public async saveSubmission(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly clubId: string;
            readonly eventId: string;
            readonly userId: string;
            readonly answer: string;
            readonly verified: boolean;
            readonly points: number;
            readonly now: Date;
        },
    ): Promise<ClubSubmissionState> {
        if (input.verified) {
            await executor.query(
                `
                    INSERT INTO event_submissions (
                        id, club_id, event_id, user_id, answer, verified, points, submitted_at, verified_at
                    )
                    VALUES ($1, $2, $3, $4, $5, true, $6, $7, $7)
                    ON CONFLICT (club_id, event_id, user_id) DO UPDATE
                    SET answer = EXCLUDED.answer,
                        verified = true,
                        points = EXCLUDED.points,
                        verified_at = EXCLUDED.verified_at
                    WHERE event_submissions.verified = false
                `,
                [
                    input.id,
                    input.clubId,
                    input.eventId,
                    input.userId,
                    input.answer,
                    input.points,
                    input.now,
                ],
            );
        } else {
            await executor.query(
                `
                    INSERT INTO event_submissions (
                        id, club_id, event_id, user_id, answer, verified, points, submitted_at
                    )
                    VALUES ($1, $2, $3, $4, $5, false, 0, $6)
                    ON CONFLICT (club_id, event_id, user_id) DO UPDATE
                    SET answer = EXCLUDED.answer,
                        submitted_at = EXCLUDED.submitted_at
                    WHERE event_submissions.verified = false
                `,
                [input.id, input.clubId, input.eventId, input.userId, input.answer, input.now],
            );
        }

        const current = await executor.query<SubmissionRow>(
            `
                SELECT id, event_id, user_id, answer, verified, points, submitted_at, verified_at
                FROM event_submissions
                WHERE club_id = $1 AND event_id = $2 AND user_id = $3
            `,
            [input.clubId, input.eventId, input.userId],
        );
        const row = current.rows[0];
        if (row === undefined) {
            throw new Error("Event submission vanished after upsert.");
        }
        if (row.verified_at === null) {
            return { verified: row.verified, points: row.points, verifiedAt: undefined };
        }
        return {
            verified: row.verified,
            points: row.points,
            verifiedAt: toIsoString(row.verified_at),
        };
    }

    public async createInvite(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly clubId: string;
            readonly code: string;
            readonly createdBy: string;
            readonly maxUses: number;
            readonly expiresAt: Date;
            readonly now: Date;
        },
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO club_invites (
                    id, club_id, code, created_by, max_uses, used_count, expires_at, created_at
                )
                VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
            `,
            [
                input.id,
                input.clubId,
                input.code,
                input.createdBy,
                input.maxUses,
                input.expiresAt,
                input.now,
            ],
        );
    }

    public async listInvites(
        executor: QueryExecutor,
        clubId: string,
    ): Promise<readonly ClubInvite[]> {
        const result = await executor.query<InviteRow>(
            `
                SELECT i.id, i.club_id, i.code, i.max_uses, i.used_count, i.expires_at,
                       i.created_at, i.revoked_at, u.handle AS created_by_handle
                FROM club_invites i
                LEFT JOIN users u ON u.id = i.created_by
                WHERE i.club_id = $1
                ORDER BY i.created_at DESC, i.id ASC
            `,
            [clubId],
        );
        return result.rows.map(toInvite);
    }

    public async findInviteById(
        executor: QueryExecutor,
        clubId: string,
        inviteId: string,
    ): Promise<ClubInvite | undefined> {
        const result = await executor.query<InviteRow>(
            `
                SELECT i.id, i.club_id, i.code, i.max_uses, i.used_count, i.expires_at,
                       i.created_at, i.revoked_at, u.handle AS created_by_handle
                FROM club_invites i
                LEFT JOIN users u ON u.id = i.created_by
                WHERE i.club_id = $1 AND i.id = $2
            `,
            [clubId, inviteId],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : toInvite(row);
    }

    public async findInviteByCode(
        executor: QueryExecutor,
        code: string,
    ): Promise<StoredInvite | undefined> {
        const result = await executor.query<{
            id: string;
            club_id: string;
            max_uses: number;
            used_count: number;
        }>(
            `
                SELECT id, club_id, max_uses, used_count
                FROM club_invites
                WHERE upper(code) = upper($1)
            `,
            [code],
        );
        const row = result.rows[0];
        if (row === undefined) {
            return undefined;
        }
        return {
            id: row.id,
            clubId: row.club_id,
            maxUses: row.max_uses,
            usedCount: row.used_count,
        };
    }

    public async findActiveInviteByCode(
        executor: QueryExecutor,
        code: string,
        now: Date,
    ): Promise<StoredInvite | undefined> {
        const result = await executor.query<{
            id: string;
            club_id: string;
            max_uses: number;
            used_count: number;
        }>(
            `
                SELECT id, club_id, max_uses, used_count
                FROM club_invites
                WHERE upper(code) = upper($1)
                    AND revoked_at IS NULL
                    AND expires_at > $2
                    AND used_count < max_uses
            `,
            [code, now],
        );
        const row = result.rows[0];
        if (row === undefined) {
            return undefined;
        }
        return {
            id: row.id,
            clubId: row.club_id,
            maxUses: row.max_uses,
            usedCount: row.used_count,
        };
    }

    public async consumeInvite(
        executor: QueryExecutor,
        inviteId: string,
        now: Date,
    ): Promise<boolean> {
        const result = await executor.query(
            `
                UPDATE club_invites
                SET used_count = used_count + 1
                WHERE id = $1
                    AND revoked_at IS NULL
                    AND expires_at > $2
                    AND used_count < max_uses
            `,
            [inviteId, now],
        );
        return (result.rowCount ?? 0) > 0;
    }

    public async revokeInvite(
        executor: QueryExecutor,
        clubId: string,
        inviteId: string,
        now: Date,
    ): Promise<boolean> {
        const result = await executor.query(
            `
                UPDATE club_invites
                SET revoked_at = $3
                WHERE id = $1 AND club_id = $2 AND revoked_at IS NULL
            `,
            [inviteId, clubId, now],
        );
        return (result.rowCount ?? 0) > 0;
    }

    public async listVerifiedParticipants(
        executor: QueryExecutor,
        clubId: string,
        eventId: string,
    ): Promise<readonly VerifiedParticipant[]> {
        const result = await executor.query<ParticipantRow>(
            `
                SELECT u.handle, u.display_name, max(es.verified_at) AS verified_at
                FROM event_submissions es
                JOIN users u ON u.id = es.user_id
                WHERE es.club_id = $1 AND es.event_id = $2 AND es.verified = true
                GROUP BY u.id, u.handle, u.display_name
                ORDER BY max(es.verified_at) ASC, u.handle ASC
            `,
            [clubId, eventId],
        );
        return result.rows.map(function participantOf(row: ParticipantRow): VerifiedParticipant {
            return {
                handle: row.handle,
                displayName: row.display_name,
                verifiedAt: toIsoString(row.verified_at),
            };
        });
    }

    public async hasCooperativeChallenge(
        executor: QueryExecutor,
        userId: string,
    ): Promise<boolean> {
        const result = await executor.query<{ completed: boolean }>(
            `
                SELECT EXISTS (
                    SELECT 1
                    FROM event_submissions mine
                    JOIN club_memberships membership
                        ON membership.club_id = mine.club_id AND membership.user_id = mine.user_id
                    JOIN event_submissions teammate
                        ON teammate.club_id = mine.club_id
                        AND teammate.event_id = mine.event_id
                        AND teammate.verified = true
                        AND teammate.user_id <> mine.user_id
                    WHERE mine.user_id = $1 AND mine.verified = true
                ) AS completed
            `,
            [userId],
        );
        return result.rows[0]?.completed === true;
    }

    public async createReport(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly clubId: string;
            readonly reporterUserId: string;
            readonly reason: string;
            readonly targetType: "club" | "member" | "event";
            readonly targetHandle: string | undefined;
            readonly targetEventId: string | undefined;
            readonly details: string | undefined;
            readonly now: Date;
        },
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO club_reports (
                    id, club_id, reporter_user_id, reason, target_type,
                    target_handle, target_event_id, details, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            [
                input.id,
                input.clubId,
                input.reporterUserId,
                input.reason,
                input.targetType,
                input.targetHandle ?? null,
                input.targetEventId ?? null,
                input.details ?? null,
                input.now,
            ],
        );
    }

    public async countCompletedEventsForUser(
        executor: QueryExecutor,
        userId: string,
    ): Promise<number> {
        const result = await executor.query<{ count: string }>(
            `
                SELECT count(DISTINCT event_id)::text AS count
                FROM event_submissions
                WHERE user_id = $1 AND verified = true
            `,
            [userId],
        );
        return Number(result.rows[0]?.count ?? "0");
    }

    public async listMembershipsForUser(
        executor: QueryExecutor,
        userId: string,
    ): Promise<readonly ClubMembershipExport[]> {
        const result = await executor.query<{
            club_id: string;
            name: string;
            role: "owner" | "member";
            joined_at: Date | string;
        }>(
            `
                SELECT m.club_id, c.name, m.role, m.joined_at
                FROM club_memberships m
                JOIN clubs c ON c.id = m.club_id
                WHERE m.user_id = $1
                ORDER BY m.joined_at ASC, c.name ASC
            `,
            [userId],
        );
        return result.rows.map(function membershipOf(row): ClubMembershipExport {
            return {
                clubId: row.club_id,
                clubName: row.name,
                role: row.role,
                joinedAt: toIsoString(row.joined_at),
            };
        });
    }

    public async listReportsForUser(
        executor: QueryExecutor,
        userId: string,
    ): Promise<readonly ClubReportExport[]> {
        const result = await executor.query<{
            id: string;
            club_id: string;
            reason: string;
            status: "open" | "reviewed" | "dismissed";
            created_at: Date | string;
            resolved_at: Date | string | null;
        }>(
            `
                SELECT id, club_id, reason, status, created_at, resolved_at
                FROM club_reports
                WHERE reporter_user_id = $1
                ORDER BY created_at ASC, id ASC
            `,
            [userId],
        );
        return result.rows.map(function reportOf(row): ClubReportExport {
            if (row.resolved_at === null) {
                return {
                    id: row.id,
                    clubId: row.club_id,
                    reason: row.reason,
                    status: row.status,
                    createdAt: toIsoString(row.created_at),
                };
            }
            return {
                id: row.id,
                clubId: row.club_id,
                reason: row.reason,
                status: row.status,
                createdAt: toIsoString(row.created_at),
                resolvedAt: toIsoString(row.resolved_at),
            };
        });
    }
}
