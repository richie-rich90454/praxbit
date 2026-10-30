/**
 * Allow the client to merge guest progress (placement, streaks, achievements)
 * into an account after registration or sign-in.
 */

// @ts-check

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
function up(pgm) {
    pgm.sql(`
        ALTER TABLE sync_operations DROP CONSTRAINT sync_operations_kind_valid;
        ALTER TABLE sync_operations ADD CONSTRAINT sync_operations_kind_valid CHECK (
            kind IN (
                'evidence',
                'world-action',
                'project-revision',
                'mission-completion',
                'preferences',
                'progress'
            )
        );
    `);
}

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
function down(pgm) {
    pgm.sql(`
        DELETE FROM sync_operations WHERE kind = 'progress';
        ALTER TABLE sync_operations DROP CONSTRAINT sync_operations_kind_valid;
        ALTER TABLE sync_operations ADD CONSTRAINT sync_operations_kind_valid CHECK (
            kind IN (
                'evidence',
                'world-action',
                'project-revision',
                'mission-completion',
                'preferences'
            )
        );
    `);
}

module.exports = { up, down };
