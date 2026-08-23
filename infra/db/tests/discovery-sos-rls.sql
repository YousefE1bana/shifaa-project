\set ON_ERROR_STOP on
BEGIN;

\ir ../fixtures/discovery-sos.sql

UPDATE hospital.capacity_projections
SET observed_at=statement_timestamp()-interval '1 minute',
    fresh_until=CASE facility_id
      WHEN '63000000-0000-4000-8000-000000000003'::uuid THEN statement_timestamp()-interval '1 second'
      ELSE statement_timestamp()+interval '10 minutes'
    END;

SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.environment','local',true);
SELECT set_config('shifaa.actor_role','PAT',true);
SELECT set_config('shifaa.aal','1',true);
SELECT set_config('shifaa.purposes','emergency_care',true);
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000001',true);
SELECT set_config('shifaa.patient_context','61000000-0000-4000-8000-000000000001',true);

DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM hospital.capacity_projections;
    RAISE EXCEPTION 'patient gained direct capacity-table access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM count(*) FROM platform.feature_flags;
    RAISE EXCEPTION 'patient gained direct feature-flag access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM count(*) FROM identity.callback_contact_verifications;
    RAISE EXCEPTION 'patient gained direct callback-verification access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM platform.deliver_local_synthetic_message(repeat('a',64),repeat('b',64),repeat('c',64));
    RAISE EXCEPTION 'patient gained synthetic-provider execution';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO platform.sos_incidents(
      patient_id,initiated_by_user_id,coordinates,coordinate_precision,qualifying_reason_code,
      contact_preference,callback_source,status
    ) VALUES(
      '61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      public.ST_SetSRID(public.ST_MakePoint(31.2,30.1),4326)::geography,'exact','medical_emergency','none',
      'patient_verified_contact','active_unmatched'
    );
    RAISE EXCEPTION 'direct SOS insert grant exists';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM platform.search_discovery_facilities(31.2005,30.1005,25000,'hospital','emergency_care',NULL,NULL,NULL,100))<>3 THEN
    RAISE EXCEPTION 'safe public hospital projection missing';
  END IF;
END $$;

