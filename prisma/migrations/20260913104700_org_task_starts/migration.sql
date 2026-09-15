-- CreateTable
CREATE TABLE "org_task_starts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_task_starts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_task_starts_task_id_member_id_key" ON "org_task_starts"("task_id", "member_id");
CREATE INDEX "org_task_starts_member_id_idx" ON "org_task_starts"("member_id");

-- AddForeignKey
ALTER TABLE "org_task_starts" ADD CONSTRAINT "org_task_starts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "org_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_task_starts" ADD CONSTRAINT "org_task_starts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
