import type {
    AchievementRecord,
    CompletionRecord,
    EvidenceSubmission,
    Preferences,
    Progress,
    ReviewItem,
    SkillMastery,
    User,
} from "@praxbit/contracts";
import {
    toAchievement,
    toCompletion,
    toEvidenceSubmission,
    toMastery,
    toPreferences,
    toProgress,
    toReview,
    toUser,
    type AchievementRow,
    type CompletionRow,
    type EvidenceRow,
    type MasteryRow,
    type PreferencesRow,
    type ProgressRow,
    type QueryExecutor,
    type ReviewRow,
    type UserRow,
} from "../db/rows.ts";

export interface CreatedUser {
    readonly user: User;
    readonly preferences: Preferences;
    readonly progress: Progress;
}

export interface UserWithSecret {
    readonly user: User;
    readonly passwordHash: string;
}

const DEFAULT_PREFERENCES: Preferences = {
    interests: ["everything"],
    textScale: 1,
    motion: "system",
    sound: true,
    challenge: "standard",
    reminders: { enabled: false, quietStart: "21:00", quietEnd: "07:00" },
    aiTutor: false,
};

export class UserRepository {
    public async findUserWithSecretByHandle(
        executor: QueryExecutor,
        handle: string,
    ): Promise<UserWithSecret | undefined> {
        const result = await executor.query<UserRow & { secret_hash: string }>(
            `
                SELECT u.id, u.handle, u.display_name, u.role, u.created_at, i.secret_hash
                FROM users u
                JOIN auth_identities i ON i.user_id = u.id AND i.provider = 'password'
                WHERE lower(u.handle) = lower($1)
            `,
            [handle],
        );
        const row = result.rows[0];
        if (row === undefined) {
            return undefined;
        }
        return { user: toUser(row), passwordHash: row.secret_hash };
    }

    public async findUserById(executor: QueryExecutor, userId: string): Promise<User | undefined> {
        const result = await executor.query<UserRow>(
            `
                SELECT id, handle, display_name, role, created_at
                FROM users
                WHERE id = $1
            `,
            [userId],
        );
        const row = result.rows[0];
        return row === undefined ? undefined : toUser(row);
    }

    public async createUser(
        executor: QueryExecutor,
        input: {
            readonly id: string;
            readonly handle: string;
            readonly displayName: string;
            readonly role: "member" | "admin";
            readonly passwordHash: string;
            readonly identityId: string;
        },
    ): Promise<CreatedUser> {
        const inserted = await executor.query<UserRow>(
            `
                INSERT INTO users (id, handle, display_name, role)
                VALUES ($1, $2, $3, $4)
                RETURNING id, handle, display_name, role, created_at
            `,
            [input.id, input.handle, input.displayName, input.role],
        );
        const row = inserted.rows[0];
        if (row === undefined) {
            throw new Error("User insert returned no row.");
        }

        await executor.query(
            `
                INSERT INTO auth_identities (id, user_id, provider, identifier, secret_hash)
                VALUES ($1, $2, 'password', $3, $4)
            `,
            [input.identityId, input.id, input.handle, input.passwordHash],
        );

        const preferences = await this.insertDefaultPreferences(executor, input.id);
        const progress = await this.insertDefaultProgress(executor, input.id);
        return { user: toUser(row), preferences, progress };
    }

    public async insertDefaultPreferences(
        executor: QueryExecutor,
        userId: string,
    ): Promise<Preferences> {
        const inserted = await executor.query<PreferencesRow>(
            `
                INSERT INTO user_preferences (
                    user_id, interests, text_scale, motion, sound, challenge,
                    reminders_enabled, quiet_start, quiet_end, ai_tutor
                )
                VALUES ($1, $2::text[], $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (user_id) DO NOTHING
                RETURNING user_id, interests, text_scale, motion, sound, challenge,
                          reminders_enabled, quiet_start, quiet_end, ai_tutor
            `,
            [
                userId,
                DEFAULT_PREFERENCES.interests,
                DEFAULT_PREFERENCES.textScale,
                DEFAULT_PREFERENCES.motion,
                DEFAULT_PREFERENCES.sound,
                DEFAULT_PREFERENCES.challenge,
                DEFAULT_PREFERENCES.reminders.enabled,
                DEFAULT_PREFERENCES.reminders.quietStart,
                DEFAULT_PREFERENCES.reminders.quietEnd,
                DEFAULT_PREFERENCES.aiTutor,
            ],
        );
        const row = inserted.rows[0];
        if (row !== undefined) {
            return toPreferences(row);
        }
        const existing = await this.getPreferences(executor, userId);
        return existing;
    }

