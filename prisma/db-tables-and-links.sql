-- RPD database tables and how they are linked
-- Reference only. Do not run as a migration. Live schema comes from prisma/migrations.
--
-- GEOGRAPHY
--   states
--     └── regions
--           └── districts
--                 └── assembly_constituencies
--                       └── mandals
--                             └── booths
--                                   └── booth_health_components
--
-- ORG CATALOG
--   org_levels
--     └── org_posts
--
-- PEOPLE
--   members ──► states, regions, districts, assembly_constituencies, mandals, booths
--   members ──► members                  (recruited_by_id, self)
--   member_posts ──► members + geo tables
--   membership_cards ──► members
--
-- AUTH / CONSENT
--   otp_challenges ──► members
--   refresh_tokens ──► members
--   member_consents ──► members, consent_documents
--
-- WORK
--   activities ──► members (actor), booths
--     ├── activity_photos
--     ├── activity_attendees ──► members
--     └── activity_reviews ──► members (reviewer)
--   meetings ──► booths, members (host), activities
--     ├── meeting_invitees
--     └── meeting_check_ins ──► members
--   tasks ──► members (assignee, assigner), booths, mandals
--   point_ledger ──► members, activities
--
-- OTHER
--   audit_logs ──► members
--   point_rules              (standalone)
--   sync_idempotency         (standalone)
--   nearby_activity_cards    (standalone)

-- ---------------------------------------------------------------------------
-- Geography
-- ---------------------------------------------------------------------------

-- regions.state_id               → states.id                 ON DELETE RESTRICT
-- districts.state_id             → states.id                 ON DELETE RESTRICT
-- districts.region_id            → regions.id                ON DELETE SET NULL
-- assembly_constituencies.state_id     → states.id           ON DELETE RESTRICT
-- assembly_constituencies.district_id  → districts.id        ON DELETE RESTRICT
-- mandals.district_id            → districts.id              ON DELETE RESTRICT
-- mandals.assembly_id            → assembly_constituencies.id ON DELETE RESTRICT
-- booths.district_id             → districts.id              ON DELETE RESTRICT
-- booths.assembly_id             → assembly_constituencies.id ON DELETE RESTRICT
-- booths.mandal_id               → mandals.id                ON DELETE RESTRICT
-- booth_health_components.booth_id → booths.id               ON DELETE CASCADE

ALTER TABLE regions
  ADD CONSTRAINT regions_state_id_fkey
  FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE RESTRICT;

ALTER TABLE districts
  ADD CONSTRAINT districts_state_id_fkey
  FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE RESTRICT;

ALTER TABLE districts
  ADD CONSTRAINT districts_region_id_fkey
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL;

ALTER TABLE assembly_constituencies
  ADD CONSTRAINT assembly_constituencies_state_id_fkey
  FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE RESTRICT;

ALTER TABLE assembly_constituencies
  ADD CONSTRAINT assembly_constituencies_district_id_fkey
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;

ALTER TABLE mandals
  ADD CONSTRAINT mandals_district_id_fkey
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;

ALTER TABLE mandals
  ADD CONSTRAINT mandals_assembly_id_fkey
  FOREIGN KEY (assembly_id) REFERENCES assembly_constituencies(id) ON DELETE RESTRICT;

ALTER TABLE booths
  ADD CONSTRAINT booths_district_id_fkey
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;

ALTER TABLE booths
  ADD CONSTRAINT booths_assembly_id_fkey
  FOREIGN KEY (assembly_id) REFERENCES assembly_constituencies(id) ON DELETE RESTRICT;

ALTER TABLE booths
  ADD CONSTRAINT booths_mandal_id_fkey
  FOREIGN KEY (mandal_id) REFERENCES mandals(id) ON DELETE RESTRICT;

ALTER TABLE booth_health_components
  ADD CONSTRAINT booth_health_components_booth_id_fkey
  FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Org catalog
-- ---------------------------------------------------------------------------

-- org_posts.level_id → org_levels.id   ON DELETE CASCADE

