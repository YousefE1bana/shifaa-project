BEGIN;

-- Forward-only privacy guards: authorize status-independent resource scope before
-- exposing lifecycle/version state in encounter and referral operations.

CREATE OR REPLACE FUNCTION clinical.update_encounter_api_v1(
  p_encounter_id uuid,p_expected_version integer,p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  encounter_row clinical.encounters%ROWTYPE;
  encounter_version integer;
  condition_ids_value uuid[];
  observation_ids_value uuid[];
  order_ids_value uuid[];
  condition_ids_supplied boolean := false;
  observation_ids_supplied boolean := false;
  order_ids_supplied boolean := false;
  interval_count integer := 0;
  matched_interval_count integer := 0;
  participant_target record;
  interval_end timestamptz;
  projection jsonb;
  response_value jsonb;
BEGIN
  IF actor IS NULL OR platform.context_role() IS DISTINCT FROM 'CLN'
     OR platform.context_action() IS DISTINCT FROM 'updateEncounter'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current treating-clinician context is required' USING ERRCODE='42501';
  END IF;
  IF p_encounter_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_input IS NULL OR pg_catalog.jsonb_typeof(p_input)<>'object'
     OR p_input='{}'::jsonb
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(p_input) AS supplied(key)
       WHERE supplied.key NOT IN ('conditionIds','observationIds','orderIds','participantIntervalsEnd')
     ) THEN
    RAISE EXCEPTION 'updateEncounter request is invalid' USING ERRCODE='22023';
  END IF;

  SELECT record_id,is_new,response_body
    INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('PATCH','/v1/encounters/{encounterId}');
  IF NOT idem_new THEN
    IF idem_response->>'id' IS DISTINCT FROM p_encounter_id::text THEN
      RAISE EXCEPTION 'idempotency key reused for another encounter' USING ERRCODE='23505';
    END IF;
    IF NOT clinical.feature_010_current_encounter_clinician_v1(p_encounter_id,false) THEN
      RAISE EXCEPTION 'encounter was not found' USING ERRCODE='P0002';
    END IF;
    IF NOT clinical.feature_010_authorize_v1('updateEncounter',p_encounter_id) THEN
      RAISE EXCEPTION 'current treating-clinician scope is required for replay' USING ERRCODE='42501';
    END IF;
    RETURN idem_response;
  END IF;

  SELECT * INTO encounter_row
  FROM clinical.encounters encounter
  WHERE encounter.id=p_encounter_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'encounter was not found' USING ERRCODE='P0002';
  END IF;
  IF NOT clinical.feature_010_current_encounter_clinician_v1(p_encounter_id,false) THEN
    RAISE EXCEPTION 'encounter was not found' USING ERRCODE='P0002';
  END IF;
  IF encounter_row.status<>'open' THEN
    RAISE EXCEPTION 'encounter is no longer open' USING ERRCODE='55000';
  END IF;
  IF NOT clinical.feature_010_authorize_v1('updateEncounter',p_encounter_id) THEN
    RAISE EXCEPTION 'current treating-clinician scope is required' USING ERRCODE='42501';
  END IF;
  IF encounter_row.version<>p_expected_version THEN
    RAISE EXCEPTION 'encounter version changed' USING ERRCODE='40001';
  END IF;

  condition_ids_value := encounter_row.condition_ids;
  observation_ids_value := encounter_row.observation_ids;
  order_ids_value := encounter_row.order_ids;
  IF p_input ? 'conditionIds' THEN
    condition_ids_supplied := true;
    IF pg_catalog.jsonb_typeof(p_input->'conditionIds')<>'array' THEN
      RAISE EXCEPTION 'conditionIds must be an array' USING ERRCODE='22023';
    END IF;
    BEGIN
      SELECT COALESCE(pg_catalog.array_agg(item.value::uuid ORDER BY item.ordinality),'{}'::uuid[])
        INTO condition_ids_value
      FROM pg_catalog.jsonb_array_elements_text(p_input->'conditionIds') WITH ORDINALITY AS item(value,ordinality);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'conditionIds contains an invalid identifier' USING ERRCODE='22023';
    END;
    IF EXISTS (
         SELECT 1 FROM pg_catalog.unnest(condition_ids_value) AS requested(condition_id)
         LEFT JOIN clinical.conditions condition_row ON condition_row.id=requested.condition_id
         LEFT JOIN identity.patients patient_record ON patient_record.id=condition_row.patient_id
         WHERE patient_record.person_id IS DISTINCT FROM encounter_row.patient_person_id
       ) THEN
      RAISE EXCEPTION 'condition reference must exist for this encounter patient' USING ERRCODE='22023';
    END IF;
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.unnest(condition_ids_value))<>
       (SELECT pg_catalog.count(DISTINCT value) FROM pg_catalog.unnest(condition_ids_value) AS values(value)) THEN
      RAISE EXCEPTION 'conditionIds must be unique' USING ERRCODE='22023';
    END IF;
  END IF;

  IF p_input ? 'observationIds' THEN
    observation_ids_supplied := true;
    IF pg_catalog.jsonb_typeof(p_input->'observationIds')<>'array' THEN
      RAISE EXCEPTION 'observationIds must be an array' USING ERRCODE='22023';
    END IF;
    IF pg_catalog.jsonb_array_length(p_input->'observationIds')>0 THEN
      RAISE EXCEPTION 'observation references are unavailable in this checkpoint' USING ERRCODE='22023';
    END IF;
    observation_ids_value := '{}'::uuid[];
  END IF;
  IF p_input ? 'orderIds' THEN
    order_ids_supplied := true;
    IF pg_catalog.jsonb_typeof(p_input->'orderIds')<>'array' THEN
      RAISE EXCEPTION 'orderIds must be an array' USING ERRCODE='22023';
    END IF;
    IF pg_catalog.jsonb_array_length(p_input->'orderIds')>0 THEN
      RAISE EXCEPTION 'order references are unavailable in this checkpoint' USING ERRCODE='22023';
    END IF;
    order_ids_value := '{}'::uuid[];
  END IF;

  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  projection := clinical.feature_010_get_encounter_projection_v1(p_encounter_id);
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  IF projection IS NULL THEN
    RAISE EXCEPTION 'encounter projection is unavailable' USING ERRCODE='42501';
  END IF;

  IF p_input ? 'participantIntervalsEnd' THEN
    IF pg_catalog.jsonb_typeof(p_input->'participantIntervalsEnd')<>'array'
       OR pg_catalog.jsonb_array_length(p_input->'participantIntervalsEnd')<1 THEN
      RAISE EXCEPTION 'participantIntervalsEnd must be a non-empty array' USING ERRCODE='22023';
    END IF;
    BEGIN
      SELECT pg_catalog.count(*)::integer INTO interval_count
      FROM pg_catalog.jsonb_array_elements(p_input->'participantIntervalsEnd') AS interval(value)
      WHERE pg_catalog.jsonb_typeof(interval.value)='object'
        AND interval.value ? 'personId'
        AND interval.value ? 'roleCode'
        AND interval.value ? 'startedAt'
        AND (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(interval.value))=3;
      IF interval_count<>pg_catalog.jsonb_array_length(p_input->'participantIntervalsEnd') THEN
        RAISE EXCEPTION 'participant interval identity is invalid' USING ERRCODE='22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_input->'participantIntervalsEnd') AS target("personId" uuid,"roleCode" text,"startedAt" timestamptz)
        WHERE target."personId"=encounter_row.responsible_clinician_id
           OR target."roleCode"='responsible_clinician'
      ) THEN
        RAISE EXCEPTION 'the responsible clinician interval cannot end while the encounter is open' USING ERRCODE='42501';
      END IF;
      FOR participant_target IN
        SELECT target."personId" AS person_id,target."roleCode" AS role_code,target."startedAt" AS started_at
        FROM pg_catalog.jsonb_to_recordset(p_input->'participantIntervalsEnd') AS target("personId" uuid,"roleCode" text,"startedAt" timestamptz)
        ORDER BY target."personId",target."roleCode",target."startedAt"
      LOOP
        SELECT participant.started_at INTO interval_end
        FROM clinical.encounter_participants participant
        WHERE participant.encounter_id=p_encounter_id
          AND participant.person_id=participant_target.person_id
          AND participant.role_code=participant_target.role_code
          AND participant.started_at=participant_target.started_at
          AND participant.ended_at IS NULL
          AND participant.started_at<=platform.context_now()
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'participant interval is no longer active' USING ERRCODE='55000';
        END IF;
        interval_end := GREATEST(pg_catalog.clock_timestamp(),interval_end+interval '1 microsecond');
        UPDATE clinical.encounter_participants participant
        SET ended_at=interval_end,version=participant.version+1,updated_at=interval_end
        WHERE participant.encounter_id=p_encounter_id
          AND participant.person_id=participant_target.person_id
          AND participant.role_code=participant_target.role_code
          AND participant.started_at=participant_target.started_at
          AND participant.ended_at IS NULL;
        matched_interval_count := matched_interval_count+1;
      END LOOP;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'participant interval identity is invalid' USING ERRCODE='22023';
    END;
    IF matched_interval_count<>interval_count THEN
      RAISE EXCEPTION 'participant interval identity is not active' USING ERRCODE='40001';
    END IF;
  END IF;

  UPDATE clinical.encounters encounter
  SET condition_ids=CASE WHEN condition_ids_supplied THEN condition_ids_value ELSE encounter.condition_ids END,
      observation_ids=CASE WHEN observation_ids_supplied THEN observation_ids_value ELSE encounter.observation_ids END,
      order_ids=CASE WHEN order_ids_supplied THEN order_ids_value ELSE encounter.order_ids END,
      version=encounter.version+1,
      updated_at=pg_catalog.clock_timestamp()
  WHERE encounter.id=p_encounter_id AND encounter.status='open' AND encounter.version=p_expected_version
  RETURNING encounter.version INTO encounter_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'encounter version changed' USING ERRCODE='40001';
  END IF;

  response_value := (projection-'notes') || pg_catalog.jsonb_build_object(
    'version',encounter_version,
    'conditionIds',pg_catalog.to_jsonb(condition_ids_value),
    'observationIds',pg_catalog.to_jsonb(observation_ids_value),
    'orderIds',pg_catalog.to_jsonb(order_ids_value),
    'participants',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'personId',participant.person_id,'roleCode',participant.role_code,
        'startedAt',participant.started_at,'endedAt',participant.ended_at
      )) ORDER BY participant.started_at,participant.person_id,participant.role_code)
      FROM clinical.encounter_participants participant
      WHERE participant.encounter_id=p_encounter_id
    ),'[]'::jsonb)
  );

  PERFORM clinical.record_mutation_effect_v2(
    'clinical.encounter.updated.v1','encounter.updated','encounter',
    p_encounter_id,encounter_version,encounter_row.facility_id,encounter_row.patient_person_id
  );
  PERFORM clinical.complete_mutation_v1(idem_id,200,'encounter',p_encounter_id,response_value);
  RETURN response_value;