    public async getPreferences(executor: QueryExecutor, userId: string): Promise<Preferences> {
        const result = await executor.query<PreferencesRow>(
            `
                SELECT user_id, interests, text_scale, motion, sound, challenge,
                       reminders_enabled, quiet_start, quiet_end, ai_tutor
                FROM user_preferences
                WHERE user_id = $1
            `,
            [userId],
        );
        const row = result.rows[0];
        if (row === undefined) {
            return this.insertDefaultPreferences(executor, userId);
        }
        return toPreferences(row);
    }

    public async savePreferences(
        executor: QueryExecutor,
        userId: string,
        preferences: Preferences,
    ): Promise<Preferences> {
        const result = await executor.query<PreferencesRow>(
            `
                INSERT INTO user_preferences (
                    user_id, interests, text_scale, motion, sound, challenge,
                    reminders_enabled, quiet_start, quiet_end, ai_tutor, updated_at
                )
                VALUES ($1, $2::text[], $3, $4, $5, $6, $7, $8, $9, $10, now())
                ON CONFLICT (user_id) DO UPDATE
                SET interests = EXCLUDED.interests,
                    text_scale = EXCLUDED.text_scale,
                    motion = EXCLUDED.motion,
                    sound = EXCLUDED.sound,
                    challenge = EXCLUDED.challenge,
                    reminders_enabled = EXCLUDED.reminders_enabled,
                    quiet_start = EXCLUDED.quiet_start,
                    quiet_end = EXCLUDED.quiet_end,
                    ai_tutor = EXCLUDED.ai_tutor,
                    updated_at = now()
                RETURNING user_id, interests, text_scale, motion, sound, challenge,
                          reminders_enabled, quiet_start, quiet_end, ai_tutor
            `,
            [
                userId,
                preferences.interests,
                preferences.textScale,
                preferences.motion,
                preferences.sound,
                preferences.challenge,
                preferences.reminders.enabled,
                preferences.reminders.quietStart,
                preferences.reminders.quietEnd,
                preferences.aiTutor,
            ],
        );
        const row = result.rows[0];
        if (row === undefined) {
            throw new Error("Preference upsert returned no row.");
        }
        return toPreferences(row);
    }

    public async insertDefaultProgress(executor: QueryExecutor, userId: string): Promise<Progress> {
        const inserted = await executor.query<ProgressRow>(
            `
                INSERT INTO user_progress (user_id, experience, level, streak_days, longest_streak)
                VALUES ($1, 0, 1, 0, 0)
                ON CONFLICT (user_id) DO NOTHING
                RETURNING user_id, experience, level, streak_days, longest_streak,
                          last_practice_on, placement_skipped_skills
            `,
            [userId],
        );
        const row = inserted.rows[0];
        if (row !== undefined) {
            return toProgress(row, []);
        }
        return this.getProgress(executor, userId);
    }

    public async getProgress(executor: QueryExecutor, userId: string): Promise<Progress> {
        const result = await executor.query<ProgressRow>(
            `
                SELECT user_id, experience, level, streak_days, longest_streak,
                       last_practice_on, placement_skipped_skills
                FROM user_progress
                WHERE user_id = $1
            `,
            [userId],
        );
        const row = result.rows[0];
        if (row === undefined) {
            return this.insertDefaultProgress(executor, userId);
        }
        const achievements = await this.listAchievements(executor, userId);
        return toProgress(row, achievements);
    }

