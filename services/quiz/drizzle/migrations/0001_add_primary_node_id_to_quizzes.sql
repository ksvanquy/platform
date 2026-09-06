ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "primary_node_id" varchar(64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quizzes_primary_node" ON "quizzes" USING btree ("primary_node_id");
