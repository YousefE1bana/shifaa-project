-- C13 exposes the existing C05 locked completion producer through one
-- idempotent online boundary. Triple lifecycle changes remain in C05.
BEGIN;

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
 'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked','relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked','emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked','sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required','notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
 'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
 'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1',
 'clinical.encounter.opened.v1','clinical.encounter.updated.v1','clinical.note.signed.v1','clinical.encounter.completed.v1'
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
    'clinical.encounter.opened.v1','clinical.encounter.updated.v1','clinical.note.signed.v1','clinical.encounter.completed.v1'
  );

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
      RAISE EXCEPTION 'current responsible-clinician scope is required for replay' USING ERRCODE='42501';
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
    RAISE EXCEPTION 'current responsible-clinician scope is required' USING ERRCODE='42501';
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

REVOKE ALL ON FUNCTION clinical.complete_encounter_api_v1(uuid,integer,jsonb) FROM PUBLIC;
DO $feature_010_c13_api_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION clinical.complete_encounter_api_v1(uuid,integer,jsonb) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='shifaa_api') THEN
    GRANT EXECUTE ON FUNCTION clinical.complete_encounter_api_v1(uuid,integer,jsonb) TO shifaa_api;
  END IF;
END
$feature_010_c13_api_execute_grants$;

COMMENT ON FUNCTION clinical.complete_encounter_api_v1(uuid,integer,jsonb) IS
  'C13 online completeEncounter boundary: changed-body idempotency conflicts first; exact replay rechecks current responsible-clinician authority without reopening; C05 owns the locked triple transition.';

COMMIT;
