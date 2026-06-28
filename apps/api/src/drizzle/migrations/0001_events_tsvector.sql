ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tsv" tsvector;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "events_tsv_idx" ON "events" USING gin ("tsv");--> statement-breakpoint

CREATE OR REPLACE FUNCTION events_tsv_update() RETURNS trigger AS $$
DECLARE
  body_text text;
BEGIN
  BEGIN
    body_text := convert_from(NEW.body, 'UTF8');
  EXCEPTION WHEN OTHERS THEN
    body_text := '';
  END;
  NEW.tsv :=
    setweight(to_tsvector('simple', coalesce(NEW.topic, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.dedup_key, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(left(body_text, 1000000), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS events_tsv_trigger ON "events";--> statement-breakpoint

CREATE TRIGGER events_tsv_trigger
BEFORE INSERT OR UPDATE OF body, topic, dedup_key ON "events"
FOR EACH ROW EXECUTE FUNCTION events_tsv_update();--> statement-breakpoint

UPDATE "events" SET tsv = tsv;
