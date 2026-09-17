-- Existing events had no duration; give them 2 hours.
ALTER TABLE "org_events" ADD COLUMN "ends_at" TIMESTAMPTZ(6);
UPDATE "org_events" SET "ends_at" = "starts_at" + INTERVAL '2 hours';
ALTER TABLE "org_events" ALTER COLUMN "ends_at" SET NOT NULL;
