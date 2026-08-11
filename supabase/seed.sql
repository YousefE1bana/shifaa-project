-- Seeded-synthetic runtime fixtures only. Never add real-person data.
INSERT INTO identity.people (
  id,
  user_id,
  display_name,
  preferred_locale,
  profile_status,
  email_normalized
)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  'Synthetic Identity Reviewer',
  'ar-EG',
  'active',
  'reviewer@synthetic.shifaa.test'
)
ON CONFLICT (id) DO NOTHING;
