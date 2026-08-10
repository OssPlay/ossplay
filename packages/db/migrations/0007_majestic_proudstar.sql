CREATE TABLE "asset_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "destination_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_activity" ADD CONSTRAINT "asset_activity_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_activity" ADD CONSTRAINT "asset_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_activity_asset_id_idx" ON "asset_activity" USING btree ("asset_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "folders_project_id_idx" ON "folders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "folders_parent_id_idx" ON "folders" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_parent_name_unique" ON "folders" USING btree ("project_id","parent_id","name") WHERE deleted_at is null;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_closure" ADD CONSTRAINT "folder_closure_ancestor_id_folders_id_fk" FOREIGN KEY ("ancestor_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_closure" ADD CONSTRAINT "folder_closure_descendant_id_folders_id_fk" FOREIGN KEY ("descendant_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;