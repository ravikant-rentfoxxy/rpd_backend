-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('DRAFT', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('MEMBER', 'PANNA_PRAMUKH', 'BOOTH_ADHYAKSH', 'MANDAL_PRESIDENT', 'DISTRICT_SECRETARY', 'DISTRICT_PRESIDENT');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('MEETING', 'ADD_MEMBER', 'GRIHA_SAMPARK', 'PUBLIC_PROGRAMME', 'TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('QUEUED', 'UPLOADED', 'PENDING_VERIFICATION', 'VERIFIED', 'NOT_VERIFIED', 'APPEALED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('OVERDUE', 'TODAY', 'THIS_WEEK', 'LATER');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('MEMBERSHIP_REQUIRED', 'WHATSAPP_UPDATES');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGN_IN', 'RECRUIT_CONSENT');

-- CreateEnum
CREATE TYPE "PointSource" AS ENUM ('MEMBER_VERIFIED', 'MEETING_HELD', 'GRIHA_SAMPARK', 'PUBLIC_PROGRAMME', 'TRAINING', 'PENALTY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "LocaleCode" AS ENUM ('HI', 'EN', 'BHO');

-- CreateEnum
CREATE TYPE "HealthBand" AS ENUM ('STRONG', 'ATTENTION', 'WEAK');

-- CreateTable
CREATE TABLE "states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_hi" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "state_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_hi" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_constituencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "district_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "number" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "name_hi" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assembly_constituencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "district_id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "name_hi" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mandals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booths" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "district_id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "mandal_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "booth_number" VARCHAR(8) NOT NULL,
    "part_number" VARCHAR(16) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "landmark" VARCHAR(200) NOT NULL,
    "village" VARCHAR(160) NOT NULL,
    "pincode" VARCHAR(6) NOT NULL,
    "voter_count" INTEGER NOT NULL DEFAULT 0,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "health_score" INTEGER NOT NULL DEFAULT 0,
    "health_band" "HealthBand" NOT NULL DEFAULT 'ATTENTION',
    "last_activity_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "booths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booth_health_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booth_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "detail" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booth_health_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "membership_number" VARCHAR(32),
    "mobile_e164" VARCHAR(16) NOT NULL,
    "mobile_hash" VARCHAR(64) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "father_or_husband_name" VARCHAR(160),
    "date_of_birth" DATE,
    "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "locale" "LocaleCode" NOT NULL DEFAULT 'HI',
    "status" "MemberStatus" NOT NULL DEFAULT 'DRAFT',
    "photo_url" VARCHAR(512),
    "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "valid_to" DATE,
    "district_id" UUID,
    "assembly_id" UUID,
    "mandal_id" UUID,
    "booth_id" UUID,
    "recruited_by_id" UUID,
    "last_active_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "post" "PostType" NOT NULL,
    "booth_id" UUID,
    "mandal_id" UUID,
    "district_id" UUID,
    "page_number" INTEGER,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "public_code" VARCHAR(48) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "membership_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID,
    "mobile_e164" VARCHAR(16) NOT NULL,
    "code_hash" VARCHAR(80) NOT NULL,
    "channel" "OtpChannel" NOT NULL DEFAULT 'WHATSAPP',
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'SIGN_IN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "token_hash" VARCHAR(80) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "user_agent" VARCHAR(240),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" VARCHAR(16) NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "locale" "LocaleCode" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "effective_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "locale" "LocaleCode" NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(240),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_uuid" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "booth_id" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'QUEUED',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "backdate_reason" VARCHAR(400),
    "notes" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "distance_metres" INTEGER,
    "far_away_reason" VARCHAR(400),
    "review_flag" BOOLEAN NOT NULL DEFAULT false,
    "homes_covered" INTEGER,
    "attendee_count" INTEGER NOT NULL DEFAULT 0,
    "photo_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_attendees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "member_id" UUID,
    "free_name" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" "ActivityStatus" NOT NULL,
    "reason" VARCHAR(600),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booth_id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "activity_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "agenda" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "venue" VARCHAR(200) NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_invitees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meeting_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "post_label" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_invitees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_check_ins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meeting_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "scanned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignee_id" UUID NOT NULL,
    "assigner_id" UUID NOT NULL,
    "booth_id" UUID,
    "mandal_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "detail" VARCHAR(400),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'THIS_WEEK',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL DEFAULT 1,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" "PointSource" NOT NULL,
    "points" INTEGER NOT NULL,
    "unit_label" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "point_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "activity_id" UUID,
    "source" "PointSource" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "points" INTEGER NOT NULL,
    "pending" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(240) NOT NULL,
    "period_month" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_idempotency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_uuid" UUID NOT NULL,
    "route" VARCHAR(80) NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(64) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_code_key" ON "states"("code");

-- CreateIndex
CREATE INDEX "districts_state_id_idx" ON "districts"("state_id");

-- CreateIndex
CREATE UNIQUE INDEX "districts_state_id_code_key" ON "districts"("state_id", "code");

-- CreateIndex
CREATE INDEX "assembly_constituencies_district_id_idx" ON "assembly_constituencies"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "assembly_constituencies_district_id_code_key" ON "assembly_constituencies"("district_id", "code");

-- CreateIndex
CREATE INDEX "mandals_district_id_idx" ON "mandals"("district_id");

-- CreateIndex
CREATE INDEX "mandals_assembly_id_idx" ON "mandals"("assembly_id");

-- CreateIndex
CREATE UNIQUE INDEX "mandals_district_id_code_key" ON "mandals"("district_id", "code");

-- CreateIndex
CREATE INDEX "booths_mandal_id_idx" ON "booths"("mandal_id");

-- CreateIndex
CREATE INDEX "booths_assembly_id_idx" ON "booths"("assembly_id");

-- CreateIndex
CREATE INDEX "booths_village_idx" ON "booths"("village");

-- CreateIndex
CREATE INDEX "booths_part_number_idx" ON "booths"("part_number");

-- CreateIndex
CREATE INDEX "booths_pincode_idx" ON "booths"("pincode");

-- CreateIndex
CREATE INDEX "booths_latitude_longitude_idx" ON "booths"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "booths_deleted_at_idx" ON "booths"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "booths_district_id_code_key" ON "booths"("district_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "booth_health_components_booth_id_key_key" ON "booth_health_components"("booth_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "members_membership_number_key" ON "members"("membership_number");

-- CreateIndex
CREATE UNIQUE INDEX "members_mobile_e164_key" ON "members"("mobile_e164");

-- CreateIndex
CREATE UNIQUE INDEX "members_mobile_hash_key" ON "members"("mobile_hash");

-- CreateIndex
CREATE INDEX "members_booth_id_idx" ON "members"("booth_id");

-- CreateIndex
CREATE INDEX "members_mandal_id_idx" ON "members"("mandal_id");

-- CreateIndex
CREATE INDEX "members_district_id_idx" ON "members"("district_id");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE INDEX "members_recruited_by_id_idx" ON "members"("recruited_by_id");

-- CreateIndex
CREATE INDEX "members_deleted_at_idx" ON "members"("deleted_at");

-- CreateIndex
CREATE INDEX "member_posts_member_id_is_primary_idx" ON "member_posts"("member_id", "is_primary");

-- CreateIndex
CREATE INDEX "member_posts_post_idx" ON "member_posts"("post");

-- CreateIndex
CREATE UNIQUE INDEX "membership_cards_member_id_key" ON "membership_cards"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_cards_public_code_key" ON "membership_cards"("public_code");

-- CreateIndex
CREATE INDEX "otp_challenges_mobile_e164_purpose_created_at_idx" ON "otp_challenges"("mobile_e164", "purpose", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_member_id_idx" ON "refresh_tokens"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "consent_documents_version_key" ON "consent_documents"("version");

-- CreateIndex
CREATE INDEX "consent_documents_kind_locale_is_current_idx" ON "consent_documents"("kind", "locale", "is_current");

-- CreateIndex
CREATE INDEX "member_consents_member_id_kind_idx" ON "member_consents"("member_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "activities_client_uuid_key" ON "activities"("client_uuid");

-- CreateIndex
CREATE INDEX "activities_actor_id_occurred_at_idx" ON "activities"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "activities_booth_id_occurred_at_idx" ON "activities"("booth_id", "occurred_at");

-- CreateIndex
CREATE INDEX "activities_status_idx" ON "activities"("status");

-- CreateIndex
CREATE INDEX "activities_type_idx" ON "activities"("type");

-- CreateIndex
CREATE INDEX "activity_photos_activity_id_idx" ON "activity_photos"("activity_id");

-- CreateIndex
CREATE INDEX "activity_attendees_activity_id_idx" ON "activity_attendees"("activity_id");

-- CreateIndex
CREATE INDEX "activity_reviews_activity_id_idx" ON "activity_reviews"("activity_id");

-- CreateIndex
CREATE INDEX "activity_reviews_reviewer_id_idx" ON "activity_reviews"("reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_activity_id_key" ON "meetings"("activity_id");

-- CreateIndex
CREATE INDEX "meetings_booth_id_starts_at_idx" ON "meetings"("booth_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_invitees_meeting_id_member_id_key" ON "meeting_invitees"("meeting_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_check_ins_meeting_id_member_id_key" ON "meeting_check_ins"("meeting_id", "member_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_due_at_idx" ON "tasks"("assignee_id", "due_at");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "point_rules_source_key" ON "point_rules"("source");

-- CreateIndex
CREATE INDEX "point_ledger_member_id_period_month_idx" ON "point_ledger"("member_id", "period_month");

-- CreateIndex
CREATE INDEX "point_ledger_pending_idx" ON "point_ledger"("pending");

-- CreateIndex
CREATE UNIQUE INDEX "sync_idempotency_client_uuid_key" ON "sync_idempotency"("client_uuid");

-- CreateIndex
CREATE INDEX "sync_idempotency_created_at_idx" ON "sync_idempotency"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_constituencies" ADD CONSTRAINT "assembly_constituencies_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandals" ADD CONSTRAINT "mandals_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandals" ADD CONSTRAINT "mandals_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assembly_constituencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booths" ADD CONSTRAINT "booths_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booths" ADD CONSTRAINT "booths_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assembly_constituencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booths" ADD CONSTRAINT "booths_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booth_health_components" ADD CONSTRAINT "booth_health_components_booth_id_fkey" FOREIGN KEY ("booth_id") REFERENCES "booths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assembly_constituencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_booth_id_fkey" FOREIGN KEY ("booth_id") REFERENCES "booths"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_recruited_by_id_fkey" FOREIGN KEY ("recruited_by_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_posts" ADD CONSTRAINT "member_posts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_posts" ADD CONSTRAINT "member_posts_booth_id_fkey" FOREIGN KEY ("booth_id") REFERENCES "booths"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_posts" ADD CONSTRAINT "member_posts_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_posts" ADD CONSTRAINT "member_posts_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_cards" ADD CONSTRAINT "membership_cards_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_consents" ADD CONSTRAINT "member_consents_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_consents" ADD CONSTRAINT "member_consents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "consent_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_booth_id_fkey" FOREIGN KEY ("booth_id") REFERENCES "booths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attendees" ADD CONSTRAINT "activity_attendees_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attendees" ADD CONSTRAINT "activity_attendees_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_reviews" ADD CONSTRAINT "activity_reviews_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_reviews" ADD CONSTRAINT "activity_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_booth_id_fkey" FOREIGN KEY ("booth_id") REFERENCES "booths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_invitees" ADD CONSTRAINT "meeting_invitees_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_check_ins" ADD CONSTRAINT "meeting_check_ins_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_check_ins" ADD CONSTRAINT "meeting_check_ins_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigner_id_fkey" FOREIGN KEY ("assigner_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_booth_id_fkey" FOREIGN KEY ("booth_id") REFERENCES "booths"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
