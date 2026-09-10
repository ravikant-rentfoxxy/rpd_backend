-- Org hierarchy: NATIONAL → STATE → REGION → DISTRICT → ASSEMBLY → MANDAL

ALTER TYPE "PostType" ADD VALUE IF NOT EXISTS 'NATIONAL_PRESIDENT';
ALTER TYPE "PostType" ADD VALUE IF NOT EXISTS 'NATIONAL_GENERAL_SECRETARY';
ALTER TYPE "PostType" ADD VALUE IF NOT EXISTS 'STATE_PRESIDENT';
ALTER TYPE "PostType" ADD VALUE IF NOT EXISTS 'STATE_GENERAL_SECRETARY';
ALTER TYPE "PostType" ADD VALUE IF NOT EXISTS 'REGIONAL_PRESIDENT';
ALTER TYPE "PostType" ADD VALUE IF NOT EXISTS 'DISTRICT_GENERAL_SECRETARY';
ALTER TYPE "PostType" ADD VALUE IF NOT EXISTS 'ASSEMBLY_IN_CHARGE';

CREATE TYPE "OrgLevelCode" AS ENUM ('NATIONAL', 'STATE', 'REGION', 'DISTRICT', 'ASSEMBLY', 'MANDAL');

CREATE TABLE "org_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" "OrgLevelCode" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_hi" VARCHAR(80),
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "org_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_levels_code_key" ON "org_levels"("code");

CREATE TABLE "org_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "level_id" UUID NOT NULL,
    "post" "PostType" NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "title_hi" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "org_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_posts_post_key" ON "org_posts"("post");
CREATE INDEX "org_posts_level_id_idx" ON "org_posts"("level_id");

ALTER TABLE "org_posts" ADD CONSTRAINT "org_posts_level_id_fkey"
  FOREIGN KEY ("level_id") REFERENCES "org_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "regions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "state_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_hi" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "regions_state_id_code_key" ON "regions"("state_id", "code");
CREATE INDEX "regions_state_id_idx" ON "regions"("state_id");

ALTER TABLE "regions" ADD CONSTRAINT "regions_state_id_fkey"
  FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "districts" ADD COLUMN "region_id" UUID;
CREATE INDEX "districts_region_id_idx" ON "districts"("region_id");
ALTER TABLE "districts" ADD CONSTRAINT "districts_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assembly_constituencies" ADD COLUMN "state_id" UUID;
UPDATE "assembly_constituencies" AS ac
SET "state_id" = d."state_id"
FROM "districts" AS d
WHERE ac."district_id" = d."id";
ALTER TABLE "assembly_constituencies" ALTER COLUMN "state_id" SET NOT NULL;
CREATE INDEX "assembly_constituencies_state_id_idx" ON "assembly_constituencies"("state_id");
ALTER TABLE "assembly_constituencies" ADD CONSTRAINT "assembly_constituencies_state_id_fkey"
  FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "members" ADD COLUMN "state_id" UUID;
ALTER TABLE "members" ADD COLUMN "region_id" UUID;
UPDATE "members" AS m
SET "state_id" = d."state_id"
FROM "districts" AS d
WHERE m."district_id" = d."id";
CREATE INDEX "members_assembly_id_idx" ON "members"("assembly_id");
CREATE INDEX "members_region_id_idx" ON "members"("region_id");
CREATE INDEX "members_state_id_idx" ON "members"("state_id");
ALTER TABLE "members" ADD CONSTRAINT "members_state_id_fkey"
  FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "members" ADD CONSTRAINT "members_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "member_posts" ADD COLUMN "assembly_id" UUID;
ALTER TABLE "member_posts" ADD COLUMN "region_id" UUID;
ALTER TABLE "member_posts" ADD COLUMN "state_id" UUID;
CREATE INDEX "member_posts_assembly_id_idx" ON "member_posts"("assembly_id");
CREATE INDEX "member_posts_state_id_idx" ON "member_posts"("state_id");
CREATE INDEX "member_posts_region_id_idx" ON "member_posts"("region_id");
ALTER TABLE "member_posts" ADD CONSTRAINT "member_posts_assembly_id_fkey"
  FOREIGN KEY ("assembly_id") REFERENCES "assembly_constituencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member_posts" ADD CONSTRAINT "member_posts_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member_posts" ADD CONSTRAINT "member_posts_state_id_fkey"
  FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;