    public async saveProgress(
        executor: QueryExecutor,
        userId: string,
        progress: {
            readonly experience: number;
            readonly level: number;
            readonly streakDays: number;
            readonly longestStreak: number;
            readonly lastPracticeOn: string | undefined;
            readonly placementSkippedSkills: readonly string[];
        },
    ): Promise<Progress> {
        await executor.query(
            `
                INSERT INTO user_progress (
                    user_id, experience, level, streak_days, longest_streak,
                    last_practice_on, placement_skipped_skills, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7::text[], now())
                ON CONFLICT (user_id) DO UPDATE
                SET experience = EXCLUDED.experience,
                    level = EXCLUDED.level,
                    streak_days = EXCLUDED.streak_days,
                    longest_streak = EXCLUDED.longest_streak,
                    last_practice_on = EXCLUDED.last_practice_on,
                    placement_skipped_skills = EXCLUDED.placement_skipped_skills,
                    updated_at = now()
            `,
            [
                userId,
                progress.experience,
                progress.level,
                progress.streakDays,
                progress.longestStreak,
                progress.lastPracticeOn ?? null,
                progress.placementSkippedSkills,
            ],
        );
        return this.getProgress(executor, userId);
    }

    public async listAchievements(
        executor: QueryExecutor,
        userId: string,
    ): Promise<readonly AchievementRecord[]> {
        const result = await executor.query<AchievementRow>(
            `
                SELECT achievement_id, earned_at
                FROM user_achievements
                WHERE user_id = $1
                ORDER BY earned_at ASC, achievement_id ASC
            `,
            [userId],
        );
        return result.rows.map(toAchievement);
    }

    public async grantAchievements(
        executor: QueryExecutor,
        userId: string,
        achievementIds: readonly string[],
        now: Date,
    ): Promise<readonly AchievementRecord[]> {
        if (achievementIds.length === 0) {
            return [];
        }
        const result = await executor.query<AchievementRow>(
            `
                INSERT INTO user_achievements (user_id, achievement_id, earned_at)
                SELECT $1, value, $3::timestamptz
                FROM unnest($2::text[]) AS value
                ON CONFLICT (user_id, achievement_id) DO NOTHING
                RETURNING achievement_id, earned_at
            `,
            [userId, achievementIds, now],
        );
        return result.rows.map(toAchievement);
    }

    public async listCompletions(
        executor: QueryExecutor,
        userId: string,
    ): Promise<readonly CompletionRecord[]> {
        const result = await executor.query<CompletionRow>(
            `
                SELECT user_id, mission_id, mission_version, attempt_id, completed_at,
                       independent, experience_awarded
                FROM mission_completions
                WHERE user_id = $1
                ORDER BY completed_at ASC, mission_id ASC
            `,
            [userId],
        );
        return result.rows.map(toCompletion);
    }

    public async listMastery(
        executor: QueryExecutor,
        userId: string,
    ): Promise<readonly SkillMastery[]> {
        const result = await executor.query<MasteryRow>(
            `
                SELECT user_id, skill_id, mastery_score, evidence_count, independent_successes,
                       assisted_successes, recent_failures, updated_at
                FROM skill_mastery
                WHERE user_id = $1
                ORDER BY skill_id ASC
            `,
            [userId],
        );
        return result.rows.map(toMastery);
    }

    public async listReviews(
        executor: QueryExecutor,
        userId: string,
    ): Promise<readonly ReviewItem[]> {
        const result = await executor.query<ReviewRow>(
            `
                SELECT user_id, skill_id, interval_index, due_at, last_reviewed_at, last_outcome
                FROM review_schedules
                WHERE user_id = $1
                ORDER BY due_at ASC, skill_id ASC
            `,
            [userId],
        );
        return result.rows.map(toReview);
    }

    public async listEvidence(
        executor: QueryExecutor,
        userId: string,
    ): Promise<readonly EvidenceSubmission[]> {
        const result = await executor.query<EvidenceRow>(
            `
                SELECT user_id, id, mission_id, mission_version, category, outcome, assistance,
                       independence, step_id, attempt_id, detail, created_at
                FROM learning_evidence
                WHERE user_id = $1
                ORDER BY created_at ASC, id ASC
            `,
            [userId],
        );
        return result.rows.map(toEvidenceSubmission);
    }

    public async deleteUser(executor: QueryExecutor, userId: string): Promise<boolean> {
        const result = await executor.query(
            `
                DELETE FROM users
                WHERE id = $1
            `,
            [userId],
        );
        return (result.rowCount ?? 0) > 0;
    }
}
