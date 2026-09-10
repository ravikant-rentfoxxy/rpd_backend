ALTER TABLE "members" ADD COLUMN "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "members"
SET "is_super_admin" = true, "status" = 'VERIFIED'
WHERE "deleted_at" IS NULL
  AND (
    lower("full_name") LIKE '%super admin%'
    OR lower(replace("full_name", ' ', '')) LIKE '%superadmin%'
    OR lower("full_name") = 'admin'
  );
