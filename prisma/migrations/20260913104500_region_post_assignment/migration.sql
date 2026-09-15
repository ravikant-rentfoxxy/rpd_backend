-- AlterTable
ALTER TABLE "region_posts" ADD COLUMN "assigned_to_id" UUID;
ALTER TABLE "region_posts" ADD COLUMN "assigned_by_id" UUID;
ALTER TABLE "region_posts" ADD COLUMN "assigned_at" TIMESTAMPTZ(6);
ALTER TABLE "region_posts" ADD COLUMN "assignee_post" VARCHAR(40);

-- CreateIndex
CREATE INDEX "region_posts_assigned_to_id_assigned_at_idx" ON "region_posts"("assigned_to_id", "assigned_at");

-- AddForeignKey
ALTER TABLE "region_posts" ADD CONSTRAINT "region_posts_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "region_posts" ADD CONSTRAINT "region_posts_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
