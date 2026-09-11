-- AlterTable
ALTER TABLE "members" ADD COLUMN "voter_id" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "members_voter_id_key" ON "members"("voter_id");