ALTER TABLE org_posts
  ADD CONSTRAINT org_posts_level_id_fkey
  FOREIGN KEY (level_id) REFERENCES org_levels(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

-- members.state_id        → states.id                    ON DELETE SET NULL
-- members.region_id       → regions.id                   ON DELETE SET NULL
-- members.district_id     → districts.id                 ON DELETE SET NULL
-- members.assembly_id     → assembly_constituencies.id   ON DELETE SET NULL
-- members.mandal_id       → mandals.id                   ON DELETE SET NULL
-- members.booth_id        → booths.id                    ON DELETE SET NULL
-- members.recruited_by_id → members.id                   ON DELETE SET NULL

ALTER TABLE members
  ADD CONSTRAINT members_state_id_fkey
  FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE SET NULL;

ALTER TABLE members
  ADD CONSTRAINT members_region_id_fkey
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL;

ALTER TABLE members
  ADD CONSTRAINT members_district_id_fkey
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;

ALTER TABLE members
  ADD CONSTRAINT members_assembly_id_fkey
  FOREIGN KEY (assembly_id) REFERENCES assembly_constituencies(id) ON DELETE SET NULL;

ALTER TABLE members
  ADD CONSTRAINT members_mandal_id_fkey
  FOREIGN KEY (mandal_id) REFERENCES mandals(id) ON DELETE SET NULL;

ALTER TABLE members
  ADD CONSTRAINT members_booth_id_fkey
  FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE SET NULL;

ALTER TABLE members
  ADD CONSTRAINT members_recruited_by_id_fkey
  FOREIGN KEY (recruited_by_id) REFERENCES members(id) ON DELETE SET NULL;

-- member_posts.member_id    → members.id                   ON DELETE CASCADE
-- member_posts.booth_id     → booths.id                    ON DELETE SET NULL
-- member_posts.mandal_id    → mandals.id                   ON DELETE SET NULL
-- member_posts.assembly_id  → assembly_constituencies.id   ON DELETE SET NULL
-- member_posts.district_id  → districts.id                 ON DELETE SET NULL
-- member_posts.region_id    → regions.id                   ON DELETE SET NULL
-- member_posts.state_id     → states.id                    ON DELETE SET NULL

ALTER TABLE member_posts
  ADD CONSTRAINT member_posts_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

ALTER TABLE member_posts
  ADD CONSTRAINT member_posts_booth_id_fkey
  FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE SET NULL;

ALTER TABLE member_posts
  ADD CONSTRAINT member_posts_mandal_id_fkey
  FOREIGN KEY (mandal_id) REFERENCES mandals(id) ON DELETE SET NULL;

ALTER TABLE member_posts
  ADD CONSTRAINT member_posts_assembly_id_fkey
  FOREIGN KEY (assembly_id) REFERENCES assembly_constituencies(id) ON DELETE SET NULL;

ALTER TABLE member_posts
  ADD CONSTRAINT member_posts_district_id_fkey
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;

ALTER TABLE member_posts
  ADD CONSTRAINT member_posts_region_id_fkey
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL;

ALTER TABLE member_posts
  ADD CONSTRAINT member_posts_state_id_fkey
  FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE SET NULL;

-- membership_cards.member_id → members.id   ON DELETE CASCADE

ALTER TABLE membership_cards
  ADD CONSTRAINT membership_cards_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Auth and consent
-- ---------------------------------------------------------------------------

-- otp_challenges.member_id     → members.id             ON DELETE SET NULL
-- refresh_tokens.member_id     → members.id             ON DELETE CASCADE
-- member_consents.member_id    → members.id             ON DELETE CASCADE
-- member_consents.document_id  → consent_documents.id   ON DELETE RESTRICT

ALTER TABLE otp_challenges
  ADD CONSTRAINT otp_challenges_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

ALTER TABLE member_consents
  ADD CONSTRAINT member_consents_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

ALTER TABLE member_consents
  ADD CONSTRAINT member_consents_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES consent_documents(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- Work
-- ---------------------------------------------------------------------------

-- activities.actor_id              → members.id     ON DELETE RESTRICT
-- activities.booth_id              → booths.id      ON DELETE RESTRICT
-- activity_photos.activity_id      → activities.id  ON DELETE CASCADE
-- activity_attendees.activity_id   → activities.id  ON DELETE CASCADE
-- activity_attendees.member_id     → members.id     ON DELETE SET NULL
-- activity_reviews.activity_id     → activities.id  ON DELETE CASCADE
-- activity_reviews.reviewer_id     → members.id     ON DELETE RESTRICT

ALTER TABLE activities
  ADD CONSTRAINT activities_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES members(id) ON DELETE RESTRICT;

ALTER TABLE activities
  ADD CONSTRAINT activities_booth_id_fkey
  FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE RESTRICT;

ALTER TABLE activity_photos
  ADD CONSTRAINT activity_photos_activity_id_fkey
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;

ALTER TABLE activity_attendees
  ADD CONSTRAINT activity_attendees_activity_id_fkey
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;

ALTER TABLE activity_attendees
  ADD CONSTRAINT activity_attendees_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE activity_reviews
  ADD CONSTRAINT activity_reviews_activity_id_fkey
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;

ALTER TABLE activity_reviews
  ADD CONSTRAINT activity_reviews_reviewer_id_fkey
  FOREIGN KEY (reviewer_id) REFERENCES members(id) ON DELETE RESTRICT;

-- meetings.booth_id     → booths.id      ON DELETE RESTRICT
-- meetings.host_id      → members.id     ON DELETE RESTRICT
-- meetings.activity_id  → activities.id  ON DELETE SET NULL
-- meeting_invitees.meeting_id   → meetings.id  ON DELETE CASCADE
-- meeting_check_ins.meeting_id  → meetings.id  ON DELETE CASCADE
-- meeting_check_ins.member_id   → members.id   ON DELETE RESTRICT

ALTER TABLE meetings
  ADD CONSTRAINT meetings_booth_id_fkey
  FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE RESTRICT;

ALTER TABLE meetings
  ADD CONSTRAINT meetings_host_id_fkey
  FOREIGN KEY (host_id) REFERENCES members(id) ON DELETE RESTRICT;

ALTER TABLE meetings
  ADD CONSTRAINT meetings_activity_id_fkey
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL;

ALTER TABLE meeting_invitees
  ADD CONSTRAINT meeting_invitees_meeting_id_fkey
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;

ALTER TABLE meeting_check_ins
  ADD CONSTRAINT meeting_check_ins_meeting_id_fkey
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;

ALTER TABLE meeting_check_ins
  ADD CONSTRAINT meeting_check_ins_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;

-- tasks.assignee_id  → members.id   ON DELETE RESTRICT
-- tasks.assigner_id  → members.id   ON DELETE RESTRICT
-- tasks.booth_id     → booths.id    ON DELETE SET NULL
-- tasks.mandal_id    → mandals.id   ON DELETE SET NULL

ALTER TABLE tasks
  ADD CONSTRAINT tasks_assignee_id_fkey
  FOREIGN KEY (assignee_id) REFERENCES members(id) ON DELETE RESTRICT;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_assigner_id_fkey
  FOREIGN KEY (assigner_id) REFERENCES members(id) ON DELETE RESTRICT;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_booth_id_fkey
  FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE SET NULL;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_mandal_id_fkey
  FOREIGN KEY (mandal_id) REFERENCES mandals(id) ON DELETE SET NULL;

-- point_ledger.member_id    → members.id     ON DELETE RESTRICT
-- point_ledger.activity_id  → activities.id  ON DELETE SET NULL

ALTER TABLE point_ledger
  ADD CONSTRAINT point_ledger_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;

ALTER TABLE point_ledger
  ADD CONSTRAINT point_ledger_activity_id_fkey
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

-- audit_logs.actor_id → members.id   ON DELETE SET NULL

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES members(id) ON DELETE SET NULL;

-- No foreign keys:
--   point_rules
--   sync_idempotency
--   nearby_activity_cards
--   consent_documents   (parent of member_consents only)
