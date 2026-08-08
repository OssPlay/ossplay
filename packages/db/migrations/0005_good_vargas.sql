CREATE TABLE "system_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "s3_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"label" text NOT NULL,
	"endpoint" text NOT NULL,
	"region" text NOT NULL,
	"bucket" text NOT NULL,
	"access_key_id" text NOT NULL,
	"secret_access_key_encrypted" text NOT NULL,
	"visibility" text NOT NULL,
	"cloudfront_url" text,
	"status" text DEFAULT 'untested' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid
);
--> statement-breakpoint
-- The existing FK ties assets.project_id (uuid) to projects.id (uuid);
-- Postgres refuses to retype either side while a cross-type FK would result,
-- so drop it first and recreate it (same ON DELETE cascade as the schema)
-- once both sides are text.
ALTER TABLE "assets" DROP CONSTRAINT "assets_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "project_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_invitations" ADD COLUMN "token" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "instance_invitations" ALTER COLUMN "token" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "token" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "token" DROP DEFAULT;--> statement-breakpoint
-- visibility/destination_id are added nullable first and backfilled below,
-- then locked to NOT NULL — a plain `ADD COLUMN ... NOT NULL` with no
-- default would fail outright on any instance that already has project
-- rows (this dev DB included). A fresh install has zero rows, so the
-- backfill block below is a no-op there.
ALTER TABLE "projects" ADD COLUMN "visibility" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "destination_id" uuid;--> statement-breakpoint
ALTER TABLE "s3_destinations" ADD CONSTRAINT "s3_destinations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "s3_destinations" ADD CONSTRAINT "s3_destinations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "system_logs_created_at_idx" ON "system_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "s3_destinations_org_id_idx" ON "s3_destinations" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_destination_id_s3_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."s3_destinations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Backfill: one obviously-placeholder, untested s3 destination per org that
-- already has projects, then point those projects at it as 'private'. This
-- is a one-time dev/upgrade safety net, not a real storage config — root
-- must replace it with a real destination via Organization -> S3
-- Destinations (the Storage card on each project's settings page can then
-- point it elsewhere). No-op when `projects` is empty.
INSERT INTO "s3_destinations" ("org_id", "label", "endpoint", "region", "bucket", "access_key_id", "secret_access_key_encrypted", "visibility")
SELECT DISTINCT "org_id", 'Migrated placeholder — replace me', 'https://example-placeholder.invalid', 'us-east-1', 'unconfigured', 'unconfigured', 'unconfigured', 'private'
FROM "projects";
--> statement-breakpoint
UPDATE "projects" SET "visibility" = 'private' WHERE "visibility" IS NULL;--> statement-breakpoint
UPDATE "projects" p SET "destination_id" = d."id"
FROM "s3_destinations" d
WHERE d."org_id" = p."org_id" AND d."label" = 'Migrated placeholder — replace me' AND p."destination_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "visibility" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "destination_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "s3_config";
