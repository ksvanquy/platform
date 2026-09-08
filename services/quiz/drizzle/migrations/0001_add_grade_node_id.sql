ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "grade_node_id" varchar(64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quizzes_grade_node" ON "quizzes" USING btree ("grade_node_id");
