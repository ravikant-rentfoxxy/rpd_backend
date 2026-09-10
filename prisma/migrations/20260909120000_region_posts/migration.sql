-- CreateEnum
CREATE TYPE "RegionPostMedia" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO');

-- CreateTable
CREATE TABLE "region_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_uuid" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "media_type" "RegionPostMedia" NOT NULL,
    "media_key" VARCHAR(512) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "district_id" UUID,
    "assembly_id" UUID,
    "booth_id" UUID,
    "region_label" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "region_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "region_posts_client_uuid_key" ON "region_posts"("client_uuid");
CREATE INDEX "region_posts_author_id_created_at_idx" ON "region_posts"("author_id", "created_at");
CREATE INDEX "region_posts_district_id_created_at_idx" ON "region_posts"("district_id", "created_at");
CREATE INDEX "region_posts_assembly_id_created_at_idx" ON "region_posts"("assembly_id", "created_at");

-- AddForeignKey
ALTER TABLE "region_posts" ADD CONSTRAINT "region_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
