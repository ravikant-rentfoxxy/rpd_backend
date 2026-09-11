INSERT INTO "activity_events" ("id", "title", "description", "published", "starts_at", "ends_at", "updated_at")
VALUES (
  'a1000000-0000-4000-8000-000000000002',
  'is D. P. Yadav is Politician?',
  NULL,
  true,
  NOW() - INTERVAL '1 hour',
  TIMESTAMPTZ '2027-12-31 23:59:59+05:30',
  NOW()
);

INSERT INTO "activity_event_options" ("id", "event_id", "label", "sort_order")
VALUES
  ('a1000000-0000-4000-8000-000000000021', 'a1000000-0000-4000-8000-000000000002', 'Yes', 0),
  ('a1000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000002', 'No', 1);
