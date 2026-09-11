-- CreateTable
CREATE TABLE "activity_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_event_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_event_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_event_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activity_event_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_events_published_deleted_at_starts_at_ends_at_idx" ON "activity_events"("published", "deleted_at", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "activity_event_options_event_id_sort_order_idx" ON "activity_event_options"("event_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "activity_event_responses_event_id_member_id_key" ON "activity_event_responses"("event_id", "member_id");

-- CreateIndex
CREATE INDEX "activity_event_responses_member_id_idx" ON "activity_event_responses"("member_id");

-- CreateIndex
CREATE INDEX "activity_event_responses_option_id_idx" ON "activity_event_responses"("option_id");

-- AddForeignKey
ALTER TABLE "activity_event_options" ADD CONSTRAINT "activity_event_options_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "activity_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_event_responses" ADD CONSTRAINT "activity_event_responses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "activity_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_event_responses" ADD CONSTRAINT "activity_event_responses_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_event_responses" ADD CONSTRAINT "activity_event_responses_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "activity_event_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed all-users Yes/No activity event
INSERT INTO "activity_events" ("id", "title", "description", "published", "starts_at", "ends_at", "updated_at")
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'BJP party good party',
  NULL,
  true,
  NOW() - INTERVAL '1 hour',
  TIMESTAMPTZ '2027-12-31 23:59:59+05:30',
  NOW()
);

INSERT INTO "activity_event_options" ("id", "event_id", "label", "sort_order")
VALUES
  ('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'Yes', 0),
  ('a1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'No', 1);
