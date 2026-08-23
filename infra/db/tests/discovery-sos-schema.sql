\set ON_ERROR_STOP on
BEGIN;

\ir ../fixtures/discovery-sos.sql

-- Refresh only the transaction-local view of the seeded synthetic capacity window.
UPDATE hospital.capacity_projections
SET observed_at=statement_timestamp()-interval '1 minute',
    fresh_until=CASE facility_id
      WHEN '63000000-0000-4000-8000-000000000003'::uuid THEN statement_timestamp()-interval '1 second'
      ELSE statement_timestamp()+interval '10 minutes'
    END;

DO $$
DECLARE
  forced_count integer;
  discovered integer;
  relation_name text;
  matched uuid;
  exact_boundary timestamptz;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') THEN
    RAISE EXCEPTION 'PostGIS extension is missing';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='identity' AND table_name='facilities' AND column_name='location' AND udt_name='geography'
  ) OR NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='identity' AND table_name='patients' AND column_name='blood_group'
  ) THEN
    RAISE EXCEPTION 'canonical geography or blood-group expansion is missing';
  END IF;
  IF to_regclass('hospital.capacity_projections') IS NULL
    OR to_regclass('platform.sos_incidents') IS NULL
    OR to_regclass('platform.emergency_share_links') IS NULL
    OR to_regclass('platform.synthetic_message_receipts') IS NULL
    OR to_regclass('platform.feature_flags') IS NULL
    OR to_regclass('identity.callback_contact_verifications') IS NULL THEN
    RAISE EXCEPTION '006 physical tables are incomplete';
  END IF;
  SELECT count(*) INTO forced_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE (n.nspname,c.relname) IN (
    ('hospital','capacity_projections'),('platform','sos_incidents'),
    ('platform','emergency_share_links'),('platform','feature_flags'),
    ('platform','synthetic_message_receipts'),
    ('identity','callback_contact_verifications')
  ) AND c.relrowsecurity AND c.relforcerowsecurity;
  IF forced_count<>6 THEN RAISE EXCEPTION 'every 006 table must force RLS'; END IF;
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname='shifaa_api')
    OR (SELECT rolbypassrls FROM pg_roles WHERE rolname='shifaa_worker') THEN
    RAISE EXCEPTION 'online role bypasses RLS';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname='identity' AND indexname='facilities_location_gist' AND indexdef ILIKE '%USING gist%'
  ) THEN RAISE EXCEPTION 'facility geography GiST index missing'; END IF;
  IF EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='hospital' AND table_name='capacity_projections'
      AND column_name ~* 'patient|ward|bed|admission|clinical|diagnos'
  ) THEN RAISE EXCEPTION 'capacity projection contains prohibited detail'; END IF;
  IF EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='platform' AND table_name='emergency_share_links'
      AND column_name ~* 'plain|raw|token_value|token_url'
  ) THEN RAISE EXCEPTION 'plaintext share-token column exists'; END IF;
  IF to_regclass('platform.emergency_profile') IS NOT NULL
    OR to_regclass('platform.emergency_profile_projections') IS NOT NULL
    OR to_regclass('clinical.allergies') IS NOT NULL
    OR to_regclass('clinical.medication_statements') IS NOT NULL
    OR to_regclass('clinical.conditions') IS NOT NULL THEN
    RAISE EXCEPTION '006 introduced a shadow or later clinical source';
  END IF;
  IF (SELECT blood_group FROM identity.patients WHERE id='61000000-0000-4000-8000-000000000001')<>'O+' THEN
    RAISE EXCEPTION 'synthetic canonical blood group seed missing';
  END IF;
  IF EXISTS(SELECT 1 FROM platform.feature_flags WHERE environment='production' AND enabled) THEN
    RAISE EXCEPTION 'a production 006 feature flag is enabled';
  END IF;
  IF (SELECT count(*) FROM platform.feature_flags WHERE environment IN ('local','ci') AND enabled)<>10 THEN
    RAISE EXCEPTION 'local/CI feature flags are incomplete';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM platform.notification_template_releases t
    WHERE t.template_code='SOS_LIFE_SAFETY' AND t.status='published'
      AND t.allowed_recipient_types=ARRAY['emergency_contact']::text[]
      AND NOT (t.allowed_field_schema->'required' ? 'location')
      AND NOT (t.allowed_field_schema->'required' ? 'location_precision')
      AND t.allowed_field_schema->'properties' ?& ARRAY['location','location_precision']
  ) THEN RAISE EXCEPTION 'SOS template does not support consent precision none/coarse/exact'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='platform' AND table_name='notifications' AND column_name='recipient_emergency_contact_id'
  ) THEN RAISE EXCEPTION 'Emergency Contact notification recipient column missing'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='platform.notification_delivery_attempts'::regclass AND c.contype='u'
      AND pg_get_constraintdef(c.oid)='UNIQUE (provider_idempotency_key)'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='platform.notification_delivery_attempts'::regclass AND c.contype='u'
      AND pg_get_constraintdef(c.oid)='UNIQUE (notification_id, attempt_number)'
  ) OR to_regclass('platform.notification_attempt_provider_key_idx') IS NULL THEN
    RAISE EXCEPTION 'stable provider-key retry indexes are incorrect';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM identity.callback_contact_verifications v
    JOIN identity.people p ON p.id=v.person_id AND p.phone_e164=v.phone_e164
    WHERE v.person_id='60000000-0000-4000-8000-000000000001'
      AND v.source_code='synthetic_seed' AND v.revoked_at IS NULL
      AND v.verified_at<=statement_timestamp()
  ) THEN RAISE EXCEPTION 'objective synthetic callback verification is missing'; END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'platform.capacity_count_band','platform.search_discovery_facilities','platform.get_discovery_facility','platform.callback_source_is_verified','platform.create_sos_incident_record',
    'platform.accept_sos_prearrival','platform.close_sos_incident',
    'platform.create_emergency_share_record','platform.revoke_emergency_share',
    'platform.consume_emergency_share','platform.claim_next_sos_contact_event',
    'platform.complete_sos_contact_event','platform.sos_contact_delivery_status',
    'platform.deliver_local_synthetic_message'
  ] LOOP
    IF to_regprocedure(relation_name||CASE relation_name
      WHEN 'platform.capacity_count_band' THEN '(text,integer)'
      WHEN 'platform.search_discovery_facilities' THEN '(double precision,double precision,integer,text,text,text,double precision,uuid,integer)'
      WHEN 'platform.get_discovery_facility' THEN '(uuid)'
      WHEN 'platform.callback_source_is_verified' THEN '(uuid,uuid,text)'
      WHEN 'platform.create_sos_incident_record' THEN '(uuid,uuid,double precision,double precision,text,text,text,integer,text)'
      WHEN 'platform.accept_sos_prearrival' THEN '(uuid,uuid,integer,text)'
      WHEN 'platform.close_sos_incident' THEN '(uuid,integer,text)'
      WHEN 'platform.create_emergency_share_record' THEN '(uuid,uuid,bytea,text[],timestamp with time zone)'
      WHEN 'platform.revoke_emergency_share' THEN '(uuid,integer)'
      WHEN 'platform.consume_emergency_share' THEN '(bytea,uuid)'
      WHEN 'platform.claim_next_sos_contact_event' THEN '(text,integer)'
      WHEN 'platform.complete_sos_contact_event' THEN '(uuid,text,text,text,timestamp with time zone)'
      WHEN 'platform.deliver_local_synthetic_message' THEN '(text,text,text)'
      ELSE '(uuid)' END) IS NULL THEN
      RAISE EXCEPTION 'required helper % is missing',relation_name;
    END IF;
  END LOOP;
  IF platform.capacity_count_band(NULL,NULL)<>'unknown'
    OR platform.capacity_count_band('unknown',0)<>'unknown'
    OR platform.capacity_count_band('unavailable',0)<>'none'
    OR platform.capacity_count_band('available',1)<>'one_to_four'
    OR platform.capacity_count_band('available',4)<>'one_to_four'
    OR platform.capacity_count_band('available',5)<>'five_to_nine'
    OR platform.capacity_count_band('available',9)<>'five_to_nine'
    OR platform.capacity_count_band('available',10)<>'ten_or_more' THEN
    RAISE EXCEPTION 'capacity count-band boundaries are incorrect';
  END IF;
  SELECT count(*) INTO discovered
  FROM platform.search_discovery_facilities(31.2005,30.1005,25000,NULL,NULL,NULL,NULL,NULL,100);
  IF discovered<>4 THEN RAISE EXCEPTION 'expected four eligible facility projections, found %',discovered; END IF;
  IF EXISTS(
    SELECT 1 FROM platform.search_discovery_facilities(31.2005,30.1005,25000,NULL,NULL,NULL,NULL,NULL,100)
    WHERE facility_id IN ('63000000-0000-4000-8000-000000000004','63000000-0000-4000-8000-000000000006')
  ) THEN RAISE EXCEPTION 'suspended or unlicensed facility became discoverable'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM platform.search_discovery_facilities(31.2005,30.1005,25000,NULL,NULL,NULL,NULL,NULL,100)
    WHERE facility_id='63000000-0000-4000-8000-000000000001' AND capacity_count_band='five_to_nine'
  ) OR NOT EXISTS(
    SELECT 1 FROM platform.search_discovery_facilities(31.2005,30.1005,25000,NULL,NULL,NULL,NULL,NULL,100)
    WHERE facility_id='63000000-0000-4000-8000-000000000002' AND capacity_count_band='one_to_four'
  ) OR NOT EXISTS(
    SELECT 1 FROM platform.search_discovery_facilities(31.2005,30.1005,25000,NULL,NULL,NULL,NULL,NULL,100)
    WHERE facility_id='63000000-0000-4000-8000-000000000005' AND capacity_count_band='unknown'
  ) THEN RAISE EXCEPTION 'public capacity count bands are not closed or deterministic'; END IF;
  IF (SELECT count_band FROM platform.get_discovery_capacity('63000000-0000-4000-8000-000000000001'))<>'five_to_nine' THEN
    RAISE EXCEPTION 'capacity endpoint band does not match discovery projection';
  END IF;
  SELECT fresh_until INTO exact_boundary FROM hospital.capacity_projections WHERE facility_id='63000000-0000-4000-8000-000000000001';
  matched:=platform.find_sos_match(31.2005,30.1005,25000,'synthetic_seed',exact_boundary);
  IF matched<>'63000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'exact freshness boundary did not qualify'; END IF;
  IF platform.find_sos_match(31.2005,30.1005,25000,'synthetic_seed',exact_boundary+interval '1 microsecond')='63000000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'capacity qualified after exact freshness boundary';
  END IF;
  IF platform.find_sos_match(31.2005,30.1005,25000,NULL,statement_timestamp()) IS NOT NULL THEN
    RAISE EXCEPTION 'missing allowed source did not fail closed';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO hospital.capacity_projections(facility_id,emergency_available_count,emergency_held_count,signal,observed_at,fresh_until,source_code)
    VALUES('63000000-0000-4000-8000-000000000005',1,0,'available',statement_timestamp(),statement_timestamp()+interval '1 minute','synthetic_seed');
    RAISE EXCEPTION 'non-hospital capacity projection accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO hospital.capacity_projections(facility_id,emergency_available_count,emergency_held_count,signal,observed_at,fresh_until,source_code)
    VALUES('63000000-0000-4000-8000-000000000006',0,0,'available',statement_timestamp(),statement_timestamp()+interval '1 minute','synthetic_seed');
    RAISE EXCEPTION 'available signal with zero capacity accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000001',true);
