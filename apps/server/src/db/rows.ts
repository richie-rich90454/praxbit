import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import {
    PreferencesSchema,
    type AchievementRecord,
    type CompletionRecord,
    type EvidenceSubmission,
    type Preferences,
    type Progress,
    type ReviewItem,
    type SkillMastery,
    type User,
} from "@praxbit/contracts";

export interface QueryExecutor {
    query<Row extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: readonly unknown[],
    ): Promise<QueryResult<Row>>;
}

export type TransactionalExecutor = Pool | PoolClient;

export function toIsoString(value: Date | string): string {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return new Date(value).toISOString();
}

export function toNullableIsoString(value: Date | string | null): string | undefined {
    if (value === null) {
        return undefined;
    }
    return toIsoString(value);
}

export type UserRow = {
    id: string;
    handle: string;
    display_name: string;
    role: "member" | "admin";
    created_at: Date | string;
};

export function toUser(row: UserRow): User {
    return {
        id: row.id,
        handle: row.handle,
        displayName: row.display_name,
        role: row.role,
        createdAt: toIsoString(row.created_at),
    };
}

export type PreferencesRow = {
    user_id: string;
    interests: string[];
    text_scale: number;
    motion: "system" | "reduce" | "full";
    sound: boolean;
    challenge: "gentle" | "standard" | "stretch";
    reminders_enabled: boolean;
    quiet_start: string;
    quiet_end: string;
    ai_tutor: boolean;
};

export function toPreferences(row: PreferencesRow): Preferences {
    return PreferencesSchema.parse({
        interests: row.interests,
        textScale: row.text_scale,
        motion: row.motion,
        sound: row.sound,
        challenge: row.challenge,
        reminders: {
            enabled: row.reminders_enabled,
            quietStart: row.quiet_start,
            quietEnd: row.quiet_end,
        },
        aiTutor: row.ai_tutor,
    });
}

export type ProgressRow = {
    user_id: string;
    experience: number;
    level: number;
    streak_days: number;
    longest_streak: number;
    last_practice_on: string | null;
    placement_skipped_skills: string[];
};

export function toProgress(row: ProgressRow, achievements: readonly AchievementRecord[]): Progress {
    if (row.last_practice_on === null) {
        return {
            experience: row.experience,
            level: row.level,
            streakDays: row.streak_days,
            longestStreak: row.longest_streak,
            placementSkippedSkills: row.placement_skipped_skills,
            achievements: [...achievements],
        };
    }
    return {
        experience: row.experience,
        level: row.level,
        streakDays: row.streak_days,
        longestStreak: row.longest_streak,
        lastPracticeOn: row.last_practice_on,
        placementSkippedSkills: row.placement_skipped_skills,
        achievements: [...achievements],
    };
}

export type MasteryRow = {
    user_id: string;
    skill_id: string;
    mastery_score: number;
    evidence_count: number;
    independent_successes: number;
    assisted_successes: number;
    recent_failures: number;
    updated_at: Date | string;
};

export function toMastery(row: MasteryRow): SkillMastery {
    return {
        skillId: row.skill_id,
        score: row.mastery_score,
        evidenceCount: row.evidence_count,
        independentSuccesses: row.independent_successes,
        assistedSuccesses: row.assisted_successes,
        recentFailures: row.recent_failures,
        updatedAt: toIsoString(row.updated_at),
    };
}

export type ReviewRow = {
    user_id: string;
    skill_id: string;
    interval_index: number;
    due_at: Date | string;
    last_reviewed_at: Date | string | null;
    last_outcome: "success" | "failure" | null;
};

export function toReview(row: ReviewRow): ReviewItem {
    if (row.last_reviewed_at === null) {
        if (row.last_outcome === null) {
            return {
                skillId: row.skill_id,
                intervalIndex: row.interval_index,
                dueAt: toIsoString(row.due_at),
            };
        }
        return {
            skillId: row.skill_id,
            intervalIndex: row.interval_index,
            dueAt: toIsoString(row.due_at),
            lastOutcome: row.last_outcome,
        };
    }
    if (row.last_outcome === null) {
        return {
            skillId: row.skill_id,
            intervalIndex: row.interval_index,
            dueAt: toIsoString(row.due_at),
            lastReviewedAt: toIsoString(row.last_reviewed_at),
        };
    }
    return {
        skillId: row.skill_id,
        intervalIndex: row.interval_index,
        dueAt: toIsoString(row.due_at),
        lastReviewedAt: toIsoString(row.last_reviewed_at),
        lastOutcome: row.last_outcome,
    };
}

export type CompletionRow = {
    user_id: string;
    mission_id: string;
    mission_version: number;
    attempt_id: string;
    completed_at: Date | string;
    independent: boolean;
    experience_awarded: number;
};

export function toCompletion(row: CompletionRow): CompletionRecord {
    return {
        missionId: row.mission_id,
        missionVersion: row.mission_version,
        attemptId: row.attempt_id,
        completedAt: toIsoString(row.completed_at),
        independent: row.independent,
    };
}

export type AchievementRow = {
    achievement_id: string;
    earned_at: Date | string;
};

export function toAchievement(row: AchievementRow): AchievementRecord {
    return {
        achievementId: row.achievement_id,
        earnedAt: toIsoString(row.earned_at),
    };
}

export type EvidenceRow = {
    user_id: string;
    id: string;
    mission_id: string;
    mission_version: number;
    category: EvidenceSubmission["category"];
    outcome: EvidenceSubmission["outcome"];
    assistance: EvidenceSubmission["assistance"];
    independence: number;
    step_id: string | null;
    attempt_id: string | null;
    detail: string | null;
    created_at: Date | string;
};

export function toEvidenceSubmission(row: EvidenceRow): EvidenceSubmission {
    const base: EvidenceSubmission = {
        id: row.id,
        missionId: row.mission_id,
        missionVersion: row.mission_version,
        category: row.category,
        outcome: row.outcome,
        assistance: row.assistance,
        independence: row.independence,
        createdAt: toIsoString(row.created_at),
    };
    const withStep = row.step_id === null ? base : { ...base, stepId: row.step_id };
    const withAttempt =
        row.attempt_id === null ? withStep : { ...withStep, attemptId: row.attempt_id };
    return row.detail === null ? withAttempt : { ...withAttempt, detail: row.detail };
}
