CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "assets_filename_trgm_idx" ON "assets" USING gin ("filename" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "folders_name_trgm_idx" ON "folders" USING gin ("name" gin_trgm_ops);