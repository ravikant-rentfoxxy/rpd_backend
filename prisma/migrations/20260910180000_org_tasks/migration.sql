-- CreateTable
CREATE TABLE "org_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "host_id" UUID NOT NULL,
    "host_post" VARCHAR(40) NOT NULL,
    "host_rank" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "state_id" UUID,
    "district_id" UUID,
    "assembly_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "org_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_tasks_host_id_idx" ON "org_tasks"("host_id");

-- CreateIndex
CREATE INDEX "org_tasks_created_at_idx" ON "org_tasks"("created_at");

-- CreateIndex
CREATE INDEX "org_tasks_state_id_district_id_assembly_id_idx" ON "org_tasks"("state_id", "district_id", "assembly_id");

-- AddForeignKey
ALTER TABLE "org_tasks" ADD CONSTRAINT "org_tasks_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
