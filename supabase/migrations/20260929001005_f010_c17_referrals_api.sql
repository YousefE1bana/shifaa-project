-- C17 exposes only the existing pending-referral contract through locked SQL
-- boundaries. C06 owns storage invariants; C07 owns current authorization and
-- the role-specific projection. The API role receives no referral table ACL.
BEGIN;

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
 'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked','relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked','emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked','sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required','notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
 'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
 'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1',
 'clinical.encounter.opened.v1','clinical.encounter.updated.v1','clinical.note.signed.v1','clinical.encounter.completed.v1',
 'clinical.referral.pending.v1'
));

DROP INDEX IF EXISTS platform.outbox_aggregate_version_uq;
CREATE UNIQUE INDEX outbox_aggregate_version_uq
  ON platform.outbox_events(aggregate_type,aggregate_id,aggregate_version)
  WHERE event_type IN (
    'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
    'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
    'sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','sos.emergency_contact.requested',
    'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
    'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1',
    'clinical.encounter.opened.v1','clinical.encounter.updated.v1','clinical.note.signed.v1','clinical.encounter.completed.v1',
    'clinical.referral.pending.v1'
  );

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
    IF NOT clinical.feature_010_current_encounter_clinician_v1(p_source_encounter_id,false) THEN
      RAISE EXCEPTION 'current treating-clinician scope is required for replay' USING ERRCODE='42501';
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

  -- Serialize against participant removal and current facility/license
  -- changes, then re-evaluate the C07 actor/action/purpose authority.
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

CREATE OR REPLACE FUNCTION clinical.list_referrals_api_v1(
  p_after_created_at text,p_after_id uuid,p_limit integer,
  p_patient_id uuid,p_facility_id uuid,p_specialty text,p_status text,p_date date
) RETURNS TABLE(referral_id uuid,created_at text,projection jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF platform.context_person_id() IS NULL
     OR platform.context_action() IS DISTINCT FROM 'listReferrals'
     OR platform.context_role() IS NULL
     OR platform.context_role() NOT IN ('PAT','GUA','DEL','CLN')
     OR COALESCE(platform.context_aal(),0)<1
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current referral list context is required' USING ERRCODE='42501';
  END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>101
     OR ((p_after_created_at IS NULL)<>(p_after_id IS NULL))
     OR (p_status IS NOT NULL AND p_status NOT IN ('pending','accepted')) THEN
    RAISE EXCEPTION 'referral cursor or filter is invalid' USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  WITH authorized AS (
    SELECT referral.id,referral.created_at
    FROM clinical.referrals referral
    JOIN clinical.encounters source_encounter
      ON source_encounter.id=referral.source_encounter_id
    WHERE (p_after_created_at IS NULL OR
        (referral.created_at,referral.id)<(p_after_created_at::timestamptz,p_after_id))
      AND (p_patient_id IS NULL OR source_encounter.patient_person_id=p_patient_id)
      AND (p_facility_id IS NULL OR source_encounter.facility_id=p_facility_id
        OR (platform.context_role()='CLN' AND referral.status='accepted'
          AND referral.target_facility_id=p_facility_id))
      AND (p_specialty IS NULL OR referral.target_specialty=p_specialty)
      AND (p_status IS NULL OR referral.status=p_status)
      AND (p_date IS NULL OR (referral.created_at AT TIME ZONE 'UTC')::date=p_date)
      AND clinical.feature_010_authorize_v1('listReferrals',referral.id)
    ORDER BY referral.created_at DESC,referral.id DESC
    LIMIT p_limit
  )
  SELECT authorized.id,
    pg_catalog.to_char(authorized.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    projected.value
  FROM authorized
  CROSS JOIN LATERAL (
    SELECT clinical.feature_010_referral_projection_v1(authorized.id) AS value
  ) projected
  WHERE projected.value IS NOT NULL
  ORDER BY authorized.created_at DESC,authorized.id DESC;
END $$;

REVOKE ALL ON FUNCTION clinical.create_referral_api_v1(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.list_referrals_api_v1(text,uuid,integer,uuid,uuid,text,text,date) FROM PUBLIC;
DO $feature_010_c17_api_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION clinical.create_referral_api_v1(uuid,jsonb), clinical.list_referrals_api_v1(text,uuid,integer,uuid,uuid,text,text,date) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='shifaa_api') THEN
    GRANT EXECUTE ON FUNCTION clinical.create_referral_api_v1(uuid,jsonb),
      clinical.list_referrals_api_v1(text,uuid,integer,uuid,uuid,text,text,date)
    TO shifaa_api;
  END IF;
END
$feature_010_c17_api_execute_grants$;

COMMENT ON FUNCTION clinical.create_referral_api_v1(uuid,jsonb) IS
  'C17 online createReferral boundary: validates source-type equality under appointment/encounter locks, stores pending only, and commits one audit/outbox/canonical idempotency response.';
COMMENT ON FUNCTION clinical.list_referrals_api_v1(text,uuid,integer,uuid,uuid,text,text,date) IS
  'C17 current-authority cursor page: filters and projects only rows authorized by C07 for the server-selected actor role.';

COMMIT;
