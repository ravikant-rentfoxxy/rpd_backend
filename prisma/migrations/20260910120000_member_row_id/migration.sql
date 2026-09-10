CREATE SEQUENCE "members_row_id_seq";

ALTER TABLE "members" ADD COLUMN "row_id" INTEGER;

UPDATE "members" AS m
SET "row_id" = s.n
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC) AS n
  FROM "members"
) AS s
WHERE m."id" = s.id;

SELECT setval(
  'members_row_id_seq',
  COALESCE((SELECT MAX("row_id") FROM "members"), 1),
  (SELECT COUNT(*) > 0 FROM "members")
);

ALTER TABLE "members" ALTER COLUMN "row_id" SET DEFAULT nextval('members_row_id_seq');
ALTER TABLE "members" ALTER COLUMN "row_id" SET NOT NULL;
ALTER SEQUENCE "members_row_id_seq" OWNED BY "members"."row_id";

CREATE UNIQUE INDEX "members_row_id_key" ON "members"("row_id");

UPDATE "members" SET "membership_number" = NULL;
UPDATE "members" SET "membership_number" = 'RPD-' || "row_id"::text;

UPDATE "membership_cards" SET "public_code" = 't' || substring(replace("id"::text, '-', '') from 1 for 30);
UPDATE "membership_cards" AS c
SET "public_code" = m."membership_number"
FROM "members" AS m
WHERE c."member_id" = m."id" AND m."membership_number" IS NOT NULL;
