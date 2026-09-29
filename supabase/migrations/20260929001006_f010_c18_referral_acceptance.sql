-- C18 composes current subject authority with the existing C08 booking seam.
BEGIN;

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
 'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked','relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked','emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked','sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required','notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
 'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
 'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1',
 'clinical.encounter.opened.v1','clinical.encounter.updated.v1','clinical.note.signed.v1','clinical.encounter.completed.v1',
 'clinical.referral.pending.v1','clinical.referral.accepted.v1'
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
    'clinical.referral.pending.v1','clinical.referral.accepted.v1'
  );

CREATE OR REPLACE FUNCTION clinical.accept_referral_api_v1(
  p_referral_id uuid,p_expected_version integer,p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
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

  IF NOT idem_new THEN
    IF idem_response IS NULL
       OR idem_response->'referral'->>'id' IS DISTINCT FROM p_referral_id::text THEN
      RAISE EXCEPTION 'idempotency key reused for another referral' USING ERRCODE='23505';
    END IF;
    IF referral_row.status IS DISTINCT FROM 'accepted'
       OR referral_row.resulting_appointment_id IS NULL THEN
      RAISE EXCEPTION 'stored acceptance is no longer available' USING ERRCODE='40001';
    END IF;
    PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
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

REVOKE ALL ON FUNCTION clinical.accept_referral_api_v1(uuid,integer,jsonb) FROM PUBLIC;
DO $feature_010_c18_api_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION clinical.accept_referral_api_v1(uuid,integer,jsonb) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='shifaa_api') THEN
    GRANT EXECUTE ON FUNCTION clinical.accept_referral_api_v1(uuid,integer,jsonb) TO shifaa_api;
  END IF;
END
$feature_010_c18_api_execute_grants$;

COMMENT ON FUNCTION clinical.accept_referral_api_v1(uuid,integer,jsonb) IS
  'C18 acceptance boundary: current PAT/GUA/DEL authority, exact selected disclosure, live target eligibility and locked effective C08 slot booking commit in one idempotent transaction.';

COMMIT;
