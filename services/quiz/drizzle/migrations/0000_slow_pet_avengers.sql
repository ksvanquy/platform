CREATE TABLE "attempts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"quiz_id" varchar(64) NOT NULL,
	"quiz_version_id" varchar(64) NOT NULL,
	"tenant_id" varchar(64) DEFAULT 'tenant_default' NOT NULL,
	"status" varchar(32) DEFAULT 'CREATED' NOT NULL,
	"started_at" timestamp with time zone,
	"deadline" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"manifest" jsonb,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_versions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"quiz_id" varchar(64) NOT NULL,
	"version_number" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"passing_score" numeric(6, 2) NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scoring_policy" jsonb NOT NULL,
	"randomization_policy" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"owner_id" varchar(64) NOT NULL,
	"tenant_id" varchar(64) DEFAULT 'tenant_default' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"current_published_version_id" varchar(64),
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_quiz_version_id_quiz_versions_id_fk" FOREIGN KEY ("quiz_version_id") REFERENCES "public"."quiz_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_versions" ADD CONSTRAINT "quiz_versions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attempts_user" ON "attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_user_quiz" ON "attempts" USING btree ("user_id","quiz_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_tenant" ON "attempts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_sweeper" ON "attempts" USING btree ("status","deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quiz_version" ON "quiz_versions" USING btree ("quiz_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_quiz_versions_quiz_id" ON "quiz_versions" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "idx_quizzes_code" ON "quizzes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_quizzes_owner" ON "quizzes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_quizzes_tenant" ON "quizzes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_quizzes_status" ON "quizzes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_quizzes_owner_tenant" ON "quizzes" USING btree ("owner_id","tenant_id");