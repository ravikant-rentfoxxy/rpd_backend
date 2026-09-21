-- CreateTable
CREATE TABLE "videos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "media_key" VARCHAR(512),
    "external_url" VARCHAR(1000),
    "thumbnail_key" VARCHAR(512),
    "published" BOOLEAN NOT NULL DEFAULT true,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blogs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "external_url" VARCHAR(1000),
    "thumbnail_key" VARCHAR(512),
    "published" BOOLEAN NOT NULL DEFAULT true,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "blogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "videos_published_created_at_idx" ON "videos"("published", "created_at");
CREATE INDEX "videos_author_id_created_at_idx" ON "videos"("author_id", "created_at");
CREATE INDEX "videos_deleted_at_idx" ON "videos"("deleted_at");
CREATE INDEX "blogs_published_created_at_idx" ON "blogs"("published", "created_at");
CREATE INDEX "blogs_author_id_created_at_idx" ON "blogs"("author_id", "created_at");
CREATE INDEX "blogs_deleted_at_idx" ON "blogs"("deleted_at");

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blogs" ADD CONSTRAINT "blogs_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
