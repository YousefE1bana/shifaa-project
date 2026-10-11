-- Synthetic, owner-only setup for PR-490 scoped-authority eligibility proof.
-- The release still carries the immutable authority/credential snapshots that
-- were captured at signature time; only the current authority scope is made
-- facility-bound before the release is created.
BEGIN;

UPDATE clinical.content_governance_authorities
SET facility_id='f0110000-0000-4000-8200-000000000001',
    version=version+1,updated_at=clock_timestamp()
WHERE id IN (
  'f011c000-0000-4000-8400-000000000002',
  'f011c000-0000-4000-8400-000000000003'
);

INSERT INTO identity.facility_memberships
  (id,facility_id,person_id,role_code,employment_license_id,valid_from,
   membership_status,created_by_person_id)
VALUES
  ('f011c000-0000-4000-8800-000000000003',
   'f0110000-0000-4000-8200-000000000001',
   'f0110000-0000-4000-8000-000000000003','pharmacist',
   'f0110000-0000-4000-8300-000000000003','2020-01-01','active',
   'f0110000-0000-4000-8000-000000000003');

COMMIT;
