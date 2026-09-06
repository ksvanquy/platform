ALTER TABLE "quizzes" ADD COLUMN "primary_node_id" varchar(64);--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_quizzes_primary_node" ON "quizzes" USING btree ("primary_node_id");