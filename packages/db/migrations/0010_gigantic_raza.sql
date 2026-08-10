ALTER TABLE "s3_destinations" ADD COLUMN "config_status" text DEFAULT 'unconfigured' NOT NULL;--> statement-breakpoint
ALTER TABLE "s3_destinations" ADD COLUMN "configured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "s3_destinations" ADD COLUMN "config_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "s3_destinations" ADD COLUMN "config_error" text;