SELECT platform.create_sos_incident_record(
  '67100000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',
  31.2005,30.1005,'accident_or_injury','all_confirmed','patient_verified_contact',25000,'synthetic_seed'
);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM platform.sos_incidents WHERE id='67100000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'self patient cannot read own incident';
  END IF;
  IF platform.sos_contact_delivery_status('67100000-0000-4000-8000-000000000001')<>'pending' THEN
    RAISE EXCEPTION 'subject contact-delivery status did not start pending';
  END IF;
  IF EXISTS(SELECT 1 FROM platform.sos_incidents WHERE patient_id='61000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'self patient read foreign incident';
  END IF;
END $$;

-- Current guardian requires its relationship purpose.
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000002',true);
SELECT set_config('shifaa.purposes','wrong_purpose',true);
DO $$ BEGIN
  IF platform.person_can_activate_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'wrong-purpose guardian received SOS authority';
  END IF;
  IF EXISTS(SELECT 1 FROM platform.sos_incidents) THEN RAISE EXCEPTION 'wrong-purpose guardian read incident'; END IF;
END $$;
SELECT set_config('shifaa.purposes','emergency_care',true);
DO $$ BEGIN
  IF NOT platform.person_can_activate_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002')
    OR NOT platform.person_can_share_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'current guardian exact SOS permissions missing';
  END IF;
END $$;

-- Activate-only and share-only delegations remain independent.
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
  IF NOT platform.person_can_activate_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003')
    OR platform.person_can_share_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'activate delegate permission inflated or missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM platform.sos_incidents WHERE id='67100000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'activate delegate cannot read current incident';
  END IF;
END $$;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000004',true);
DO $$ BEGIN
  IF platform.person_can_activate_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000004')
    OR NOT platform.person_can_share_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'share delegate permission inflated or missing';
  END IF;
  IF EXISTS(SELECT 1 FROM platform.sos_incidents) THEN RAISE EXCEPTION 'share-only delegate gained incident read'; END IF;
END $$;
SELECT platform.create_emergency_share_record(
  '68200000-0000-4000-8000-000000000001','67100000-0000-4000-8000-000000000001',
  decode(repeat('91',32),'hex'),ARRAY['blood_group','confirmed_allergies'],statement_timestamp()+interval '10 minutes'
);
DO $$ BEGIN
  PERFORM set_config('shifaa.patient_context','61000000-0000-4000-8000-000000000002',true);
  BEGIN
    PERFORM platform.create_emergency_share_record(
      '68200000-0000-4000-8000-000000000002','67100000-0000-4000-8000-000000000001',
      decode(repeat('92',32),'hex'),ARRAY['blood_group'],statement_timestamp()+interval '10 minutes'
    );
    RAISE EXCEPTION 'wrong patient context created an emergency share';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM platform.revoke_emergency_share('68200000-0000-4000-8000-000000000001',1);
    RAISE EXCEPTION 'wrong patient context revoked an emergency share';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM set_config('shifaa.patient_context','',true);
  BEGIN
    PERFORM platform.create_emergency_share_record(
      '68200000-0000-4000-8000-000000000003','67100000-0000-4000-8000-000000000001',
      decode(repeat('93',32),'hex'),ARRAY['blood_group'],statement_timestamp()+interval '10 minutes'
    );
    RAISE EXCEPTION 'missing patient context created an emergency share';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('shifaa.patient_context','61000000-0000-4000-8000-000000000001',true);
END $$;

SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000005',true);
DO $$ BEGIN
  IF platform.person_can_activate_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000005')
    OR platform.person_can_share_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION 'record.view implied an SOS permission';
  END IF;
END $$;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000006',true);
SELECT set_config('shifaa.actor_role','HSP',true);
SELECT set_config('shifaa.aal','2',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM platform.sos_incidents) THEN RAISE EXCEPTION 'forged HSP role granted incident access'; END IF;
END $$;

-- Revocation is effective at the next database authorization check.
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000001',true);
SELECT set_config('shifaa.actor_role','PAT',true);
UPDATE identity.care_relationship_permissions
SET revoked_at=statement_timestamp(),revoked_by_person_id='60000000-0000-4000-8000-000000000001'
WHERE relationship_id='62000000-0000-4000-8000-000000000004' AND permission_code='sos.activate' AND revoked_at IS NULL;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
  IF platform.person_can_activate_sos('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003')
    OR EXISTS(SELECT 1 FROM platform.sos_incidents) THEN
    RAISE EXCEPTION 'revoked delegation remained authorized';
  END IF;
END $$;

-- Only the matched hospital sees its worklist; AAL2 is required for acceptance.
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000008',true);
SELECT set_config('shifaa.actor_role','HSP',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','sos_prearrival',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM platform.sos_incidents) THEN RAISE EXCEPTION 'cross-facility hospital read incident'; END IF; END $$;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000007',true);
SELECT set_config('shifaa.aal','1',true);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM platform.sos_incidents WHERE id='67100000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'matched hospital minimum read missing';
  END IF;
  BEGIN
    PERFORM platform.accept_sos_prearrival('67100000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'capacity_acknowledged');
    RAISE EXCEPTION 'AAL1 hospital accepted a pre-arrival';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM platform.sos_contact_delivery_status('67100000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'hospital read subject-only contact delivery status';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- Current hospital authority includes current facility and professional licensing.
DO $$ BEGIN
  IF NOT platform.hospital_member_authorized('63000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000007',false) THEN
    RAISE EXCEPTION 'currently licensed hospital owner was denied';
  END IF;
END $$;
RESET ROLE;
UPDATE identity.facility_licenses SET status='suspended'
WHERE id='63200000-0000-4000-8000-000000000001';
SET LOCAL ROLE shifaa_api;
DO $$ BEGIN
  IF platform.hospital_member_authorized('63000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000007',false)
    OR EXISTS(SELECT 1 FROM platform.sos_incidents) THEN
    RAISE EXCEPTION 'suspended facility license retained hospital authority';
  END IF;
END $$;
RESET ROLE;
UPDATE identity.facility_licenses SET status='verified'
WHERE id='63200000-0000-4000-8000-000000000001';
SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000009',true);
DO $$ BEGIN
  IF NOT platform.hospital_member_authorized('63000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000009',false) THEN
    RAISE EXCEPTION 'current matching professional license was denied';
  END IF;
END $$;
RESET ROLE;
UPDATE identity.professional_licenses SET status='suspended'
WHERE id='63200000-0000-4000-8000-000000000006';
SET LOCAL ROLE shifaa_api;
DO $$ BEGIN
  IF platform.hospital_member_authorized('63000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000009',false) THEN
    RAISE EXCEPTION 'suspended professional license retained hospital authority';
  END IF;
END $$;
RESET ROLE;
UPDATE identity.professional_licenses SET status='verified'
WHERE id='63200000-0000-4000-8000-000000000006';
UPDATE platform.feature_flags SET enabled=false
WHERE code='sos.prearrival' AND environment='local';
SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000007',true);
SELECT set_config('shifaa.aal','2',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM platform.sos_incidents) THEN RAISE EXCEPTION 'disabled pre-arrival remained readable'; END IF;
  BEGIN
    PERFORM platform.accept_sos_prearrival('67100000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'capacity_acknowledged');
    RAISE EXCEPTION 'disabled pre-arrival accepted an incident';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE platform.feature_flags SET enabled=true
WHERE code='sos.prearrival' AND environment='local';
SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000007',true);
SELECT set_config('shifaa.purposes','wrong_purpose',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM platform.sos_incidents) THEN RAISE EXCEPTION 'wrong-purpose hospital read incident'; END IF; END $$;
SELECT set_config('shifaa.purposes','sos_prearrival',true);
SELECT set_config('shifaa.aal','2',true);
SELECT platform.accept_sos_prearrival('67100000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'capacity_acknowledged');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM platform.sos_incidents WHERE id='67100000-0000-4000-8000-000000000001' AND status='accepted' AND version=2) THEN
    RAISE EXCEPTION 'authorized matched hospital acceptance missing';
  END IF;
  BEGIN
    PERFORM platform.accept_sos_prearrival('67100000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',1,'capacity_acknowledged');
    RAISE EXCEPTION 'stale-version duplicate acceptance succeeded';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;

-- Public bearer use has no direct row visibility and consumes exactly one projection.
RESET ROLE;
UPDATE platform.feature_flags SET enabled=false WHERE code='sos.share' AND environment='local';
SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.person_id','',true); SELECT set_config('shifaa.actor_role','',true); SELECT set_config('shifaa.aal','',true); SELECT set_config('shifaa.purposes','',true); SELECT set_config('shifaa.patient_context','',true);
SELECT set_config('shifaa.environment','local',true);
DO $$
DECLARE denied record;
BEGIN
  SELECT * INTO denied FROM platform.consume_emergency_share(decode(repeat('91',32),'hex'),'68300000-0000-4000-8000-000000000000');
  IF denied.outcome<>'denied' OR denied.denial_code<>'emergency-share-expired' OR denied.share_id IS NOT NULL THEN
    RAISE EXCEPTION 'disabled share view did not fail closed without data';
  END IF;
END $$;
RESET ROLE;
UPDATE platform.feature_flags SET enabled=true WHERE code='sos.share' AND environment='local';
SET LOCAL ROLE shifaa_api;
DO $$
DECLARE consumed record;
BEGIN
  IF EXISTS(SELECT 1 FROM platform.emergency_share_links) THEN RAISE EXCEPTION 'anonymous caller read share-link rows'; END IF;
  SELECT * INTO consumed FROM platform.consume_emergency_share(decode(repeat('91',32),'hex'),'68300000-0000-4000-8000-000000000001');
  IF consumed.outcome<>'success' OR consumed.share_id IS NULL OR consumed.blood_group<>'O+' OR consumed.expires_at IS NULL
    OR consumed.unavailable_fields<>ARRAY['confirmed_allergies']::text[] THEN
    RAISE EXCEPTION 'public minimum bearer projection is incorrect';
  END IF;
  SELECT * INTO consumed FROM platform.consume_emergency_share(decode(repeat('91',32),'hex'),'68300000-0000-4000-8000-000000000002');
  IF consumed.outcome<>'denied' OR consumed.denial_code<>'emergency-share-expired'
    OR consumed.share_id IS NOT NULL OR consumed.blood_group IS NOT NULL THEN
    RAISE EXCEPTION 'public bearer replay did not return uniform data-free denial';
  END IF;
END $$;

RESET ROLE;

-- Prepare one SOS and one privacy event; the SOS worker helper must not claim the privacy event.
INSERT INTO platform.outbox_events(id,aggregate_type,aggregate_id,aggregate_version,event_type,payload,available_at) VALUES
 ('68400000-0000-4000-8000-000000000001','sos-incident','67100000-0000-4000-8000-000000000001',2,'sos.emergency_contact.requested','{"incident_id":"67100000-0000-4000-8000-000000000001"}'::jsonb,statement_timestamp()-interval '1 second'),
 ('68400000-0000-4000-8000-000000000002','privacy-dsr','68400000-0000-4000-8000-000000000099',1,'privacy.dsr.status_changed','{}'::jsonb,statement_timestamp()-interval '2 seconds');

UPDATE platform.feature_flags SET enabled=false
WHERE code='sos.contact_delivery' AND environment='local';
SET LOCAL ROLE shifaa_worker;
SELECT set_config('shifaa.environment','local',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM platform.claim_next_sos_contact_event('worker-006-disabled',30))
    OR EXISTS(SELECT 1 FROM platform.sos_contact_delivery_candidates('67100000-0000-4000-8000-000000000001')) THEN
    RAISE EXCEPTION 'disabled contact delivery still claimed or projected work';
  END IF;
END $$;
RESET ROLE;
UPDATE platform.feature_flags SET enabled=true
WHERE code='sos.contact_delivery' AND environment='local';
UPDATE identity.callback_contact_verifications SET revoked_at=statement_timestamp()
WHERE person_id='60000000-0000-4000-8000-000000000001';
SET LOCAL ROLE shifaa_worker;
SELECT set_config('shifaa.environment','local',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM platform.sos_contact_delivery_candidates('67100000-0000-4000-8000-000000000001')) THEN
    RAISE EXCEPTION 'revoked callback verification still projected a delivery';
  END IF;
END $$;
RESET ROLE;
UPDATE identity.callback_contact_verifications SET revoked_at=NULL,version=version+1,updated_at=statement_timestamp()
WHERE person_id='60000000-0000-4000-8000-000000000001';
SET LOCAL ROLE shifaa_worker;
SELECT set_config('shifaa.environment','local',true);
DO $$
DECLARE claimed record;
  first_receipt text;
  replay_receipt text;
BEGIN
  BEGIN
    PERFORM count(*) FROM platform.sos_incidents;
    RAISE EXCEPTION 'worker gained direct incident-table access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM count(*) FROM platform.synthetic_message_receipts;
    RAISE EXCEPTION 'worker gained direct synthetic-provider receipt access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  first_receipt:=platform.deliver_local_synthetic_message(repeat('a',64),repeat('b',64),repeat('c',64));
  replay_receipt:=platform.deliver_local_synthetic_message(repeat('a',64),repeat('b',64),repeat('c',64));
  IF first_receipt<>replay_receipt THEN
    RAISE EXCEPTION 'durable synthetic-provider replay returned a different receipt';
  END IF;
  SELECT * INTO claimed FROM platform.claim_next_sos_contact_event('worker-006-a',30);
  IF claimed.event_id<>'68400000-0000-4000-8000-000000000001' OR claimed.incident_id<>'67100000-0000-4000-8000-000000000001' OR claimed.attempt_count<>1 THEN
    RAISE EXCEPTION 'worker claimed wrong event or lease shape';
  END IF;
  IF platform.complete_sos_contact_event(claimed.event_id,'worker-006-wrong','delivered',NULL,NULL) THEN
    RAISE EXCEPTION 'wrong lease owner completed SOS event';
  END IF;
  INSERT INTO platform.notifications(
    source_event_id,template_release_id,recipient_type,recipient_emergency_contact_id,
    locale,channel,field_values,rendered_digest
  ) VALUES(
    claimed.event_id,'64000000-0000-4000-8000-000000000001','emergency_contact',
    '66000000-0000-4000-8000-000000000001','ar-EG','sms','{}'::jsonb,repeat('d',64)
  );
  UPDATE platform.notifications SET status='delivered',attempt_count=1,
    delivered_at=statement_timestamp(),updated_at=statement_timestamp()
  WHERE source_event_id=claimed.event_id AND recipient_emergency_contact_id='66000000-0000-4000-8000-000000000001';
  IF NOT platform.complete_sos_contact_event(claimed.event_id,'worker-006-a','delivered',NULL,NULL) THEN
    RAISE EXCEPTION 'lease owner could not complete SOS event';
  END IF;
  IF EXISTS(SELECT 1 FROM platform.claim_next_sos_contact_event('worker-006-a',30)) THEN
    RAISE EXCEPTION 'SOS helper claimed a privacy event or terminal SOS event';
  END IF;
  IF (SELECT count(*) FROM platform.sos_contact_delivery_candidates('67100000-0000-4000-8000-000000000001'))<>1 THEN
    RAISE EXCEPTION 'worker minimum current-contact candidate missing';
  END IF;
END $$;

RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM platform.event_receipts
    WHERE event_id='68400000-0000-4000-8000-000000000001'
      AND consumer='discovery-sos-contact-worker' AND result_code='delivered'
  ) THEN RAISE EXCEPTION 'terminal SOS worker receipt missing'; END IF;
  IF EXISTS(
    SELECT 1 FROM platform.event_receipts
    WHERE event_id='68400000-0000-4000-8000-000000000002'
      AND consumer='discovery-sos-contact-worker'
  ) THEN RAISE EXCEPTION 'privacy event crossed into SOS worker receipts'; END IF;
END $$;

SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000001',true);
SELECT set_config('shifaa.actor_role','PAT',true);
SELECT set_config('shifaa.aal','1',true);
SELECT set_config('shifaa.purposes','emergency_care',true);
SELECT set_config('shifaa.patient_context','61000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  IF platform.sos_contact_delivery_status('67100000-0000-4000-8000-000000000001')<>'delivered' THEN
    RAISE EXCEPTION 'subject minimum delivery projection did not reflect terminal worker truth';
  END IF;
END $$;
RESET ROLE;

ROLLBACK;
