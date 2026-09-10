CREATE TABLE "post_issue_sync" (
    "id" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "post_issue_sync_pkey" PRIMARY KEY ("id")
);

INSERT INTO "post_issue_sync" ("id", "updated_at") VALUES (1, CURRENT_TIMESTAMP);
