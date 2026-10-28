import type { Club, ClubMember, LeaderboardEntry } from "@praxbit/contracts";
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

    public async createReport(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly clubId: string;
            readonly reporterUserId: string;
            readonly reason: string;
            readonly now: Date;
        },
    ): Promise<void> {
        await executor.query(
            `
                INSERT INTO club_reports (id, club_id, reporter_user_id, reason, created_at)
                VALUES ($1, $2, $3, $4, $5)
            `,
            [input.id, input.clubId, input.reporterUserId, input.reason, input.now],
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
}
