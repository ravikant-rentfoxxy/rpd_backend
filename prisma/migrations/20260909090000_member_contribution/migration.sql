CREATE TYPE "ContributionType" AS ENUM ('PRIMARY_MEMBER', 'VOLUNTEER', 'DONATION');
CREATE TYPE "VolunteerMode" AS ENUM ('ONLINE', 'OFFLINE');

ALTER TABLE "members" ADD COLUMN "contribution_type" "ContributionType";
ALTER TABLE "members" ADD COLUMN "referral_code" VARCHAR(32);
ALTER TABLE "members" ADD COLUMN "volunteer_mode" "VolunteerMode";
ALTER TABLE "members" ADD COLUMN "weekly_hours" INTEGER;
