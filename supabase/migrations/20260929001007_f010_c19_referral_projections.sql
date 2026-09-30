-- C19 preserves the source-care projection when the same current clinician is
-- also a member of the referral's target facility. Target clinicians without
-- current source-care authority continue to receive the accepted-field-only
-- projection from C07.
BEGIN;

CREATE OR REPLACE FUNCTION clinical.feature_010_referral_projection_v1(
  p_referral_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  referral clinical.referrals%ROWTYPE;
  source_encounter clinical.encounters%ROWTYPE;
  target_appointment clinical.appointments%ROWTYPE;
  projection jsonb;
  is_source_clinician boolean;
  is_target_clinician boolean;
BEGIN
  IF NOT clinical.feature_010_authorize_v1('listReferrals',p_referral_id) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO referral FROM clinical.referrals WHERE id=p_referral_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO source_encounter FROM clinical.encounters WHERE id=referral.source_encounter_id;

  is_source_clinician := platform.context_role()='CLN'
    AND clinical.feature_010_current_encounter_clinician_v1(source_encounter.id,false);
  is_target_clinician := platform.context_role()='CLN'
    AND NOT is_source_clinician
    AND referral.status='accepted'
    AND referral.resulting_appointment_id IS NOT NULL
    AND clinical.feature_010_current_clinician_v1(
      platform.context_person_id(),referral.target_facility_id
    );
  IF is_target_clinician THEN
    SELECT * INTO target_appointment FROM clinical.appointments
      WHERE id=referral.resulting_appointment_id;
    IF NOT FOUND OR target_appointment.patient_person_id<>source_encounter.patient_person_id
       OR target_appointment.facility_id<>referral.target_facility_id THEN
      RETURN NULL;
    END IF;
    projection := pg_catalog.jsonb_build_object(
      'id',referral.id,
      'status','accepted',
      'version',referral.version,
      'acceptedFieldCodes',pg_catalog.to_jsonb(referral.accepted_field_codes),
      'resultingAppointmentId',referral.resulting_appointment_id,
      'reasonSummary',referral.reason_summary
    );
    IF 'encounter_type'=ANY(referral.accepted_field_codes) THEN
      projection := projection || pg_catalog.jsonb_build_object('encounterType',referral.encounter_type);
    END IF;
    RETURN projection;
  END IF;
  projection := pg_catalog.jsonb_build_object(
    'id',referral.id,
    'sourceEncounterId',referral.source_encounter_id,
    'status',referral.status,
    'version',referral.version,
    'targetSpecialty',referral.target_specialty
  );
  IF referral.target_facility_id IS NOT NULL THEN
    projection := projection || pg_catalog.jsonb_build_object('targetFacilityId',referral.target_facility_id);
  END IF;
  IF referral.target_doctor_person_id IS NOT NULL THEN
    projection := projection || pg_catalog.jsonb_build_object('targetDoctorId',referral.target_doctor_person_id);
  END IF;
  IF referral.status='accepted' THEN
    SELECT * INTO target_appointment FROM clinical.appointments
      WHERE id=referral.resulting_appointment_id;
    IF NOT FOUND OR target_appointment.patient_person_id<>source_encounter.patient_person_id
       OR target_appointment.facility_id<>referral.target_facility_id THEN
      RETURN NULL;
    END IF;
    projection := projection || pg_catalog.jsonb_build_object(
      'targetFacilityId',referral.target_facility_id,
      'targetDoctorId',referral.target_doctor_person_id,
      'resultingAppointmentId',referral.resulting_appointment_id,
      'acceptedFieldCodes',pg_catalog.to_jsonb(referral.accepted_field_codes)
    );
  END IF;
  projection := projection || pg_catalog.jsonb_build_object('reasonSummary',referral.reason_summary);
  IF referral.encounter_type IS NOT NULL THEN
    projection := projection || pg_catalog.jsonb_build_object('encounterType',referral.encounter_type);
  END IF;
  RETURN projection;
END
$$;

REVOKE ALL ON FUNCTION clinical.feature_010_referral_projection_v1(uuid) FROM PUBLIC;
DO $feature_010_c19_projection_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION clinical.feature_010_referral_projection_v1(uuid) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='shifaa_api') THEN
    GRANT EXECUTE ON FUNCTION clinical.feature_010_referral_projection_v1(uuid) TO shifaa_api;
  END IF;
END
$feature_010_c19_projection_execute_grants$;

COMMIT;
