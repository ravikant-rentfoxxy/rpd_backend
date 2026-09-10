-- Unused member fields: join/recruit never collect these.

ALTER TABLE "members" DROP COLUMN IF EXISTS "father_or_husband_name";
ALTER TABLE "members" DROP COLUMN IF EXISTS "referred_by_name";
