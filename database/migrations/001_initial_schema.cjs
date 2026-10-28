/**
 * Complete authoritative schema for the Praxbit account platform.
 * JSONB is limited to versioned simulation snapshots, project file maps, and
 * audit/idempotency payloads whose shape belongs to the application layer.
 */

// @ts-check

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
function up(pgm) {
    pgm.sql(`
        CREATE TABLE users (
            id UUID PRIMARY KEY,
            handle TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT users_handle_length CHECK (char_length(handle) BETWEEN 3 AND 24),
            CONSTRAINT users_handle_format CHECK (handle ~ '^[a-z0-9_]+$'),
            CONSTRAINT users_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 40),
            CONSTRAINT users_role_valid CHECK (role IN ('member', 'admin'))
        );

        CREATE UNIQUE INDEX users_handle_unique ON users (lower(handle));

        CREATE TABLE auth_identities (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            provider TEXT NOT NULL,
            identifier TEXT NOT NULL,
            secret_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT auth_identities_provider_valid CHECK (provider IN ('password')),
            CONSTRAINT auth_identities_identifier_unique UNIQUE (provider, identifier)
        );

        CREATE INDEX auth_identities_user_idx ON auth_identities (user_id);

        CREATE TABLE auth_sessions (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            last_seen_at TIMESTAMPTZ,
            CONSTRAINT auth_sessions_token_hash_unique UNIQUE (token_hash),
            CONSTRAINT auth_sessions_expiry_after_creation CHECK (expires_at > created_at)
        );

        CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id) WHERE revoked_at IS NULL;
        CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at);

        CREATE TABLE user_preferences (
            user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            interests TEXT[] NOT NULL,
            text_scale DOUBLE PRECISION NOT NULL,
            motion TEXT NOT NULL,
            sound BOOLEAN NOT NULL,
            challenge TEXT NOT NULL,
            reminders_enabled BOOLEAN NOT NULL,
            quiet_start TEXT NOT NULL,
            quiet_end TEXT NOT NULL,
            ai_tutor BOOLEAN NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT user_preferences_text_scale_range CHECK (text_scale >= 0.9 AND text_scale <= 1.4),
            CONSTRAINT user_preferences_motion_valid CHECK (motion IN ('system', 'reduce', 'full')),
            CONSTRAINT user_preferences_challenge_valid CHECK (challenge IN ('gentle', 'standard', 'stretch')),
            CONSTRAINT user_preferences_quiet_start_format CHECK (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
            CONSTRAINT user_preferences_quiet_end_format CHECK (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
            CONSTRAINT user_preferences_interests_present CHECK (cardinality(interests) >= 1)
        );

        CREATE TABLE user_progress (
            user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            experience INTEGER NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 1,
            streak_days INTEGER NOT NULL DEFAULT 0,
            longest_streak INTEGER NOT NULL DEFAULT 0,
            last_practice_on DATE,
            placement_skipped_skills TEXT[] NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT user_progress_experience_nonnegative CHECK (experience >= 0),
            CONSTRAINT user_progress_level_positive CHECK (level >= 1),
            CONSTRAINT user_progress_streak_nonnegative CHECK (streak_days >= 0),
            CONSTRAINT user_progress_longest_streak_nonnegative CHECK (longest_streak >= 0),
            CONSTRAINT user_progress_longest_at_least_current CHECK (longest_streak >= streak_days)
        );

        CREATE TABLE skill_mastery (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            skill_id TEXT NOT NULL,
            mastery_score DOUBLE PRECISION NOT NULL DEFAULT 0,
            evidence_count INTEGER NOT NULL DEFAULT 0,
            independent_successes INTEGER NOT NULL DEFAULT 0,
            assisted_successes INTEGER NOT NULL DEFAULT 0,
            recent_failures INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, skill_id),
            CONSTRAINT skill_mastery_score_range CHECK (mastery_score >= 0 AND mastery_score <= 1),
            CONSTRAINT skill_mastery_evidence_count_nonnegative CHECK (evidence_count >= 0),
            CONSTRAINT skill_mastery_independent_nonnegative CHECK (independent_successes >= 0),
            CONSTRAINT skill_mastery_assisted_nonnegative CHECK (assisted_successes >= 0),
            CONSTRAINT skill_mastery_failures_nonnegative CHECK (recent_failures >= 0)
        );

        CREATE INDEX skill_mastery_user_score_idx ON skill_mastery (user_id, mastery_score DESC);

        CREATE TABLE learning_evidence (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            id TEXT NOT NULL,
            mission_id TEXT NOT NULL,
            mission_version INTEGER NOT NULL,
            category TEXT NOT NULL,
            outcome TEXT NOT NULL,
            assistance TEXT NOT NULL,
            independence DOUBLE PRECISION NOT NULL,
            step_id TEXT,
            attempt_id TEXT,
            detail TEXT,
            created_at TIMESTAMPTZ NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, id),
            CONSTRAINT learning_evidence_id_length CHECK (char_length(id) BETWEEN 8 AND 80),
            CONSTRAINT learning_evidence_version_positive CHECK (mission_version >= 1),
            CONSTRAINT learning_evidence_category_valid CHECK (category IN ('prediction', 'construction', 'debugging', 'testing', 'explanation', 'transfer', 'review')),
            CONSTRAINT learning_evidence_outcome_valid CHECK (outcome IN ('success', 'failure')),
            CONSTRAINT learning_evidence_assistance_valid CHECK (assistance IN ('independent', 'hint-1', 'hint-2', 'hint-3', 'hint-4')),
            CONSTRAINT learning_evidence_independence_range CHECK (independence >= 0 AND independence <= 1),
            CONSTRAINT learning_evidence_detail_length CHECK (detail IS NULL OR char_length(detail) <= 600)
        );

        CREATE INDEX learning_evidence_user_time_idx ON learning_evidence (user_id, created_at DESC);
        CREATE INDEX learning_evidence_user_mission_idx ON learning_evidence (user_id, mission_id);

        CREATE TABLE evidence_skills (
            user_id UUID NOT NULL,
            evidence_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            weight DOUBLE PRECISION NOT NULL,
            PRIMARY KEY (user_id, evidence_id, skill_id),
            CONSTRAINT evidence_skills_evidence_fk FOREIGN KEY (user_id, evidence_id)
                REFERENCES learning_evidence (user_id, id) ON DELETE CASCADE,
            CONSTRAINT evidence_skills_weight_range CHECK (weight > 0 AND weight <= 1)
        );

        CREATE INDEX evidence_skills_user_skill_idx ON evidence_skills (user_id, skill_id);

        CREATE TABLE review_schedules (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            skill_id TEXT NOT NULL,
            interval_index INTEGER NOT NULL,
            due_at TIMESTAMPTZ NOT NULL,
            last_reviewed_at TIMESTAMPTZ,
            last_outcome TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, skill_id),
            CONSTRAINT review_schedules_interval_nonnegative CHECK (interval_index >= 0),
            CONSTRAINT review_schedules_outcome_valid CHECK (last_outcome IS NULL OR last_outcome IN ('success', 'failure'))
        );

        CREATE INDEX review_schedules_user_due_idx ON review_schedules (user_id, due_at);

        CREATE TABLE mission_attempts (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            mission_id TEXT NOT NULL,
            mission_version INTEGER NOT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            completed_at TIMESTAMPTZ,
            CONSTRAINT mission_attempts_version_positive CHECK (mission_version >= 1)
        );

        CREATE INDEX mission_attempts_user_time_idx ON mission_attempts (user_id, started_at DESC);

        CREATE TABLE mission_completions (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            mission_id TEXT NOT NULL,
            mission_version INTEGER NOT NULL,
            attempt_id TEXT NOT NULL,
            completed_at TIMESTAMPTZ NOT NULL,
            independent BOOLEAN NOT NULL,
            experience_awarded INTEGER NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, mission_id, mission_version),
            CONSTRAINT mission_completions_version_positive CHECK (mission_version >= 1),
            CONSTRAINT mission_completions_experience_nonnegative CHECK (experience_awarded >= 0)
        );

        CREATE INDEX mission_completions_user_time_idx ON mission_completions (user_id, completed_at DESC);

        CREATE TABLE worlds (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            id TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 0,
            state JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, id),
            CONSTRAINT worlds_version_nonnegative CHECK (version >= 0)
        );

        CREATE TABLE world_snapshots (
            user_id UUID NOT NULL,
            world_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            state JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, world_id, version),
            CONSTRAINT world_snapshots_world_fk FOREIGN KEY (user_id, world_id)
                REFERENCES worlds (user_id, id) ON DELETE CASCADE,
            CONSTRAINT world_snapshots_version_nonnegative CHECK (version >= 0)
        );

        CREATE TABLE world_actions (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL,
            world_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            action_id TEXT NOT NULL,
            system_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT world_actions_world_fk FOREIGN KEY (user_id, world_id)
                REFERENCES worlds (user_id, id) ON DELETE CASCADE,
            CONSTRAINT world_actions_version_unique UNIQUE (user_id, world_id, version),
            CONSTRAINT world_actions_version_positive CHECK (version >= 1)
        );

        CREATE TABLE projects (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id TEXT NOT NULL,
            current_revision INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, project_id),
            CONSTRAINT projects_current_revision_nonnegative CHECK (current_revision >= 0)
        );

        CREATE TABLE project_revisions (
            user_id UUID NOT NULL,
            project_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            message TEXT NOT NULL,
            files JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, project_id, revision),
            CONSTRAINT project_revisions_project_fk FOREIGN KEY (user_id, project_id)
                REFERENCES projects (user_id, project_id) ON DELETE CASCADE,
            CONSTRAINT project_revisions_revision_positive CHECK (revision >= 1),
            CONSTRAINT project_revisions_message_length CHECK (char_length(message) BETWEEN 1 AND 200)
        );

        CREATE TABLE clubs (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            invite_code TEXT NOT NULL,
            owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT clubs_name_length CHECK (char_length(name) BETWEEN 2 AND 60),
            CONSTRAINT clubs_invite_code_length CHECK (char_length(invite_code) BETWEEN 6 AND 24),
            CONSTRAINT clubs_invite_code_unique UNIQUE (invite_code)
        );

        CREATE INDEX clubs_owner_idx ON clubs (owner_id);

        CREATE TABLE club_memberships (
            club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (club_id, user_id),
            CONSTRAINT club_memberships_role_valid CHECK (role IN ('owner', 'member'))
        );

        CREATE UNIQUE INDEX club_memberships_single_owner ON club_memberships (club_id) WHERE role = 'owner';
        CREATE INDEX club_memberships_user_idx ON club_memberships (user_id);

        CREATE TABLE club_events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            week_of DATE NOT NULL,
            skill_ids TEXT[] NOT NULL,
            points INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT club_events_points_range CHECK (points BETWEEN 10 AND 1000),
            CONSTRAINT club_events_skills_present CHECK (cardinality(skill_ids) >= 1)
        );

        CREATE TABLE event_submissions (
            id UUID PRIMARY KEY,
            club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            event_id TEXT NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            answer TEXT NOT NULL,
            verified BOOLEAN NOT NULL DEFAULT false,
            points INTEGER NOT NULL DEFAULT 0,
            submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            verified_at TIMESTAMPTZ,
            CONSTRAINT event_submissions_unique UNIQUE (club_id, event_id, user_id),
            CONSTRAINT event_submissions_answer_length CHECK (char_length(answer) BETWEEN 1 AND 300),
            CONSTRAINT event_submissions_points_nonnegative CHECK (points >= 0),
            CONSTRAINT event_submissions_verified_points CHECK ((verified = false AND points = 0) OR verified = true)
        );

        CREATE INDEX event_submissions_club_verified_idx ON event_submissions (club_id, verified);
        CREATE INDEX event_submissions_user_idx ON event_submissions (user_id, submitted_at DESC);

        CREATE TABLE achievements (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            kind TEXT NOT NULL,
            rule TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE user_achievements (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
            earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, achievement_id)
        );

        CREATE INDEX user_achievements_user_idx ON user_achievements (user_id, earned_at DESC);

        CREATE TABLE sync_operations (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            operation_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            code TEXT,
            message TEXT,
            revision INTEGER,
            world_version INTEGER,
            result JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, operation_id),
            CONSTRAINT sync_operations_operation_id_length CHECK (char_length(operation_id) BETWEEN 8 AND 80),
            CONSTRAINT sync_operations_status_valid CHECK (status IN ('accepted', 'duplicate', 'conflict', 'rejected')),
            CONSTRAINT sync_operations_kind_valid CHECK (kind IN ('evidence', 'world-action', 'project-revision', 'mission-completion', 'preferences'))
        );

        CREATE INDEX sync_operations_user_time_idx ON sync_operations (user_id, created_at DESC);

        CREATE TABLE audit_events (
            id BIGSERIAL PRIMARY KEY,
            actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT,
            request_id TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
        CREATE INDEX audit_events_actor_idx ON audit_events (actor_user_id);

        CREATE TABLE club_reports (
            id UUID PRIMARY KEY,
            club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            resolved_at TIMESTAMPTZ,
            CONSTRAINT club_reports_reason_length CHECK (char_length(reason) BETWEEN 5 AND 500),
            CONSTRAINT club_reports_status_valid CHECK (status IN ('open', 'reviewed', 'dismissed'))
        );

        CREATE INDEX club_reports_status_time_idx ON club_reports (status, created_at DESC);
    `);
}

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
function down(pgm) {
    pgm.sql(`
        DROP TABLE IF EXISTS club_reports CASCADE;
        DROP TABLE IF EXISTS audit_events CASCADE;
        DROP TABLE IF EXISTS sync_operations CASCADE;
        DROP TABLE IF EXISTS user_achievements CASCADE;
        DROP TABLE IF EXISTS achievements CASCADE;
        DROP TABLE IF EXISTS event_submissions CASCADE;
        DROP TABLE IF EXISTS club_events CASCADE;
        DROP TABLE IF EXISTS club_memberships CASCADE;
        DROP TABLE IF EXISTS clubs CASCADE;
        DROP TABLE IF EXISTS project_revisions CASCADE;
        DROP TABLE IF EXISTS projects CASCADE;
        DROP TABLE IF EXISTS world_actions CASCADE;
        DROP TABLE IF EXISTS world_snapshots CASCADE;
        DROP TABLE IF EXISTS worlds CASCADE;
        DROP TABLE IF EXISTS mission_completions CASCADE;
        DROP TABLE IF EXISTS mission_attempts CASCADE;
        DROP TABLE IF EXISTS review_schedules CASCADE;
        DROP TABLE IF EXISTS evidence_skills CASCADE;
        DROP TABLE IF EXISTS learning_evidence CASCADE;
        DROP TABLE IF EXISTS skill_mastery CASCADE;
        DROP TABLE IF EXISTS user_progress CASCADE;
        DROP TABLE IF EXISTS user_preferences CASCADE;
        DROP TABLE IF EXISTS auth_sessions CASCADE;
        DROP TABLE IF EXISTS auth_identities CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
    `);
}

module.exports = { up, down };
