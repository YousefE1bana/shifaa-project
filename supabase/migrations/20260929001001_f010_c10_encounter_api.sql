-- C10 binds the locked C05 producer to the existing mutation transaction,
-- audit/outbox effects, and canonical replay record. The online API role gets
-- only this fixed operation boundary; the producer and tables stay private.
BEGIN;

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
 'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked','relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked','emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked','sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required','notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
 'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
 'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1',
 'clinical.encounter.opened.v1'
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
    'clinical.encounter.opened.v1'
  );

-- C10 completes the authorized metadata projection with the approved
-- active/historical workforce intervals. Note bodies remain outside this
-- checkpoint; the existing role-aware C07 note metadata is retained.
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
  ) INTO projection
  FROM clinical.encounters encounter
  WHERE encounter.id=p_encounter_id;
  RETURN projection;
END
$$;

CREATE OR REPLACE FUNCTION clinical.create_encounter_api_v1(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  response_value jsonb;
  encounter_id uuid;
  facility_id uuid;
  patient_person_id uuid;
  encounter_version integer;
BEGIN
  IF actor IS NULL OR platform.context_role() IS DISTINCT FROM 'CLN'
     OR platform.context_action() IS DISTINCT FROM 'createEncounter'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current treating-clinician context is required' USING ERRCODE='42501';
  END IF;

  SELECT record_id,is_new,response_body
    INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/encounters');
  IF NOT idem_new THEN
    encounter_id := NULLIF(idem_response #>> '{encounter,id}','')::uuid;
    IF encounter_id IS NULL
       OR idem_response #>> '{encounter,responsibleClinicianId}' IS DISTINCT FROM actor::text
       OR NOT clinical.feature_010_current_encounter_clinician_v1(encounter_id,true) THEN
      RAISE EXCEPTION 'current treating-clinician scope is required for replay' USING ERRCODE='42501';
    END IF;
    RETURN idem_response;
  END IF;

  response_value := clinical.create_encounter_v1(p_input);
  IF response_value IS NULL OR response_value->'encounter' IS NULL THEN
    RAISE EXCEPTION 'canonical encounter response is unavailable' USING ERRCODE='55000';
  END IF;
  encounter_id := (response_value #>> '{encounter,id}')::uuid;
  facility_id := (response_value #>> '{encounter,facilityId}')::uuid;
  patient_person_id := (response_value #>> '{encounter,patientId}')::uuid;
  encounter_version := (response_value #>> '{encounter,version}')::integer;

  IF encounter_id IS NULL OR facility_id IS NULL OR patient_person_id IS NULL OR encounter_version IS NULL THEN
    RAISE EXCEPTION 'canonical encounter response is incomplete' USING ERRCODE='55000';
  END IF;
  PERFORM clinical.record_mutation_effect_v2(
    'clinical.encounter.opened.v1','encounter.created','encounter',
    encounter_id,encounter_version,facility_id,patient_person_id
  );
  PERFORM clinical.complete_mutation_v1(idem_id,201,'encounter',encounter_id,response_value);
  RETURN response_value;
END $$;

REVOKE ALL ON FUNCTION clinical.create_encounter_api_v1(jsonb) FROM PUBLIC;
DO $feature_010_c10_api_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION clinical.create_encounter_api_v1(jsonb) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  GRANT EXECUTE ON FUNCTION clinical.create_encounter_api_v1(jsonb) TO shifaa_api;
END
$feature_010_c10_api_execute_grants$;

COMMENT ON FUNCTION clinical.create_encounter_api_v1(jsonb) IS
  'C10 online createEncounter boundary: current CLN/AAL2/purpose, locked C05 producer, one atomic audit/outbox effect, and canonical idempotent response.';

COMMIT;
