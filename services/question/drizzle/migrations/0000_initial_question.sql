CREATE TABLE "questions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"type" varchar(32) NOT NULL,
	"topic_node_id" varchar(64),
	"grade_node_id" varchar(64),
	"difficulty" varchar(32) DEFAULT 'REMEMBER' NOT NULL,
	"default_points" integer DEFAULT 1 NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"current_revision_id" varchar(64),
	"owner_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "question_revisions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"question_id" varchar(64) NOT NULL,
	"revision_number" integer NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb NOT NULL,
	"pairs" jsonb,
	"explanation" text,
	"rubric" jsonb,
	"media_assets" jsonb,
	"created_by" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_questions_topic" ON "questions" USING btree ("topic_node_id");--> statement-breakpoint
CREATE INDEX "idx_questions_grade" ON "questions" USING btree ("grade_node_id");--> statement-breakpoint
CREATE INDEX "idx_questions_difficulty" ON "questions" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "idx_questions_status" ON "questions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_questions_owner" ON "questions" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_question_revision" ON "question_revisions" USING btree ("question_id","revision_number");--> statement-breakpoint
CREATE INDEX "idx_qrev_question" ON "question_revisions" USING btree ("question_id");
