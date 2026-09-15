CREATE TABLE "member_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "ref_id" UUID,
    "seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_notifications_member_id_created_at_idx" ON "member_notifications"("member_id", "created_at");
CREATE INDEX "member_notifications_member_id_seen_at_idx" ON "member_notifications"("member_id", "seen_at");

ALTER TABLE "member_notifications" ADD CONSTRAINT "member_notifications_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
