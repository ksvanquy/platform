CREATE TABLE "assessments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"owner_id" varchar(64) NOT NULL,
	"primary_topic_node_id" varchar(64),
	"grade_node_id" varchar(64),
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"current_blueprint_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "blueprints" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"assessment_id" varchar(64) NOT NULL,
	"version_number" integer NOT NULL,
	"duration_minutes" integer DEFAULT 45 NOT NULL,
	"passing_percentage" integer DEFAULT 50 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scoring_policy" jsonb DEFAULT '{"strategyType":"STANDARD","roundingDecimal":2}'::jsonb NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assessments_topic" ON "assessments" USING btree ("primary_topic_node_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_grade" ON "assessments" USING btree ("grade_node_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_status" ON "assessments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_assessments_owner" ON "assessments" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assessment_blueprint" ON "blueprints" USING btree ("assessment_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_bp_assessment" ON "blueprints" USING btree ("assessment_id");