SELECT set_config('shifaa.actor_role','PAT',true);
SELECT set_config('shifaa.aal','1',true);
SELECT set_config('shifaa.purposes','emergency_care',true);
SELECT set_config('shifaa.patient_context','61000000-0000-4000-8000-000000000001',true);
SELECT set_config('shifaa.environment','local',true);

SELECT platform.create_sos_incident_record(
  '67000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',
  31.2005,30.1005,'medical_emergency','all_confirmed','patient_verified_contact',25000,'synthetic_seed'
);
DO $$
BEGIN
  IF (SELECT status FROM platform.sos_incidents WHERE id='67000000-0000-4000-8000-000000000001')<>'matched' THEN
    RAISE EXCEPTION 'synthetic SOS did not persist one informational match';
  END IF;
  BEGIN
    PERFORM platform.create_sos_incident_record(
      '67000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001',
      31.2005,30.1005,'medical_emergency','none','patient_verified_contact',25000,'synthetic_seed'
    );
    RAISE EXCEPTION 'second active patient incident accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

SELECT platform.create_emergency_share_record(
  '68000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001',
  decode(repeat('81',32),'hex'),ARRAY['blood_group','confirmed_allergies','active_dispensed_medicines','chronic_conditions','emergency_notes'],
  statement_timestamp()+interval '29 minutes'
);
DO $$
DECLARE consumed record;
BEGIN
  SELECT * INTO consumed FROM platform.consume_emergency_share(decode(repeat('81',32),'hex'),'68100000-0000-4000-8000-000000000001');
  IF consumed.outcome<>'success' OR consumed.denial_code IS NOT NULL
    OR consumed.share_id IS NULL OR consumed.blood_group<>'O+' OR consumed.expires_at<=statement_timestamp()
    OR consumed.expires_at>statement_timestamp()+interval '30 minutes' THEN
    RAISE EXCEPTION 'one-use share did not return the available bounded blood-group projection';
  END IF;
  IF consumed.unavailable_fields<>ARRAY['active_dispensed_medicines','chronic_conditions','confirmed_allergies','emergency_notes']::text[] THEN
    RAISE EXCEPTION 'missing clinical sources were not reported unavailable: %',consumed.unavailable_fields;
  END IF;
  SELECT * INTO consumed FROM platform.consume_emergency_share(decode(repeat('81',32),'hex'),'68100000-0000-4000-8000-000000000002');
  IF consumed.outcome<>'denied' OR consumed.denial_code<>'emergency-share-expired'
    OR consumed.share_id IS NOT NULL OR consumed.blood_group IS NOT NULL THEN
    RAISE EXCEPTION 'one-use share replay did not return the uniform data-free denial';
  END IF;
  SELECT * INTO consumed FROM platform.consume_emergency_share(decode(repeat('99',32),'hex'),'68100000-0000-4000-8000-000000000003');
  IF consumed.outcome<>'denied' OR consumed.share_id IS NOT NULL THEN
    RAISE EXCEPTION 'unknown share did not return the uniform data-free denial';
  END IF;
  IF (SELECT count(*) FROM audit.events WHERE request_id IN (
    '68100000-0000-4000-8000-000000000001','68100000-0000-4000-8000-000000000002','68100000-0000-4000-8000-000000000003'
  ))<>3 THEN RAISE EXCEPTION 'share success/denial audits did not persist as transaction results'; END IF;
  IF EXISTS(
    SELECT 1 FROM audit.events
    WHERE request_id IN ('68100000-0000-4000-8000-000000000001','68100000-0000-4000-8000-000000000002','68100000-0000-4000-8000-000000000003')
      AND metadata::text ~* '81818181|token|digest|O\\+'
  ) THEN RAISE EXCEPTION 'share audit leaked token/digest/payload'; END IF;
  BEGIN
    PERFORM platform.create_emergency_share_record(
      '68000000-0000-4000-8000-000000000002','67000000-0000-4000-8000-000000000001',
      decode(repeat('82',32),'hex'),ARRAY['blood_group','blood_group'],statement_timestamp()+interval '5 minutes'
    );
    RAISE EXCEPTION 'duplicate share scope accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM platform.create_emergency_share_record(
      '68000000-0000-4000-8000-000000000003','67000000-0000-4000-8000-000000000001',
      decode(repeat('83',32),'hex'),ARRAY['blood_group'],statement_timestamp()+interval '31 minutes'
    );
    RAISE EXCEPTION 'share expiry beyond thirty minutes accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

