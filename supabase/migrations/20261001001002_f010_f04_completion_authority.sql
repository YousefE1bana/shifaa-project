BEGIN;

CREATE OR REPLACE FUNCTION clinical.complete_encounter_v1(
  p_encounter_id uuid,p_expected_version integer,p_input jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  encounter_row clinical.encounters%ROWTYPE;
  appointment_row clinical.appointments%ROWTYPE;
  queue_row clinical.queue_entries%ROWTYPE;
  responsible_participant clinical.encounter_participants%ROWTYPE;
  completion_summary_value text;
  completed_at_value timestamptz;
  old_transition text := current_setting('shifaa.clinic_internal_transition',true);
  response_value jsonb;
  authorized boolean;
BEGIN
  IF p_encounter_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
     OR NOT (p_input ?& ARRAY['summary','structuralConfirmation']::text[])
     OR (p_input-ARRAY['summary','structuralConfirmation']::text[])<>'{}'::jsonb
     OR NULLIF(btrim(p_input->>'summary'),'') IS NULL
     OR pg_catalog.octet_length(p_input->>'summary')>4000
     OR p_input->'structuralConfirmation'<>'true'::jsonb THEN
    RAISE EXCEPTION 'completeEncounter requires a nonblank responsible-clinician summary and explicit confirmation' USING ERRCODE='22023';
  END IF;
  completion_summary_value := btrim(p_input->>'summary');
  IF actor IS NULL OR platform.context_role() IS DISTINCT FROM 'CLN'
     OR platform.context_action() IS DISTINCT FROM 'completeEncounter'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current responsible-clinician context is required' USING ERRCODE='42501';
  END IF;

  -- Lifecycle rows precede authority rows so creation and completion serialize consistently.
  SELECT * INTO encounter_row FROM clinical.encounters e WHERE e.id=p_encounter_id;
  IF NOT FOUND OR encounter_row.appointment_id IS NULL THEN
    RAISE EXCEPTION 'linked encounter was not found' USING ERRCODE='40001';
  END IF;
  SELECT * INTO appointment_row FROM clinical.appointments a
   WHERE a.id=encounter_row.appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'linked appointment was not found' USING ERRCODE='40001'; END IF;
  SELECT * INTO queue_row FROM clinical.queue_entries q
   WHERE q.appointment_id=appointment_row.id FOR UPDATE;
  SELECT * INTO encounter_row FROM clinical.encounters e WHERE e.id=p_encounter_id FOR UPDATE;
  IF NOT FOUND OR queue_row.id IS NULL OR encounter_row.appointment_id<>appointment_row.id
     OR encounter_row.patient_person_id<>appointment_row.patient_person_id
     OR encounter_row.facility_id<>appointment_row.facility_id
     OR encounter_row.responsible_clinician_id<>appointment_row.doctor_person_id
     OR encounter_row.responsible_clinician_id<>actor
     OR encounter_row.version<>p_expected_version
     OR encounter_row.status<>'open' OR appointment_row.status<>'in_consultation'
     OR queue_row.state<>'in_service'
     OR queue_row.facility_id<>appointment_row.facility_id
     OR queue_row.doctor_person_id<>appointment_row.doctor_person_id
     OR queue_row.civil_date<>appointment_row.civil_date
     OR NOT EXISTS (
       SELECT 1 FROM clinical.queue_scopes s
       WHERE s.id=queue_row.queue_scope_id
         AND s.facility_id=appointment_row.facility_id
         AND s.doctor_person_id=appointment_row.doctor_person_id
         AND s.civil_date=appointment_row.civil_date
         AND s.timezone_name=appointment_row.timezone_name
     ) THEN
    RAISE EXCEPTION 'encounter completion state, version, or queue is stale' USING ERRCODE='40001';
  END IF;

  -- Lock authority rows in facility -> membership IDs -> license IDs -> people IDs -> patient -> participant order.
  -- CREATE OR REPLACE preserves owner and execute-deny grants; these locks last until transaction completion.
  PERFORM 1 FROM identity.facilities facility
  WHERE facility.id=appointment_row.facility_id FOR SHARE;
  PERFORM 1 FROM identity.facility_memberships membership
  WHERE membership.facility_id=appointment_row.facility_id
    AND membership.person_id=actor AND membership.role_code='doctor'
  ORDER BY membership.id FOR SHARE;
  PERFORM 1 FROM identity.professional_licenses license
  WHERE license.id IN (
    SELECT membership.employment_license_id
    FROM identity.facility_memberships membership
    WHERE membership.facility_id=appointment_row.facility_id
      AND membership.person_id=actor AND membership.role_code='doctor'
  )
  ORDER BY license.id FOR SHARE;
  PERFORM 1 FROM identity.people person
  WHERE person.id IN (actor,appointment_row.patient_person_id)
  ORDER BY person.id FOR SHARE;
  PERFORM 1 FROM identity.patients patient
  WHERE patient.person_id=appointment_row.patient_person_id FOR SHARE;
  SELECT participant.* INTO responsible_participant
  FROM clinical.encounter_participants participant
  WHERE participant.encounter_id=encounter_row.id
    AND participant.person_id=actor
    AND participant.role_code='responsible_clinician'
    AND participant.ended_at IS NULL
    AND participant.started_at<=platform.context_now()
  ORDER BY participant.started_at DESC FOR SHARE;

  IF actor IS NULL OR platform.context_role() IS DISTINCT FROM 'CLN'
     OR platform.context_action() IS DISTINCT FROM 'completeEncounter'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current responsible-clinician context is required' USING ERRCODE='42501';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM identity.facilities facility
    JOIN identity.facility_memberships membership
      ON membership.facility_id=facility.id
     AND membership.person_id=actor AND membership.role_code='doctor'
     AND membership.membership_status='active'
     AND membership.valid_from<=platform.context_now()
     AND (membership.valid_until IS NULL OR membership.valid_until>platform.context_now())
    JOIN identity.professional_licenses license
      ON license.id=membership.employment_license_id
     AND license.person_id=actor AND license.profession='doctor'
     AND license.status='verified'
     AND license.expires_on>=(platform.context_now() AT TIME ZONE 'UTC')::date
    JOIN identity.people clinician
      ON clinician.id=actor AND clinician.profile_status='active'
    JOIN identity.people subject
      ON subject.id=appointment_row.patient_person_id AND subject.profile_status='active'
    JOIN identity.patients patient
      ON patient.person_id=subject.id AND patient.record_status='active'
    WHERE facility.id=appointment_row.facility_id
      AND facility.facility_status='active'
  ) INTO authorized;
  IF NOT authorized
     OR responsible_participant.encounter_id IS NULL
     OR responsible_participant.ended_at IS NOT NULL
     OR responsible_participant.started_at>platform.context_now() THEN
    RAISE EXCEPTION 'current responsible-clinician membership or licence scope denied' USING ERRCODE='42501';
  END IF;

  completed_at_value := GREATEST(clock_timestamp(),encounter_row.started_at+interval '1 microsecond');
  UPDATE clinical.encounters SET status='completed',ended_at=completed_at_value,
    completion_summary=completion_summary_value,version=version+1,updated_at=completed_at_value
  WHERE id=encounter_row.id AND status='open' AND version=p_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'encounter version changed' USING ERRCODE='40001'; END IF;

  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','f010_complete_encounter',true);
  UPDATE clinical.appointments SET status='completed',updated_by_person_id=actor WHERE id=appointment_row.id;
  UPDATE clinical.queue_entries SET state='completed',completed_at=completed_at_value WHERE id=queue_row.id;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition',COALESCE(old_transition,''),true);

  response_value := pg_catalog.jsonb_build_object(
    'encounter',pg_catalog.jsonb_build_object(
      'id',encounter_row.id,'patientId',encounter_row.patient_person_id,
      'facilityId',encounter_row.facility_id,'appointmentId',appointment_row.id,
      'encounterType',encounter_row.encounter_type,
      'responsibleClinicianId',encounter_row.responsible_clinician_id,'status','completed',
      'startedAt',encounter_row.started_at,'endedAt',completed_at_value,
      'completionSummary',completion_summary_value,'version',encounter_row.version+1,
      'conditionIds',to_jsonb(encounter_row.condition_ids),
      'observationIds',to_jsonb(encounter_row.observation_ids),
      'orderIds',to_jsonb(encounter_row.order_ids)
    ),
    'appointmentId',appointment_row.id,'appointmentVersion',appointment_row.version+1,
    'appointmentStatus','completed','queueEntryId',queue_row.id,
    'queueVersion',queue_row.version+1,'queueStatus','completed','completedAt',completed_at_value
  );
  RETURN response_value;
END $$;

COMMIT;
