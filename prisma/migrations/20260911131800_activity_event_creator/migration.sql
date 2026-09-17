-- AlterTable
ALTER TABLE "activity_events" ADD COLUMN "created_by_id" UUID;

UPDATE "activity_events"
SET "created_by_id" = (
  SELECT "id" FROM "members" WHERE "is_super_admin" = true ORDER BY "created_at" ASC LIMIT 1
)
WHERE "created_by_id" IS NULL;

UPDATE "activity_events"
SET "created_by_id" = (SELECT "id" FROM "members" ORDER BY "created_at" ASC LIMIT 1)
WHERE "created_by_id" IS NULL;

-- A fresh database has no members to attribute the seeded sample event to, so drop it.
DELETE FROM "activity_event_responses"
WHERE "event_id" IN (SELECT "id" FROM "activity_events" WHERE "created_by_id" IS NULL);

DELETE FROM "activity_event_options"
WHERE "event_id" IN (SELECT "id" FROM "activity_events" WHERE "created_by_id" IS NULL);

DELETE FROM "activity_events" WHERE "created_by_id" IS NULL;

ALTER TABLE "activity_events" ALTER COLUMN "created_by_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "activity_events_created_by_id_idx" ON "activity_events"("created_by_id");