SELECT platform.create_emergency_share_record(
  '68000000-0000-4000-8000-000000000004','67000000-0000-4000-8000-000000000001',
  decode(repeat('84',32),'hex'),ARRAY['blood_group'],statement_timestamp()+interval '5 minutes'
);
SELECT platform.revoke_emergency_share('68000000-0000-4000-8000-000000000004',1);
INSERT INTO platform.emergency_share_links(
  id,incident_id,created_by_user_id,token_digest,scope_fields,expires_at,created_at,updated_at
) VALUES(
  '68000000-0000-4000-8000-000000000005','67000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',decode(repeat('85',32),'hex'),ARRAY['blood_group'],
  statement_timestamp()-interval '1 minute',statement_timestamp()-interval '2 minutes',statement_timestamp()-interval '2 minutes'
);
SELECT platform.create_emergency_share_record(
  '68000000-0000-4000-8000-000000000006','67000000-0000-4000-8000-000000000001',
  decode(repeat('86',32),'hex'),ARRAY['blood_group'],statement_timestamp()+interval '5 minutes'
);
SELECT platform.create_emergency_share_record(
  '68000000-0000-4000-8000-000000000007','67000000-0000-4000-8000-000000000001',
  decode(repeat('87',32),'hex'),ARRAY['blood_group'],statement_timestamp()+interval '5 minutes'
);
DO $$
DECLARE denied record;
BEGIN
  SELECT * INTO denied FROM platform.consume_emergency_share(decode(repeat('84',32),'hex'),'68100000-0000-4000-8000-000000000004');
  IF denied.outcome<>'denied' OR denied.share_id IS NOT NULL THEN RAISE EXCEPTION 'revoked share denial leaked data'; END IF;
  SELECT * INTO denied FROM platform.consume_emergency_share(decode(repeat('85',32),'hex'),'68100000-0000-4000-8000-000000000005');
  IF denied.outcome<>'denied' OR denied.share_id IS NOT NULL THEN RAISE EXCEPTION 'expired share denial leaked data'; END IF;
