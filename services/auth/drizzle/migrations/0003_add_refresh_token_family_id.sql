ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_id_idx" ON "refresh_tokens" ("family_id");
