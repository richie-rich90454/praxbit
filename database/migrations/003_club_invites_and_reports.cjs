/**
 * Multiple club owners, controlled expiring invitations, and structured reports.
 */

// @ts-check

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
function up(pgm) {
    pgm.sql(`
        DROP INDEX IF EXISTS club_memberships_single_owner;

        CREATE TABLE club_invites (
            id UUID PRIMARY KEY,
            club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            code TEXT NOT NULL,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            max_uses INTEGER NOT NULL,
            used_count INTEGER NOT NULL DEFAULT 0,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT club_invites_code_length CHECK (char_length(code) BETWEEN 6 AND 24),
            CONSTRAINT club_invites_max_uses_range CHECK (max_uses BETWEEN 1 AND 100),
            CONSTRAINT club_invites_used_count_range CHECK (used_count >= 0 AND used_count <= max_uses),
            CONSTRAINT club_invites_expiry_after_creation CHECK (expires_at > created_at)
        );

        CREATE UNIQUE INDEX club_invites_code_unique ON club_invites (upper(code));
        CREATE INDEX club_invites_club_time_idx ON club_invites (club_id, created_at DESC);

        ALTER TABLE club_reports ADD COLUMN target_type TEXT NOT NULL DEFAULT 'club';
        ALTER TABLE club_reports ADD COLUMN target_handle TEXT;
        ALTER TABLE club_reports ADD COLUMN target_event_id TEXT;
        ALTER TABLE club_reports ADD COLUMN details TEXT;

        ALTER TABLE club_reports ADD CONSTRAINT club_reports_target_type_valid CHECK (
            target_type IN ('club', 'member', 'event')
        );
        ALTER TABLE club_reports ADD CONSTRAINT club_reports_details_length CHECK (
            details IS NULL OR char_length(details) BETWEEN 5 AND 1000
        );
    `);
}

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
function down(pgm) {
    pgm.sql(`
        ALTER TABLE club_reports DROP CONSTRAINT IF EXISTS club_reports_details_length;
        ALTER TABLE club_reports DROP CONSTRAINT IF EXISTS club_reports_target_type_valid;
        ALTER TABLE club_reports DROP COLUMN IF EXISTS details;
        ALTER TABLE club_reports DROP COLUMN IF EXISTS target_event_id;
        ALTER TABLE club_reports DROP COLUMN IF EXISTS target_handle;
        ALTER TABLE club_reports DROP COLUMN IF EXISTS target_type;

        DROP TABLE IF EXISTS club_invites CASCADE;

        CREATE UNIQUE INDEX club_memberships_single_owner ON club_memberships (club_id) WHERE role = 'owner';
    `);
}

module.exports = { up, down };
