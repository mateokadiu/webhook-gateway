CREATE TABLE IF NOT EXISTS "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"status" text NOT NULL,
	"last_status_code" integer,
	"last_response_excerpt" text,
	"last_attempt_at" timestamp with time zone,
	"total_duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "deliveries_status_check" CHECK ("deliveries"."status" in ('pending','retrying','ok','failed','dead'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"topic" text,
	"dedup_key" text NOT NULL,
	"body" "bytea" NOT NULL,
	"body_hash" text NOT NULL,
	"headers" jsonb NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" text NOT NULL,
	"fan_out" integer DEFAULT 0 NOT NULL,
	"fan_out_ok" integer DEFAULT 0 NOT NULL,
	"fan_out_failed" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "events_source_dedup_unique" UNIQUE("source_id","dedup_key"),
	CONSTRAINT "events_status_check" CHECK ("events"."status" in ('queued','processing','ok','partial','failed','tombstoned'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_stats_daily" (
	"source_id" uuid NOT NULL,
	"date" date NOT NULL,
	"events_received" integer DEFAULT 0 NOT NULL,
	"events_ok" integer DEFAULT 0 NOT NULL,
	"events_failed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "source_stats_daily_source_id_date_pk" PRIMARY KEY("source_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"plugin_id" text NOT NULL,
	"signing_secret" text NOT NULL,
	"signature_tolerance_sec" integer DEFAULT 300 NOT NULL,
	"plugin_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"signing_secret" text,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"max_attempts" integer DEFAULT 6 NOT NULL,
	"backoff_schedule" integer[] DEFAULT ARRAY[30,120,600,3600,21600,86400]::integer[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "source_stats_daily" ADD CONSTRAINT "source_stats_daily_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_event_idx" ON "deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_status_idx" ON "deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_received_idx" ON "events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_source_status_idx" ON "events" USING btree ("source_id","status","received_at");