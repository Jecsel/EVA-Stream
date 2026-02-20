ALTER TABLE "recordings" ADD COLUMN "original_video_url" text;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "storage_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "stored_video_path" text;