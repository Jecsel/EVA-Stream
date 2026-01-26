CREATE TABLE "clarifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"question" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"answer" text,
	"answered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observation_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" varchar,
	"title" text NOT NULL,
	"phase" text DEFAULT 'observe' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"type" text NOT NULL,
	"app" text,
	"page" text,
	"action" text,
	"from_value" text,
	"to_value" text,
	"reason" text,
	"content" text NOT NULL,
	"is_repeated" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sop_id" varchar NOT NULL,
	"version" text NOT NULL,
	"change_log" text NOT NULL,
	"full_content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sops" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar,
	"meeting_id" varchar,
	"title" text NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"goal" text,
	"when_to_use" text,
	"who_performs" text,
	"tools_required" text[],
	"main_flow" jsonb,
	"decision_points" jsonb,
	"exceptions" jsonb,
	"quality_check" text,
	"low_confidence_sections" text[],
	"assumptions" text[],
	"mermaid_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "event_type" text DEFAULT 'event' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "is_all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "recurrence" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "recurrence_end_date" timestamp;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "flowchart_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_access_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_email" text;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_session_id_observation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."observation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_sessions" ADD CONSTRAINT "observation_sessions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_session_id_observation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."observation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_versions" ADD CONSTRAINT "sop_versions_sop_id_sops_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."sops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_session_id_observation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."observation_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;