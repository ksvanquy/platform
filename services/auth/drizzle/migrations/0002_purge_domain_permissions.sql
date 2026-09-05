-- Purge legacy domain-specific permissions from Auth Service SoT
DELETE FROM "role_permissions" WHERE "permission_id" IN (
  SELECT "id" FROM "permissions" WHERE "code" LIKE 'quiz:%' OR "code" LIKE 'attempt:%'
);
--> statement-breakpoint
DELETE FROM "permissions" WHERE "code" LIKE 'quiz:%' OR "code" LIKE 'attempt:%';
