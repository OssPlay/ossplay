ALTER TABLE "projects" DROP CONSTRAINT "projects_destination_id_s3_destinations_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_destination_id_s3_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."s3_destinations"("id") ON DELETE set null ON UPDATE no action;