ALTER TABLE "org_events" ADD COLUMN "latitude" DECIMAL(9,6),
ADD COLUMN "longitude" DECIMAL(9,6);

ALTER TABLE "org_event_joins" ADD COLUMN "checked_in_at" TIMESTAMPTZ(6),
ADD COLUMN "check_in_latitude" DECIMAL(9,6),
ADD COLUMN "check_in_longitude" DECIMAL(9,6),
ADD COLUMN "check_in_metres" INTEGER;
