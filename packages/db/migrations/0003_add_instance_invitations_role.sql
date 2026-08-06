ALTER TABLE "instance_invitations" ADD COLUMN "instance_role" text;--> statement-breakpoint
-- Backfill from the boolean this column replaces, before it's dropped in
-- the next migration.
UPDATE "instance_invitations" SET "instance_role" = 'root' WHERE "grant_root" = true;