END $$;

CREATE OR REPLACE FUNCTION clinical.sign_encounter_note_api_v1(
  p_encounter_id uuid,p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  encounter_row clinical.encounters%ROWTYPE;
  superseded_row clinical.clinical_notes%ROWTYPE;
  note_id uuid;
  signed_at_value timestamptz;
  supersedes_id_value uuid;
  ciphertext_value bytea;
  replay_ciphertext_value bytea;
  response_value jsonb;
  visibility_value text;
BEGIN
  IF actor IS NULL OR platform.context_role() IS DISTINCT FROM 'CLN'
     OR platform.context_action() IS DISTINCT FROM 'signEncounterNote'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current treating-clinician context is required' USING ERRCODE='42501';
  END IF;
  IF p_encounter_id IS NULL OR p_input IS NULL OR pg_catalog.jsonb_typeof(p_input)<>'object'
     OR NOT (p_input ?& ARRAY['noteType','visibility','bodyCiphertext']::text[])
     OR (p_input-ARRAY['noteType','visibility','supersedesId','bodyCiphertext']::text[])<>'{}'::jsonb
     OR pg_catalog.jsonb_typeof(p_input->'noteType')<>'string'
     OR pg_catalog.jsonb_typeof(p_input->'visibility')<>'string'
     OR pg_catalog.jsonb_typeof(p_input->'bodyCiphertext')<>'string'
     OR NULLIF(pg_catalog.btrim(p_input->>'noteType'),'') IS NULL
     OR pg_catalog.octet_length(pg_catalog.btrim(p_input->>'noteType'))>120
     OR p_input->>'visibility' NOT IN ('private','patient_visible') THEN
    RAISE EXCEPTION 'signEncounterNote request is invalid' USING ERRCODE='22023';
  END IF;
  IF p_input ? 'supersedesId'
     AND (pg_catalog.jsonb_typeof(p_input->'supersedesId')<>'string'
       OR (p_input->>'supersedesId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'signEncounterNote supersedesId is invalid' USING ERRCODE='22023';
  END IF;
  IF (p_input->>'bodyCiphertext') !~ '^[A-Za-z0-9+/]*={0,2}$'
     OR pg_catalog.length(p_input->>'bodyCiphertext') % 4 <> 0 THEN
    RAISE EXCEPTION 'signEncounterNote protected body envelope is invalid' USING ERRCODE='22023';
  END IF;
  BEGIN
    IF p_input ? 'supersedesId' THEN
      supersedes_id_value := (p_input->>'supersedesId')::uuid;
    END IF;
    ciphertext_value := pg_catalog.decode(p_input->>'bodyCiphertext','base64');
  EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN
    RAISE EXCEPTION 'signEncounterNote protected body envelope is invalid' USING ERRCODE='22023';
  END;
  IF pg_catalog.octet_length(ciphertext_value)<30 OR pg_catalog.get_byte(ciphertext_value,0)<>1 THEN
    RAISE EXCEPTION 'signEncounterNote protected body envelope is invalid' USING ERRCODE='22023';
  END IF;
  visibility_value := p_input->>'visibility';

  SELECT record_id,is_new,response_body
    INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/encounters/{encounterId}/notes');

  SELECT * INTO encounter_row
  FROM clinical.encounters encounter
  WHERE encounter.id=p_encounter_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'encounter was not found' USING ERRCODE='P0002';
  END IF;
  IF NOT clinical.feature_010_current_encounter_clinician_v1(p_encounter_id,false) THEN
    RAISE EXCEPTION 'encounter was not found' USING ERRCODE='P0002';
  END IF;
  IF NOT clinical.feature_010_authorize_v1('signEncounterNote',p_encounter_id) THEN
    RAISE EXCEPTION 'current treating-clinician scope is required' USING ERRCODE='42501';
  END IF;

  IF NOT idem_new THEN
    IF pg_catalog.jsonb_typeof(idem_response)<>'object'
       OR idem_response->>'encounterId' IS DISTINCT FROM p_encounter_id::text
       OR idem_response->>'authorId' IS DISTINCT FROM actor::text
       OR NULLIF(idem_response->>'id','') IS NULL
       OR NULLIF(idem_response->>'noteType','') IS NULL
       OR idem_response->>'visibility' NOT IN ('private','patient_visible')
       OR NULLIF(idem_response->>'signedAt','') IS NULL
       OR NULLIF(idem_response->>'bodyCiphertext','') IS NULL THEN
      RAISE EXCEPTION 'idempotency key reused for another signed note' USING ERRCODE='23505';
    END IF;
    BEGIN
      replay_ciphertext_value := pg_catalog.decode(idem_response->>'bodyCiphertext','base64');
    EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN
      RAISE EXCEPTION 'stored signed note response is invalid' USING ERRCODE='55000';
    END;
    IF pg_catalog.octet_length(replay_ciphertext_value)<30
       OR pg_catalog.get_byte(replay_ciphertext_value,0)<>1 THEN
      RAISE EXCEPTION 'stored signed note response is invalid' USING ERRCODE='55000';
    END IF;
    IF idem_response ? 'supersedesId' THEN
      SELECT * INTO superseded_row
      FROM clinical.clinical_notes note
      WHERE note.id=(idem_response->>'supersedesId')::uuid
        AND note.encounter_id=p_encounter_id
      FOR UPDATE;
      IF NOT FOUND OR (superseded_row.author_person_id IS DISTINCT FROM actor
                        AND encounter_row.responsible_clinician_id IS DISTINCT FROM actor) THEN
        RAISE EXCEPTION 'current signer is not authorized to correct this note' USING ERRCODE='42501';
      END IF;
    END IF;
    RETURN idem_response;
  END IF;

  IF supersedes_id_value IS NOT NULL THEN
    SELECT * INTO superseded_row
    FROM clinical.clinical_notes note
    WHERE note.id=supersedes_id_value AND note.encounter_id=p_encounter_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'superseded note is not in this encounter' USING ERRCODE='42501';
    END IF;
    IF superseded_row.author_person_id IS DISTINCT FROM actor
       AND encounter_row.responsible_clinician_id IS DISTINCT FROM actor THEN
      RAISE EXCEPTION 'current signer is not authorized to correct this note' USING ERRCODE='42501';
    END IF;
  END IF;

  note_id := pg_catalog.gen_random_uuid();
  signed_at_value := platform.context_now();
  INSERT INTO clinical.clinical_notes(
    id,encounter_id,author_person_id,note_type,body_ciphertext,visibility_code,signed_at,supersedes_id
  ) VALUES (
    note_id,p_encounter_id,actor,pg_catalog.btrim(p_input->>'noteType'),ciphertext_value,
    visibility_value,signed_at_value,supersedes_id_value
  );

  response_value := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',note_id,
    'encounterId',p_encounter_id,
    'authorId',actor,
    'noteType',pg_catalog.btrim(p_input->>'noteType'),
    'visibility',visibility_value,
    'signedAt',signed_at_value,
    'supersedesId',supersedes_id_value,
    'bodyCiphertext',pg_catalog.encode(ciphertext_value,'base64')
  ));
  PERFORM clinical.record_mutation_effect_v2(
    'clinical.note.signed.v1','encounter.note_signed','clinical_note',
    note_id,1,encounter_row.facility_id,encounter_row.patient_person_id
  );
  PERFORM clinical.complete_mutation_v1(idem_id,201,'clinical_note',note_id,response_value);
  RETURN response_value;
END
$$;

CREATE OR REPLACE FUNCTION clinical.complete_encounter_api_v1(
  p_encounter_id uuid,p_expected_version integer,p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  encounter_row clinical.encounters%ROWTYPE;
  response_value jsonb;
BEGIN
  IF actor IS NULL OR platform.context_role() IS DISTINCT FROM 'CLN'
     OR platform.context_action() IS DISTINCT FROM 'completeEncounter'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current responsible-clinician context is required' USING ERRCODE='42501';
  END IF;
  IF p_encounter_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_input IS NULL OR pg_catalog.jsonb_typeof(p_input)<>'object'
     OR NOT (p_input ?& ARRAY['summary','structuralConfirmation']::text[])
     OR (p_input-ARRAY['summary','structuralConfirmation']::text[])<>'{}'::jsonb
     OR pg_catalog.jsonb_typeof(p_input->'summary')<>'string'
     OR NULLIF(pg_catalog.btrim(p_input->>'summary'),'') IS NULL
     OR pg_catalog.octet_length(p_input->>'summary')>4000
     OR p_input->'structuralConfirmation'<>'true'::jsonb THEN
    RAISE EXCEPTION 'completeEncounter requires a nonblank summary and explicit structural confirmation' USING ERRCODE='22023';
  END IF;

  -- begin_mutation_v1 locks the principal/key record and rejects changed-body
  -- reuse before checking the now-completed lifecycle state.
  SELECT record_id,is_new,response_body
    INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/encounters/{encounterId}/complete');
  IF NOT idem_new THEN
    IF idem_response->'encounter'->>'id' IS DISTINCT FROM p_encounter_id::text THEN
      RAISE EXCEPTION 'idempotency key reused for another encounter' USING ERRCODE='23505';
    END IF;
    SELECT * INTO encounter_row
    FROM clinical.encounters encounter
    WHERE encounter.id=p_encounter_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'encounter was not found' USING ERRCODE='P0002';
    END IF;
    IF NOT clinical.feature_010_current_encounter_clinician_v1(p_encounter_id,true) THEN
      RAISE EXCEPTION 'encounter was not found' USING ERRCODE='P0002';
    END IF;
    RETURN idem_response;
  END IF;

  SELECT * INTO encounter_row
  FROM clinical.encounters encounter
  WHERE encounter.id=p_encounter_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'encounter was not found' USING ERRCODE='P0002';
  END IF;
  IF NOT clinical.feature_010_current_encounter_clinician_v1(p_encounter_id,true) THEN
    RAISE EXCEPTION 'encounter was not found' USING ERRCODE='P0002';
  END IF;
  IF encounter_row.status<>'open' THEN
    RAISE EXCEPTION 'encounter is no longer open' USING ERRCODE='55000';
  END IF;
  IF NOT clinical.feature_010_authorize_v1('completeEncounter',p_encounter_id) THEN
    RAISE EXCEPTION 'linked appointment or queue is no longer eligible for completion' USING ERRCODE='55000';
  END IF;

  -- This C05 producer locks appointment -> queue -> encounter, rechecks the
  -- exact before-state/version and updates all three linked states atomically.
  response_value := clinical.complete_encounter_v1(
    p_encounter_id,p_expected_version,p_input
  );
  PERFORM clinical.record_mutation_effect_v2(
    'clinical.encounter.completed.v1','encounter.completed','encounter',
    p_encounter_id,(response_value->'encounter'->>'version')::integer,
    encounter_row.facility_id,encounter_row.patient_person_id
  );
  PERFORM clinical.complete_mutation_v1(
    idem_id,200,'encounter',p_encounter_id,response_value
  );
  RETURN response_value;
END $$;

CREATE OR REPLACE FUNCTION clinical.create_referral_api_v1(
  p_source_encounter_id uuid,p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  source_encounter clinical.encounters%ROWTYPE;
  appointment_row clinical.appointments%ROWTYPE;
  referral_row clinical.referrals%ROWTYPE;
  patient_record_id uuid;
  appointment_locked boolean := false;
  response_value jsonb;
BEGIN
  IF actor IS NULL OR platform.context_role() IS DISTINCT FROM 'CLN'
     OR platform.context_action() IS DISTINCT FROM 'createReferral'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current treating-clinician context is required' USING ERRCODE='42501';
  END IF;

  SELECT record_id,is_new,response_body
    INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/encounters/{encounterId}/referrals');
  IF NOT idem_new THEN
    IF idem_response->>'sourceEncounterId' IS DISTINCT FROM p_source_encounter_id::text THEN
      RAISE EXCEPTION 'idempotency key reused for another encounter' USING ERRCODE='23505';
    END IF;
    SELECT * INTO source_encounter
      FROM clinical.encounters encounter
      WHERE encounter.id=p_source_encounter_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source encounter was not found' USING ERRCODE='P0002';
    END IF;
    IF source_encounter.appointment_id IS NOT NULL THEN
      SELECT * INTO appointment_row
        FROM clinical.appointments appointment
        WHERE appointment.id=source_encounter.appointment_id
        FOR UPDATE;
      appointment_locked := FOUND;
    END IF;
    SELECT * INTO source_encounter
      FROM clinical.encounters encounter
      WHERE encounter.id=p_source_encounter_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source encounter was not found' USING ERRCODE='P0002';
    END IF;
    PERFORM 1
    FROM clinical.encounter_participants participant
    WHERE participant.encounter_id=p_source_encounter_id
      AND participant.person_id=actor
      AND participant.started_at<=platform.context_now()
      AND participant.ended_at IS NULL
    FOR SHARE;
    PERFORM 1
    FROM identity.facility_memberships membership
    JOIN identity.professional_licenses license
      ON license.id=membership.employment_license_id
     AND license.person_id=membership.person_id
    WHERE membership.facility_id=source_encounter.facility_id
      AND membership.person_id=actor
      AND membership.role_code='doctor'
      AND membership.membership_status='active'
      AND membership.valid_from<=platform.context_now()
      AND (membership.valid_until IS NULL OR membership.valid_until>platform.context_now())
      AND license.profession='doctor'
      AND license.status='verified'
      AND license.expires_on>=(platform.context_now() AT TIME ZONE 'UTC')::date
    FOR SHARE OF membership,license;
    IF NOT clinical.feature_010_current_encounter_clinician_v1(p_source_encounter_id,false) THEN
      RAISE EXCEPTION 'source encounter was not found' USING ERRCODE='P0002';
    END IF;
    RETURN idem_response;
  END IF;

  IF p_source_encounter_id IS NULL OR p_input IS NULL
     OR pg_catalog.jsonb_typeof(p_input)<>'object'
     OR NOT (p_input ?& ARRAY['targetSpecialty','reasonSummary']::text[])
     OR (p_input-ARRAY['targetSpecialty','targetFacilityId','targetDoctorId','reasonSummary','encounterType']::text[])<>'{}'::jsonb
     OR pg_catalog.jsonb_typeof(p_input->'targetSpecialty')<>'string'
     OR pg_catalog.jsonb_typeof(p_input->'reasonSummary')<>'string'
     OR NULLIF(pg_catalog.btrim(p_input->>'targetSpecialty'),'') IS NULL
     OR pg_catalog.char_length(p_input->>'targetSpecialty')>120
     OR NULLIF(pg_catalog.btrim(p_input->>'reasonSummary'),'') IS NULL
     OR ((p_input ? 'targetFacilityId') AND (
       pg_catalog.jsonb_typeof(p_input->'targetFacilityId') IS DISTINCT FROM 'string'
       OR p_input->>'targetFacilityId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ))
     OR ((p_input ? 'targetDoctorId') AND (
       pg_catalog.jsonb_typeof(p_input->'targetDoctorId') IS DISTINCT FROM 'string'
       OR p_input->>'targetDoctorId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ))
     OR ((p_input ? 'encounterType') AND pg_catalog.jsonb_typeof(p_input->'encounterType')<>'string')
     OR ((p_input ? 'encounterType') AND NULLIF(pg_catalog.btrim(p_input->>'encounterType'),'') IS NULL) THEN
    RAISE EXCEPTION 'createReferral requires a closed, nonblank specialty and reason summary' USING ERRCODE='22023';
  END IF;

  -- Keep the same appointment -> encounter lock order as the encounter
  -- lifecycle wrappers so referral creation cannot race encounter completion.
  SELECT * INTO source_encounter
    FROM clinical.encounters encounter
    WHERE encounter.id=p_source_encounter_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source encounter was not found' USING ERRCODE='P0002';
  END IF;
  IF source_encounter.appointment_id IS NOT NULL THEN
    SELECT * INTO appointment_row
      FROM clinical.appointments appointment
      WHERE appointment.id=source_encounter.appointment_id
      FOR UPDATE;
    appointment_locked := FOUND;
  END IF;
  SELECT * INTO source_encounter
    FROM clinical.encounters encounter
    WHERE encounter.id=p_source_encounter_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source encounter was not found' USING ERRCODE='P0002';
  END IF;
  -- Hide source lifecycle state until current treating-clinician scope has
  -- been revalidated under the same appointment -> encounter -> authority locks.
  PERFORM 1
  FROM clinical.encounter_participants participant
  WHERE participant.encounter_id=p_source_encounter_id
    AND participant.person_id=actor
    AND participant.started_at<=platform.context_now()
    AND participant.ended_at IS NULL
  FOR SHARE;
  PERFORM 1
  FROM identity.facility_memberships membership
  JOIN identity.professional_licenses license
    ON license.id=membership.employment_license_id
   AND license.person_id=membership.person_id
  WHERE membership.facility_id=source_encounter.facility_id
    AND membership.person_id=actor
    AND membership.role_code='doctor'
    AND membership.membership_status='active'
    AND membership.valid_from<=platform.context_now()
    AND (membership.valid_until IS NULL OR membership.valid_until>platform.context_now())
    AND license.profession='doctor'
    AND license.status='verified'
    AND license.expires_on>=(platform.context_now() AT TIME ZONE 'UTC')::date
  FOR SHARE OF membership,license;
  IF NOT clinical.feature_010_current_encounter_clinician_v1(p_source_encounter_id,false) THEN
    RAISE EXCEPTION 'source encounter was not found' USING ERRCODE='P0002';
  END IF;
  IF source_encounter.status<>'open' THEN
    RAISE EXCEPTION 'encounter is no longer open' USING ERRCODE='55000';
  END IF;
  IF source_encounter.appointment_id IS NULL OR NOT appointment_locked
     OR appointment_row.status IS DISTINCT FROM 'in_consultation' THEN
    RAISE EXCEPTION 'linked appointment is no longer in consultation' USING ERRCODE='55000';
  END IF;
  IF p_input ? 'encounterType'
     AND p_input->>'encounterType' IS DISTINCT FROM source_encounter.encounter_type THEN
    RAISE EXCEPTION 'encounterType must match the locked source encounter' USING ERRCODE='22023';
  END IF;

  -- The participant, membership, and license rows above remain locked through
  -- the operation; recheck full C07 action, role, and purpose authority.
  IF NOT clinical.feature_010_authorize_v1('createReferral',p_source_encounter_id) THEN
    RAISE EXCEPTION 'current treating-clinician scope is required' USING ERRCODE='42501';
  END IF;

  SELECT patient.id INTO patient_record_id
  FROM identity.patients patient
  WHERE patient.person_id=source_encounter.patient_person_id
    AND patient.record_status='active';
  IF patient_record_id IS NULL THEN
    RAISE EXCEPTION 'source patient record was not found' USING ERRCODE='P0002';
  END IF;
  INSERT INTO clinical.referrals(
    source_encounter_id,patient_id,requester_person_id,target_specialty,
    target_facility_id,target_doctor_person_id,reason_summary,encounter_type
  ) VALUES (
    p_source_encounter_id,patient_record_id,actor,
    pg_catalog.btrim(p_input->>'targetSpecialty'),
    NULLIF(p_input->>'targetFacilityId','')::uuid,
    NULLIF(p_input->>'targetDoctorId','')::uuid,
    pg_catalog.btrim(p_input->>'reasonSummary'),
    p_input->>'encounterType'
  ) RETURNING * INTO referral_row;

  -- C07's projection enforces its own current listReferrals branch. Reuse it
  -- for both the first response and the response stored for exact replay.
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  SELECT clinical.feature_010_referral_projection_v1(referral_row.id) INTO response_value;
  IF response_value IS NULL THEN
    RAISE EXCEPTION 'source referral projection is unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','createReferral',true);

  PERFORM clinical.record_mutation_effect_v2(
    'clinical.referral.pending.v1','referral.pending','referral',
    referral_row.id,referral_row.version,source_encounter.facility_id,
    source_encounter.patient_person_id
  );
  PERFORM clinical.complete_mutation_v1(idem_id,201,'referral',referral_row.id,response_value);
  RETURN response_value;
END $$;

CREATE OR REPLACE FUNCTION clinical.accept_referral_api_v1(
  p_referral_id uuid,p_expected_version integer,p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  original_role text := platform.context_role();
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  referral_row clinical.referrals%ROWTYPE;
  source_encounter clinical.encounters%ROWTYPE;
  patient_record identity.patients%ROWTYPE;
  target_facility identity.facilities%ROWTYPE;
  target_doctor identity.people%ROWTYPE;
  target_license identity.professional_licenses%ROWTYPE;
  target_membership identity.facility_memberships%ROWTYPE;
  schedule_row clinical.schedules%ROWTYPE;
  booking_id uuid;
  subject_person_id uuid;
  selected_role text;
  candidate_role text;
  authorized_codes text[];
  slot_value jsonb;
  slot_facility_id uuid;
  slot_doctor_id uuid;
  slot_starts_at timestamptz;
  slot_ends_at timestamptz;
  slot_timezone text;
  slot_civil_date date;
  slot_availability_version integer;
  slot_local_start time;
  selected_slot jsonb;
  booking_input jsonb;
  referral_projection jsonb;
  appointment_projection jsonb;
  response_value jsonb;
  accepted_at_value timestamptz;
BEGIN
  IF actor IS NULL OR platform.context_action() IS DISTINCT FROM 'acceptReferral'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current subject acceptance context is required' USING ERRCODE='42501';
  END IF;
  IF p_referral_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN
    RAISE EXCEPTION 'a referral identifier and current version are required' USING ERRCODE='22023';
  END IF;

  SELECT record_id,is_new,response_body
    INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/referrals/{referralId}/accept');

  -- The pending referral is always the first domain lock. All callers then
  -- lock the subject's current authority rows and target schedule in order.
  SELECT * INTO referral_row
  FROM clinical.referrals referral
  WHERE referral.id=p_referral_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'requested referral is unavailable' USING ERRCODE='P0002';
  END IF;

  SELECT * INTO source_encounter
  FROM clinical.encounters encounter
  WHERE encounter.id=referral_row.source_encounter_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'referral source encounter was not found' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO patient_record
  FROM identity.patients patient
  WHERE patient.id=referral_row.patient_id
  FOR SHARE;
  IF NOT FOUND OR patient_record.record_status<>'active'
     OR patient_record.person_id IS DISTINCT FROM source_encounter.patient_person_id THEN
    RAISE EXCEPTION 'referral subject record is unavailable' USING ERRCODE='P0002';
  END IF;
  subject_person_id := patient_record.person_id;
  PERFORM 1 FROM identity.people person
  WHERE person.id=subject_person_id AND person.profile_status='active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'referral subject profile is unavailable' USING ERRCODE='P0002';
  END IF;

  -- Lock all existing representative rows and permission grants for this
  -- actor/subject pair so a concurrent revocation cannot pass the later C07
  -- recheck and then race the booking.
  PERFORM relation.id
  FROM identity.care_relationships relation
  WHERE relation.subject_patient_id=patient_record.id
    AND relation.actor_person_id=actor
    AND relation.relationship_type IN ('guardianship','delegation')
  ORDER BY relation.id
  FOR SHARE OF relation;
  PERFORM 1
  FROM identity.care_relationships relation
  JOIN identity.care_relationship_permissions permission
    ON permission.relationship_id=relation.id
  WHERE relation.subject_patient_id=patient_record.id
    AND relation.actor_person_id=actor
    AND relation.relationship_type IN ('guardianship','delegation')
  ORDER BY permission.relationship_id,permission.permission_code,permission.created_at
  FOR SHARE OF permission;

  -- Establish current status-independent visibility before either the
  -- lifecycle/version response or a cached acceptance response is disclosed.
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  selected_role := NULL;
  FOREACH candidate_role IN ARRAY ARRAY['PAT','GUA','DEL'] LOOP
    PERFORM pg_catalog.set_config('shifaa.actor_role',candidate_role,true);
    IF clinical.feature_010_authorize_v1('listReferrals',p_referral_id) THEN
      selected_role := candidate_role;
      EXIT;
    END IF;
  END LOOP;
  IF selected_role IS NULL THEN
    RAISE EXCEPTION 'requested referral is unavailable' USING ERRCODE='P0002';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','acceptReferral',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role',original_role,true);

  IF NOT idem_new THEN
    IF idem_response IS NULL
       OR idem_response->'referral'->>'id' IS DISTINCT FROM p_referral_id::text THEN
      RAISE EXCEPTION 'idempotency key reused for another referral' USING ERRCODE='23505';
    END IF;
    IF referral_row.status IS DISTINCT FROM 'accepted'
       OR referral_row.resulting_appointment_id IS NULL THEN
      RAISE EXCEPTION 'stored acceptance is no longer available' USING ERRCODE='40001';
    END IF;
    RETURN idem_response;
  END IF;

  IF referral_row.status IS DISTINCT FROM 'pending'
     OR referral_row.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'referral version is stale or referral is no longer pending' USING ERRCODE='40001';
  END IF;

  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input)<>'object'
     OR NOT (p_input ?& ARRAY['authorizedFieldCodes','targetSlot']::text[])
     OR (p_input-ARRAY['authorizedFieldCodes','targetSlot']::text[])<>'{}'::jsonb
     OR pg_catalog.jsonb_typeof(p_input->'authorizedFieldCodes')<>'array'
     OR p_input->'authorizedFieldCodes' NOT IN (
       pg_catalog.jsonb_build_array('reason_summary'),
       pg_catalog.jsonb_build_array('reason_summary','encounter_type')
     )
     OR pg_catalog.jsonb_typeof(p_input->'targetSlot')<>'object'
     OR NOT ((p_input->'targetSlot') ?& ARRAY[
       'facilityId','doctorId','startsAt','endsAt','timezone','civilDate','availabilityVersion'
     ]::text[])
     OR ((p_input->'targetSlot')-ARRAY[
       'facilityId','doctorId','startsAt','endsAt','timezone','civilDate','availabilityVersion'
     ]::text[])<>'{}'::jsonb
     OR pg_catalog.jsonb_typeof(p_input->'targetSlot'->'facilityId')<>'string'
     OR pg_catalog.jsonb_typeof(p_input->'targetSlot'->'doctorId')<>'string'
     OR pg_catalog.jsonb_typeof(p_input->'targetSlot'->'startsAt')<>'string'
     OR pg_catalog.jsonb_typeof(p_input->'targetSlot'->'endsAt')<>'string'
     OR pg_catalog.jsonb_typeof(p_input->'targetSlot'->'timezone')<>'string'
     OR pg_catalog.jsonb_typeof(p_input->'targetSlot'->'civilDate')<>'string'
     OR pg_catalog.jsonb_typeof(p_input->'targetSlot'->'availabilityVersion')<>'number'
     OR p_input->'targetSlot'->>'facilityId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_input->'targetSlot'->>'doctorId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR NULLIF(pg_catalog.btrim(p_input->'targetSlot'->>'timezone'),'') IS NULL
     OR p_input->'targetSlot'->>'civilDate' !~ '^\d{4}-\d{2}-\d{2}$'
     OR p_input->'targetSlot'->>'availabilityVersion' !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'acceptReferral requires a closed disclosure and selected target slot' USING ERRCODE='22023';
  END IF;

  BEGIN
    slot_facility_id := (p_input->'targetSlot'->>'facilityId')::uuid;
    slot_doctor_id := (p_input->'targetSlot'->>'doctorId')::uuid;
    slot_starts_at := (p_input->'targetSlot'->>'startsAt')::timestamptz;
    slot_ends_at := (p_input->'targetSlot'->>'endsAt')::timestamptz;
    slot_timezone := p_input->'targetSlot'->>'timezone';
    slot_civil_date := (p_input->'targetSlot'->>'civilDate')::date;
    slot_availability_version := (p_input->'targetSlot'->>'availabilityVersion')::integer;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'acceptReferral target slot fields are invalid' USING ERRCODE='22023';
  END;
  IF slot_starts_at IS NULL OR slot_ends_at IS NULL OR slot_ends_at<=slot_starts_at
     OR slot_availability_version<1 THEN
    RAISE EXCEPTION 'acceptReferral target slot fields are invalid' USING ERRCODE='22023';
  END IF;

  -- Select role from current server-side identity/relationship authority.
  -- No role, patient, purpose, or permission claims come from the request body.
  PERFORM pg_catalog.set_config('shifaa.action','acceptReferral',true);
  selected_role := NULL;
  FOREACH candidate_role IN ARRAY ARRAY['PAT','GUA','DEL'] LOOP
    PERFORM pg_catalog.set_config('shifaa.actor_role',candidate_role,true);
    IF clinical.feature_010_authorize_v1('acceptReferral',p_referral_id) THEN
      selected_role := candidate_role;
      EXIT;
    END IF;
  END LOOP;
  IF selected_role IS NULL THEN
    RAISE EXCEPTION 'requested referral is unavailable' USING ERRCODE='P0002';
  END IF;

  IF (referral_row.target_facility_id IS NOT NULL
      AND slot_facility_id IS DISTINCT FROM referral_row.target_facility_id)
     OR (referral_row.target_doctor_person_id IS NOT NULL
      AND slot_doctor_id IS DISTINCT FROM referral_row.target_doctor_person_id) THEN
    RAISE EXCEPTION 'selected target does not match the pending referral' USING ERRCODE='22023';
  END IF;

  -- Verify target specialty against a current verified licence and current
  -- doctor membership at the selected active facility. Lock each row class
  -- in a fixed order before the schedule lock and C08 booking primitive.
  SELECT * INTO target_facility
  FROM identity.facilities facility
  WHERE facility.id=slot_facility_id AND facility.facility_status='active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'selected target doctor, specialty, or facility is no longer eligible' USING ERRCODE='42501';
  END IF;
  SELECT * INTO target_membership
  FROM identity.facility_memberships membership
  WHERE membership.facility_id=slot_facility_id
    AND membership.person_id=slot_doctor_id
    AND membership.role_code='doctor'
    AND membership.membership_status='active'
    AND membership.valid_from<=platform.context_now()
    AND (membership.valid_until IS NULL OR membership.valid_until>platform.context_now())
  ORDER BY membership.id
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'selected target doctor, specialty, or facility is no longer eligible' USING ERRCODE='42501';
  END IF;
  SELECT * INTO target_license
  FROM identity.professional_licenses license
  WHERE license.id=target_membership.employment_license_id
    AND license.person_id=slot_doctor_id
    AND license.profession='doctor'
    AND license.status='verified'
    AND license.expires_on>=(platform.context_now() AT TIME ZONE 'UTC')::date
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'selected target doctor, specialty, or facility is no longer eligible' USING ERRCODE='42501';
  END IF;
  IF pg_catalog.lower(COALESCE(NULLIF(target_license.specialty_code,''),target_license.profession))
      IS DISTINCT FROM pg_catalog.lower(referral_row.target_specialty) THEN
    RAISE EXCEPTION 'selected target doctor specialty does not match the pending referral' USING ERRCODE='22023';
  END IF;
  SELECT * INTO target_doctor
  FROM identity.people doctor
  WHERE doctor.id=slot_doctor_id AND doctor.profile_status='active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'selected target doctor, specialty, or facility is no longer eligible' USING ERRCODE='42501';
  END IF;

  -- C08 owns the authoritative schedule selection and slot availability.
  -- Acceptance resolves its exact schedule and local wall time while holding
  -- the schedule lock, then supplies both the exact slot and current version.
  SELECT * INTO schedule_row
  FROM clinical.schedules schedule
  WHERE schedule.facility_id=slot_facility_id
    AND schedule.doctor_person_id=slot_doctor_id
    AND schedule.status='active'
    AND slot_civil_date <@ schedule.valid_dates
  ORDER BY schedule.valid_from,schedule.id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR schedule_row.timezone_name IS DISTINCT FROM slot_timezone THEN
    RAISE EXCEPTION 'target schedule or effective slot is no longer available' USING ERRCODE='23P01';
  END IF;
  IF schedule_row.version IS DISTINCT FROM slot_availability_version THEN
    RAISE EXCEPTION 'target schedule availability version is stale' USING ERRCODE='40001';
  END IF;
  slot_local_start := (slot_starts_at AT TIME ZONE schedule_row.timezone_name)::time;
  IF (slot_starts_at AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM slot_civil_date THEN
    RAISE EXCEPTION 'selected slot is no longer an effective schedule slot' USING ERRCODE='23P01';
  END IF;
  authorized_codes := ARRAY(
    SELECT code_value
    FROM pg_catalog.jsonb_array_elements_text(p_input->'authorizedFieldCodes') code_value
  );
  IF 'encounter_type'=ANY(authorized_codes) AND referral_row.encounter_type IS NULL THEN
    RAISE EXCEPTION 'encounter_type is not present in the current pending referral preview' USING ERRCODE='22023';
  END IF;
  slot_value := p_input->'targetSlot';
  selected_slot := pg_catalog.jsonb_build_object(
    'starts_at',slot_starts_at,'ends_at',slot_ends_at,
    'timezone_name',schedule_row.timezone_name,
    'civil_date',slot_civil_date,'local_start',slot_local_start
  );
  booking_input := pg_catalog.jsonb_build_object(
    'patient_person_id',subject_person_id,
    'facility_id',schedule_row.facility_id,
    'doctor_person_id',schedule_row.doctor_person_id,
    'schedule_id',schedule_row.id,
    'starts_at',slot_starts_at,'ends_at',slot_ends_at,
    'timezone_name',schedule_row.timezone_name,
    'civil_date',slot_civil_date,'local_start',slot_local_start,
    'source_referral_id',referral_row.id
  );
  booking_id := clinical.book_appointment_internal_v1(
    booking_input,slot_availability_version,selected_slot
  );

  accepted_at_value := GREATEST(clock_timestamp(),referral_row.created_at+interval '1 microsecond');
  UPDATE clinical.referrals referral
  SET status='accepted',resulting_appointment_id=booking_id,
      target_facility_id=schedule_row.facility_id,
      target_doctor_person_id=schedule_row.doctor_person_id,
      accepted_field_codes=authorized_codes,accepted_by_person_id=actor,
      accepted_at=accepted_at_value,version=referral.version+1,
      updated_at=accepted_at_value
  WHERE referral.id=referral_row.id AND referral.status='pending'
    AND referral.version=p_expected_version
  RETURNING * INTO referral_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'referral version changed during acceptance' USING ERRCODE='40001';
  END IF;

  -- Reuse C07 current projection authorization, then trim the optional source
  -- type unless it was explicitly selected for sharing at acceptance.
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role',selected_role,true);
  referral_projection := clinical.feature_010_referral_projection_v1(referral_row.id);
  IF referral_projection IS NULL THEN
    RAISE EXCEPTION 'accepted referral projection is unavailable' USING ERRCODE='42501';
  END IF;
  IF NOT ('encounter_type'=ANY(authorized_codes)) THEN
    referral_projection := referral_projection-'encounterType';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'id',appointment.id,'sourceReferralId',appointment.source_referral_id,
    'status',appointment.status,'facilityId',appointment.facility_id,
    'doctorId',appointment.doctor_person_id,'startsAt',appointment.starts_at,
    'endsAt',appointment.ends_at,'feeMinorUnits',appointment.fee_minor_units,
    'currency',appointment.currency_code,'paymentMethod',appointment.payment_method,
    'version',appointment.version
  ) INTO appointment_projection
  FROM clinical.appointments appointment
  WHERE appointment.id=booking_id;
  IF appointment_projection IS NULL THEN
    RAISE EXCEPTION 'booked appointment projection is unavailable' USING ERRCODE='55000';
  END IF;
  response_value := pg_catalog.jsonb_build_object(
    'referral',referral_projection,'appointment',appointment_projection
  );

  PERFORM clinical.record_mutation_effect_v2(
    'clinical.referral.accepted.v1','referral.accepted','referral',
    referral_row.id,referral_row.version,slot_facility_id,subject_person_id
  );
  PERFORM clinical.complete_mutation_v1(idem_id,200,'referral',referral_row.id,response_value);
  PERFORM pg_catalog.set_config('shifaa.action','acceptReferral',true);
  RETURN response_value;
END $$;

REVOKE ALL ON FUNCTION clinical.update_encounter_api_v1(uuid,integer,jsonb),
  clinical.sign_encounter_note_api_v1(uuid,jsonb),
  clinical.complete_encounter_api_v1(uuid,integer,jsonb),
  clinical.create_referral_api_v1(uuid,jsonb),
  clinical.accept_referral_api_v1(uuid,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.update_encounter_api_v1(uuid,integer,jsonb),
  clinical.sign_encounter_note_api_v1(uuid,jsonb),
  clinical.complete_encounter_api_v1(uuid,integer,jsonb),
  clinical.create_referral_api_v1(uuid,jsonb),
  clinical.accept_referral_api_v1(uuid,integer,jsonb) TO shifaa_api;

COMMIT;
