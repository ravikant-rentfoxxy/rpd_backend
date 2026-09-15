-- CreateEnum
CREATE TYPE "RegionPostStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "region_posts" ADD COLUMN "status" "RegionPostStatus" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "region_posts" ADD COLUMN "resolved_at" TIMESTAMPTZ(6);
ALTER TABLE "region_posts" ADD COLUMN "resolved_by_id" UUID;

-- CreateIndex
CREATE INDEX "region_posts_status_created_at_idx" ON "region_posts"("status", "created_at");

-- AddForeignKey
ALTER TABLE "region_posts" ADD CONSTRAINT "region_posts_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
