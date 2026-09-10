-- CreateEnum
CREATE TYPE "EngagementType" AS ENUM ('POLL', 'QUIZ');

-- CreateTable
CREATE TABLE "engagement_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "EngagementType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "engagement_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "prompt" VARCHAR(400) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "dismissed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "engagement_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engagement_events_starts_at_ends_at_idx" ON "engagement_events"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "engagement_events_published_deleted_at_idx" ON "engagement_events"("published", "deleted_at");

-- CreateIndex
CREATE INDEX "engagement_questions_event_id_sort_order_idx" ON "engagement_questions"("event_id", "sort_order");

-- CreateIndex
CREATE INDEX "engagement_options_question_id_sort_order_idx" ON "engagement_options"("question_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_entries_event_id_member_id_key" ON "engagement_entries"("event_id", "member_id");

-- CreateIndex
CREATE INDEX "engagement_entries_member_id_idx" ON "engagement_entries"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_answers_entry_id_question_id_key" ON "engagement_answers"("entry_id", "question_id");

-- CreateIndex
CREATE INDEX "engagement_answers_question_id_idx" ON "engagement_answers"("question_id");

-- AddForeignKey
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_questions" ADD CONSTRAINT "engagement_questions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "engagement_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_options" ADD CONSTRAINT "engagement_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "engagement_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_entries" ADD CONSTRAINT "engagement_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "engagement_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_entries" ADD CONSTRAINT "engagement_entries_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_answers" ADD CONSTRAINT "engagement_answers_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "engagement_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_answers" ADD CONSTRAINT "engagement_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "engagement_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_answers" ADD CONSTRAINT "engagement_answers_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "engagement_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
