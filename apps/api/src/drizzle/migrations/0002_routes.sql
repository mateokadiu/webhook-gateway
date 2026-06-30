CREATE TABLE IF NOT EXISTS "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"transform" text,
	"signing_format" text DEFAULT 'wg' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routes_source_target_unique" UNIQUE("source_id","target_id"),
	CONSTRAINT "routes_signing_format_check" CHECK ("routes"."signing_format" in ('wg','stripe'))
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "routes" ADD CONSTRAINT "routes_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "routes" ADD CONSTRAINT "routes_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "routes_source_idx" ON "routes" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routes_target_idx" ON "routes" USING btree ("target_id");--> statement-breakpoint

-- Backfill: for every existing source.target_ids entry, create a default route.
INSERT INTO "routes" ("source_id", "target_id")
SELECT s.id, t_id
FROM "sources" s,
     unnest(s.target_ids) AS t_id
WHERE EXISTS (SELECT 1 FROM "targets" t WHERE t.id = t_id)
ON CONFLICT ON CONSTRAINT "routes_source_target_unique" DO NOTHING;
