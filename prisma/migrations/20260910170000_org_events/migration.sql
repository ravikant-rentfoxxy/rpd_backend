-- CreateTable
CREATE TABLE "org_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "host_id" UUID NOT NULL,
    "host_post" VARCHAR(40) NOT NULL,
    "host_rank" INTEGER NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "venue" VARCHAR(200) NOT NULL,
    "image_url" VARCHAR(512),
    "state_id" UUID,
    "district_id" UUID,
    "assembly_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "org_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_event_joins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_event_joins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_events_starts_at_idx" ON "org_events"("starts_at");

-- CreateIndex
CREATE INDEX "org_events_host_id_idx" ON "org_events"("host_id");

-- CreateIndex
CREATE INDEX "org_events_host_rank_idx" ON "org_events"("host_rank");

-- CreateIndex
CREATE INDEX "org_events_state_id_district_id_assembly_id_idx" ON "org_events"("state_id", "district_id", "assembly_id");

-- CreateIndex
CREATE INDEX "org_events_type_idx" ON "org_events"("type");

-- CreateIndex
CREATE INDEX "org_event_joins_member_id_idx" ON "org_event_joins"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_event_joins_event_id_member_id_key" ON "org_event_joins"("event_id", "member_id");

-- AddForeignKey
ALTER TABLE "org_events" ADD CONSTRAINT "org_events_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_event_joins" ADD CONSTRAINT "org_event_joins_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "org_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_event_joins" ADD CONSTRAINT "org_event_joins_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
