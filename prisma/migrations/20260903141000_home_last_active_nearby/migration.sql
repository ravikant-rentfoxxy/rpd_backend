-- CreateIndex
CREATE INDEX "members_last_active_at_idx" ON "members"("last_active_at");

-- CreateTable
CREATE TABLE "nearby_activity_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(200) NOT NULL,
    "place_label" VARCHAR(160) NOT NULL,
    "image_url" VARCHAR(512) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nearby_activity_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nearby_activity_cards_sort_order_idx" ON "nearby_activity_cards"("sort_order");

INSERT INTO "nearby_activity_cards" ("title", "place_label", "image_url", "sort_order") VALUES
  ('Booth meeting', 'Near your booth', 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=60', 1),
  ('Griha sampark', 'Ward walk', 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=800&q=60', 2),
  ('Public programme', 'Community hall', 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=60', 3);
