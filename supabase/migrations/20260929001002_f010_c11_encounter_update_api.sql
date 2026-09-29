-- C11 binds the approved encounter update to one locked transaction, with a
-- canonical idempotent response and one audit/outbox effect. The online API
-- role receives only this fixed operation boundary.
BEGIN;

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
 'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked','relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked','emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked','sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required','notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
 'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
 'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1',
 'clinical.encounter.opened.v1','clinical.encounter.updated.v1'
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
    'clinical.encounter.opened.v1','clinical.encounter.updated.v1'
  );

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
  IF encounter_row.status<>'open' THEN
    IF NOT clinical.feature_010_current_encounter_clinician_v1(p_encounter_id,false) THEN
      RAISE EXCEPTION 'current treating-clinician scope is required' USING ERRCODE='42501';
    END IF;
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

REVOKE ALL ON FUNCTION clinical.update_encounter_api_v1(uuid,integer,jsonb) FROM PUBLIC;
DO $feature_010_c11_api_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION clinical.update_encounter_api_v1(uuid,integer,jsonb) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  GRANT EXECUTE ON FUNCTION clinical.update_encounter_api_v1(uuid,integer,jsonb) TO shifaa_api;
END
$feature_010_c11_api_execute_grants$;

COMMENT ON FUNCTION clinical.update_encounter_api_v1(uuid,integer,jsonb) IS
  'C11 online updateEncounter boundary: current treating clinician, locked version, same-patient structured references, non-responsible participant interval end, one audit/outbox effect, and canonical idempotent response.';

COMMIT;
