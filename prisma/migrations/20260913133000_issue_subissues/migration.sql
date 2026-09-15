ALTER TABLE "post_issues" DROP CONSTRAINT IF EXISTS "post_issues_priority_key";

ALTER TABLE "post_issues" ALTER COLUMN "name" TYPE VARCHAR(160);
ALTER TABLE "post_issues" ALTER COLUMN "name_hi" TYPE VARCHAR(160);
ALTER TABLE "post_issues" ALTER COLUMN "name_bho" TYPE VARCHAR(160);
ALTER TABLE "post_issues" ALTER COLUMN "reason" TYPE VARCHAR(400);

ALTER TABLE "post_issues" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "post_issues" ADD COLUMN IF NOT EXISTS "parent_id" UUID;

ALTER TABLE "region_posts" ADD COLUMN IF NOT EXISTS "sub_issue_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'post_issues_parent_id_fkey'
  ) THEN
    ALTER TABLE "post_issues"
      ADD CONSTRAINT "post_issues_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "post_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "post_issues_priority_sort_order_idx" ON "post_issues"("priority", "sort_order");
CREATE INDEX IF NOT EXISTS "post_issues_parent_id_sort_order_idx" ON "post_issues"("parent_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'region_posts_sub_issue_id_fkey'
  ) THEN
    ALTER TABLE "region_posts"
      ADD CONSTRAINT "region_posts_sub_issue_id_fkey"
      FOREIGN KEY ("sub_issue_id") REFERENCES "post_issues"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "region_posts_sub_issue_id_created_at_idx" ON "region_posts"("sub_issue_id", "created_at");
