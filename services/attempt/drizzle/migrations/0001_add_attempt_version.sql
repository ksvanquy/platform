-- Migration 0001: Add OCC version column, backfill existing records, and create composite index
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE attempts SET version = 1 WHERE version IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_attempts_id_version_status ON attempts(id, version, status);