END $$;

-- Exercise the worker candidate contract for every separately consented precision.
INSERT INTO identity.emergency_contacts(
  id,subject_patient_id,created_by_person_id,display_name_ciphertext,display_name_nonce,display_name_authentication_tag,display_name_key_version,
  phone_ciphertext,phone_nonce,phone_authentication_tag,phone_key_version,masked_phone,phone_blind_index,preferred_locale,location_precision,
  status,invite_token_digest,invite_key_version,invite_expires_at
) VALUES
 ('66000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',decode('0603','hex'),decode(repeat('71',12),'hex'),decode(repeat('72',16),'hex'),1,decode('0604','hex'),decode(repeat('73',12),'hex'),decode(repeat('74',16),'hex'),1,'+999••••0602',decode(repeat('75',32),'hex'),'en-EG','none','pending',decode(repeat('76',32),'hex'),1,statement_timestamp()+interval '1 day'),
 ('66000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',decode('0605','hex'),decode(repeat('77',12),'hex'),decode(repeat('78',16),'hex'),1,decode('0606','hex'),decode(repeat('79',12),'hex'),decode(repeat('7a',16),'hex'),1,'+999••••0603',decode(repeat('7b',32),'hex'),'en-EG','exact','pending',decode(repeat('7c',32),'hex'),1,statement_timestamp()+interval '1 day');
