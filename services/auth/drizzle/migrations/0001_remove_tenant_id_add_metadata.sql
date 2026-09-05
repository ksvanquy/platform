-- Safe 3-Step Migration: Add metadata JSONB, migrate tenant_id, drop index and tenant_id column
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "users" 
SET "metadata" = jsonb_build_object('defaultTenantId', "tenant_id")
WHERE "tenant_id" IS NOT NULL AND ("metadata" = '{}'::jsonb OR "metadata" IS NULL);
--> statement-breakpoint
DROP INDEX IF EXISTS "users_tenant_id_idx";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "tenant_id";
