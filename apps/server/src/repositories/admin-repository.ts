import type { QueryExecutor } from "../db/rows.ts";

type CountRow = {
    users: string;
    sessions: string;
    evidence: string;
    completions: string;
    clubs: string;
    verified_submissions: string;
    reports: string;
};

export interface AdminOverview {
    readonly users: number;
    readonly activeSessions: number;
    readonly evidence: number;
    readonly completions: number;
    readonly clubs: number;
    readonly verifiedEventSubmissions: number;
    readonly openReports: number;
    readonly generatedAt: string;
}

export interface ClubReport {
    readonly id: string;
    readonly clubId: string;
    readonly reporterId: string | null;
    readonly reason: string;
    readonly details?: string;
    readonly targetType: "club" | "member" | "event";
    readonly targetHandle?: string;
    readonly targetEventId?: string;
    readonly status: string;
    readonly createdAt: string;
}

type MutableClubReport = { -readonly [Key in keyof ClubReport]: ClubReport[Key] };

type ReportRow = {
    id: string;
    club_id: string;
    reporter_user_id: string | null;
    reason: string;
    details: string | null;
    target_type: "club" | "member" | "event";
    target_handle: string | null;
    target_event_id: string | null;
    status: string;
    created_at: Date | string;
};

export class AdminRepository {
    public async overview(executor: QueryExecutor, now: Date): Promise<AdminOverview> {
        const result = await executor.query<CountRow>(
            `
                SELECT
                    (SELECT count(*)::text FROM users) AS users,
                    (SELECT count(*)::text FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > $1) AS sessions,
                    (SELECT count(*)::text FROM learning_evidence) AS evidence,
                    (SELECT count(*)::text FROM mission_completions) AS completions,
                    (SELECT count(*)::text FROM clubs) AS clubs,
                    (SELECT count(*)::text FROM event_submissions WHERE verified = true) AS verified_submissions,
                    (SELECT count(*)::text FROM club_reports WHERE status = 'open') AS reports
            `,
            [now],
        );
        const row = result.rows[0];
        if (row === undefined) {
            return {
                users: 0,
                activeSessions: 0,
                evidence: 0,
                completions: 0,
                clubs: 0,
                verifiedEventSubmissions: 0,
                openReports: 0,
                generatedAt: now.toISOString(),
            };
        }
        return {
            users: Number(row.users),
            activeSessions: Number(row.sessions),
            evidence: Number(row.evidence),
            completions: Number(row.completions),
            clubs: Number(row.clubs),
            verifiedEventSubmissions: Number(row.verified_submissions),
            openReports: Number(row.reports),
            generatedAt: now.toISOString(),
        };
    }

    public async listOpenReports(executor: QueryExecutor): Promise<readonly ClubReport[]> {
        const result = await executor.query<ReportRow>(
            `
                SELECT id, club_id, reporter_user_id, reason, details, target_type,
                       target_handle, target_event_id, status, created_at
                FROM club_reports
                WHERE status = 'open'
                ORDER BY created_at DESC
                LIMIT 100
            `,
        );
        return result.rows.map(function reportOf(row: ReportRow): ClubReport {
            const report: ClubReport = {
                id: row.id,
                clubId: row.club_id,
                reporterId: row.reporter_user_id,
                reason: row.reason,
                targetType: row.target_type,
                status: row.status,
                createdAt:
                    row.created_at instanceof Date
                        ? row.created_at.toISOString()
                        : new Date(row.created_at).toISOString(),
            };
            const complete: MutableClubReport = {
                id: report.id,
                clubId: report.clubId,
                reporterId: report.reporterId,
                reason: report.reason,
                targetType: report.targetType,
                status: report.status,
                createdAt: report.createdAt,
            };
            if (row.details !== null) {
                complete.details = row.details;
            }
            if (row.target_handle !== null) {
                complete.targetHandle = row.target_handle;
            }
            if (row.target_event_id !== null) {
                complete.targetEventId = row.target_event_id;
            }
            return complete;
        });
    }

    public async resolveReport(
        executor: QueryExecutor,
        reportId: string,
        now: Date,
    ): Promise<boolean> {
        const result = await executor.query(
            `
                UPDATE club_reports
                SET status = 'reviewed', resolved_at = $2
                WHERE id = $1 AND status = 'open'
            `,
            [reportId, now],
        );
        return (result.rowCount ?? 0) > 0;
    }
}
