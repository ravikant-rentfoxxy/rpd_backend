ALTER TABLE "meetings" ADD COLUMN "code" VARCHAR(16);
ALTER TABLE "meetings" ADD COLUMN "latitude" DECIMAL(9,6);
ALTER TABLE "meetings" ADD COLUMN "longitude" DECIMAL(9,6);
ALTER TABLE "meetings" ALTER COLUMN "booth_id" DROP NOT NULL;

UPDATE "meetings"
SET "code" = 'MTG-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 6))
WHERE "code" IS NULL;

ALTER TABLE "meetings" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "meetings_code_key" ON "meetings"("code");