SELECT * FROM platform.respond_emergency_contact_invite(decode(repeat('76',32),'hex'),'confirmed');
SELECT * FROM platform.respond_emergency_contact_invite(decode(repeat('7c',32),'hex'),'confirmed');
DO $$
BEGIN
  IF (SELECT count(*) FROM platform.sos_contact_delivery_candidates('67000000-0000-4000-8000-000000000001'))<>3 THEN
    RAISE EXCEPTION 'not all three confirmed consent precisions projected';
  END IF;
  IF EXISTS(
    SELECT 1 FROM platform.sos_contact_delivery_candidates('67000000-0000-4000-8000-000000000001')
    WHERE location_precision='none' AND location_value IS NOT NULL
  ) THEN RAISE EXCEPTION 'none precision disclosed a location'; END IF;
  IF EXISTS(
    SELECT 1 FROM platform.sos_contact_delivery_candidates('67000000-0000-4000-8000-000000000001')
    WHERE location_precision IN ('coarse','exact') AND location_value IS NULL
  ) THEN RAISE EXCEPTION 'consented coarse/exact projection omitted location'; END IF;
END $$;

SELECT platform.close_sos_incident('67000000-0000-4000-8000-000000000001',1,'no_longer_needed');
DO $$
DECLARE denied record; revoked platform.emergency_share_links;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM platform.sos_incidents WHERE id='67000000-0000-4000-8000-000000000001' AND status='closed' AND version=2) THEN
    RAISE EXCEPTION 'SOS close transition/version failed';
  END IF;
  SELECT * INTO denied FROM platform.consume_emergency_share(decode(repeat('86',32),'hex'),'68100000-0000-4000-8000-000000000006');
  IF denied.outcome<>'denied' OR denied.share_id IS NOT NULL THEN RAISE EXCEPTION 'closed-incident share denial leaked data'; END IF;
  SELECT * INTO revoked FROM platform.revoke_emergency_share('68000000-0000-4000-8000-000000000007',1);
  IF revoked.revoked_at IS NULL OR revoked.version<>2 THEN RAISE EXCEPTION 'share could not be revoked after incident close'; END IF;
  BEGIN
    UPDATE platform.sos_incidents SET status='matched' WHERE id='67000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'closed SOS reopened';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

ROLLBACK;
