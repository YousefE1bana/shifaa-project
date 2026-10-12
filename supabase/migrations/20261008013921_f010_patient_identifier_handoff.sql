-- Post-acceptance additive F001/F010 identifier reconciliation authorized 2026-10-08.
-- Same function, owner, fixed search_path, authorization and grants. No new operation.
BEGIN;
CREATE OR REPLACE FUNCTION clinical.feature_010_get_encounter_projection_v1(
  p_encounter_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  projection jsonb;
BEGIN
  IF NOT clinical.feature_010_authorize_v1('getEncounter',p_encounter_id) THEN
    RETURN NULL;
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'id',encounter.id,
    'patientId',encounter.patient_person_id,
    'patientPersonId',encounter.patient_person_id,
    'managedPatientId',patient.id,
    'facilityId',encounter.facility_id,
    'appointmentId',encounter.appointment_id,
    'encounterType',encounter.encounter_type,
    'responsibleClinicianId',encounter.responsible_clinician_id,
    'status',encounter.status,
    'startedAt',encounter.started_at,
    'endedAt',encounter.ended_at,
    'version',encounter.version,
    'conditionIds',pg_catalog.to_jsonb(encounter.condition_ids),
    'observationIds',pg_catalog.to_jsonb(encounter.observation_ids),
    'orderIds',pg_catalog.to_jsonb(encounter.order_ids),
    'notes',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',note.id,'authorId',note.author_person_id,'noteType',note.note_type,
        'visibility',note.visibility_code,'signedAt',note.signed_at,'supersedesId',note.supersedes_id
      ) ORDER BY note.signed_at,note.id)
      FROM clinical.clinical_notes note
      WHERE note.encounter_id=encounter.id
        AND (note.visibility_code='patient_visible' OR platform.context_role()='CLN')
    ),'[]'::jsonb),
    'participants',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'personId',participant.person_id,'roleCode',participant.role_code,
        'startedAt',participant.started_at,'endedAt',participant.ended_at
      )) ORDER BY participant.started_at,participant.person_id,participant.role_code)
      FROM clinical.encounter_participants participant
      WHERE participant.encounter_id=encounter.id
    ),'[]'::jsonb)
  ) || CASE WHEN encounter.status='completed' THEN pg_catalog.jsonb_build_object(
    'completionSummary',encounter.completion_summary
  ) ELSE '{}'::jsonb END INTO projection
  FROM clinical.encounters encounter
  JOIN identity.patients patient ON patient.person_id=encounter.patient_person_id
  WHERE encounter.id=p_encounter_id;
  RETURN projection;
END
$$;

COMMIT;
