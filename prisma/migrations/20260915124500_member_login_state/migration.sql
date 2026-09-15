ALTER TABLE "members" ADD COLUMN "is_logged_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "members" ADD COLUMN "last_login_at" TIMESTAMPTZ(6);
