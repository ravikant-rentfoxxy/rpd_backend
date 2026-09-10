UPDATE "members" AS m
SET "membership_number" = 'RPD-' || upper(s."code") || '-' || m."row_id"::text
FROM "states" AS s
WHERE m."state_id" = s."id"
  AND m."row_id" IS NOT NULL
  AND s."code" IS NOT NULL
  AND s."code" <> '';

UPDATE "membership_cards" AS c
SET "public_code" = m."membership_number"
FROM "members" AS m
WHERE c."member_id" = m."id"
  AND m."membership_number" IS NOT NULL;
