CREATE TABLE "post_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_hi" VARCHAR(80) NOT NULL,
    "name_bho" VARCHAR(80) NOT NULL,
    "priority" INTEGER NOT NULL,
    "band" VARCHAR(24) NOT NULL,
    "reason" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_issues_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_issues_code_key" ON "post_issues"("code");
CREATE UNIQUE INDEX "post_issues_priority_key" ON "post_issues"("priority");
CREATE INDEX "post_issues_priority_idx" ON "post_issues"("priority");

INSERT INTO "post_issues" ("code", "name", "name_hi", "name_bho", "priority", "band", "reason") VALUES
('WATER', 'Water', 'पानी', 'पानी', 1, 'VERY_HIGH', 'Drinking water, supply interruptions, contamination, pipelines'),
('ROADS_TRANSPORT', 'Roads & Transport', 'सड़क और परिवहन', 'सड़क आ यातायात', 2, 'VERY_HIGH', 'Potholes, damaged roads, traffic, public transport affect daily travel'),
('ELECTRICITY', 'Electricity', 'बिजली', 'बिजली', 3, 'VERY_HIGH', 'Power cuts, transformers, streetlights, exposed wires'),
('HEALTH', 'Health', 'स्वास्थ्य', 'स्वास्थ्य', 4, 'VERY_HIGH', 'Hospitals, medicines, ambulances and basic healthcare are critical'),
('SANITATION_GARBAGE', 'Sanitation & Garbage', 'स्वच्छता और कचरा', 'सफाई आ कचरा', 5, 'VERY_HIGH', 'Garbage accumulation directly affects hygiene and disease prevention'),
('DRAINAGE_SEWERAGE', 'Drainage & Sewerage', 'नाली और सीवर', 'नाली आ सीवर', 6, 'HIGH', 'Blocked drains, sewage overflow and waterlogging'),
('EDUCATION', 'Education', 'शिक्षा', 'शिक्षा', 7, 'HIGH', 'Schools, teachers, infrastructure and scholarships'),
('GOVERNMENT_SERVICES', 'Government Services', 'सरकारी सेवाएँ', 'सरकारी सेवा', 8, 'HIGH', 'Certificates, ration cards, welfare schemes and office delays'),
('PUBLIC_SAFETY', 'Public Safety', 'सार्वजनिक सुरक्षा', 'सार्वजनिक सुरक्षा', 9, 'HIGH', 'Unsafe roads/areas, lighting, CCTV and emergency concerns'),
('AGRICULTURE_RURAL', 'Agriculture & Rural Development', 'कृषि और ग्रामीण विकास', 'खेती आ गाँव विकास', 10, 'MEDIUM_HIGH', 'Especially important for villages and farming communities'),
('ENVIRONMENT', 'Environment', 'पर्यावरण', 'पर्यावरण', 11, 'MEDIUM', 'Pollution, waste dumping, tree cutting, water pollution'),
('WOMEN_CHILD_WELFARE', 'Women & Child Welfare', 'महिला एवं बाल कल्याण', 'महिला आ बच्चा कल्याण', 12, 'MEDIUM_HIGH', 'Important welfare and safety-related issues'),
('OTHER', 'Other', 'अन्य', 'अउर', 13, 'OTHER', 'Catch-all for issues outside defined categories');

ALTER TABLE "region_posts" ADD COLUMN "issue_id" UUID;

UPDATE "region_posts"
SET "issue_id" = (SELECT "id" FROM "post_issues" WHERE "code" = 'OTHER')
WHERE "issue_id" IS NULL;

ALTER TABLE "region_posts" ALTER COLUMN "issue_id" SET NOT NULL;

ALTER TABLE "region_posts" ADD CONSTRAINT "region_posts_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "post_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "region_posts_issue_id_created_at_idx" ON "region_posts"("issue_id", "created_at");
