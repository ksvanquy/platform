CREATE TABLE "taxonomies" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"is_hierarchical" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "taxonomy_nodes" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"taxonomy_id" varchar(64) NOT NULL,
	"parent_id" varchar(64),
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'PUBLISHED' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_taxonomy_id_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_taxonomies_code" ON "taxonomies" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_nodes_taxonomy" ON "taxonomy_nodes" USING btree ("taxonomy_id");--> statement-breakpoint
CREATE INDEX "idx_nodes_parent" ON "taxonomy_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_nodes_sort" ON "taxonomy_nodes" USING btree ("taxonomy_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_nodes_active_slug" ON "taxonomy_nodes" USING btree ("taxonomy_id","slug") WHERE "taxonomy_nodes"."deleted_at" IS NULL;