-- C22 adds the two narrowly scoped appointment-message SQL boundaries. The
-- API role never receives direct access to trust.messages or clinical state.
BEGIN;

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
 'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked','relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked','emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked','sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required','notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
 'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
 'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1',
 'clinical.encounter.opened.v1','clinical.encounter.updated.v1','clinical.note.signed.v1','clinical.encounter.completed.v1',
 'clinical.referral.pending.v1','clinical.referral.accepted.v1',
 'clinical.context_message.created.v1'
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
    'clinical.referral.pending.v1','clinical.referral.accepted.v1',
    'clinical.context_message.created.v1'
  );

CREATE OR REPLACE FUNCTION trust.list_context_messages_api_v1(
  p_appointment_id uuid,
  p_before_sent_at timestamptz,
  p_before_message_id uuid,
  p_limit integer
) RETURNS TABLE(projection jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  appointment_row clinical.appointments%ROWTYPE;
  queue_row clinical.queue_entries%ROWTYPE;
  encounter_row clinical.encounters%ROWTYPE;
BEGIN
  IF p_appointment_id IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>101
     OR ((p_before_sent_at IS NULL)<>(p_before_message_id IS NULL)) THEN
    RAISE EXCEPTION 'listContextMessages page request is invalid' USING ERRCODE='22023';
  END IF;
  IF platform.context_person_id() IS NULL
     OR platform.context_action() IS DISTINCT FROM 'listContextMessages' THEN
    RAISE EXCEPTION 'current context-message authority is required' USING ERRCODE='42501';
  END IF;

  -- Shared locks serialize each page against appointment/queue/encounter
  -- completion and participant interval ending. Keep the completion order.
  SELECT * INTO appointment_row
  FROM clinical.appointments appointment
  WHERE appointment.id=p_appointment_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current appointment context is not authorized' USING ERRCODE='42501';
  END IF;

  SELECT * INTO queue_row
  FROM clinical.queue_entries queue
  WHERE queue.appointment_id=p_appointment_id
  ORDER BY queue.id
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current appointment context is not authorized' USING ERRCODE='42501';
  END IF;

  SELECT * INTO encounter_row
  FROM clinical.encounters encounter
  WHERE encounter.appointment_id=p_appointment_id
    AND encounter.status='open'
  ORDER BY encounter.id
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current appointment context is not authorized' USING ERRCODE='42501';
  END IF;

  IF appointment_row.status<>'in_consultation'
     OR queue_row.state<>'in_service'
     OR queue_row.facility_id<>appointment_row.facility_id
     OR queue_row.doctor_person_id<>appointment_row.doctor_person_id
     OR queue_row.civil_date<>appointment_row.civil_date
     OR encounter_row.patient_person_id<>appointment_row.patient_person_id
     OR encounter_row.facility_id<>appointment_row.facility_id THEN
    RAISE EXCEPTION 'current appointment context is not authorized' USING ERRCODE='42501';
  END IF;

  IF platform.context_role()='CLN' THEN
    PERFORM 1 FROM clinical.encounter_participants participant
    WHERE participant.encounter_id=encounter_row.id
      AND participant.person_id=platform.context_person_id()
      AND participant.started_at<=platform.context_now()
      AND participant.ended_at IS NULL
    FOR SHARE;
    PERFORM 1
    FROM identity.facilities facility
    JOIN identity.facility_memberships membership
      ON membership.facility_id=facility.id AND membership.person_id=platform.context_person_id()
      AND membership.role_code='doctor' AND membership.membership_status='active'
      AND membership.valid_from<=platform.context_now()
      AND (membership.valid_until IS NULL OR membership.valid_until>platform.context_now())
    JOIN identity.professional_licenses license
      ON license.id=membership.employment_license_id AND license.person_id=platform.context_person_id()
      AND license.profession='doctor' AND license.status='verified'
      AND license.expires_on>=(platform.context_now() AT TIME ZONE 'UTC')::date
    JOIN identity.people person ON person.id=platform.context_person_id() AND person.profile_status='active'
    WHERE facility.id=appointment_row.facility_id AND facility.facility_status='active'
    FOR SHARE OF facility,membership,license,person;
  ELSIF platform.context_role()='PAT' THEN
    PERFORM 1
    FROM identity.people person
    JOIN identity.patients patient ON patient.person_id=person.id AND patient.record_status='active'
    WHERE person.id=platform.context_person_id() AND person.profile_status='active'
    FOR SHARE OF person,patient;
  END IF;

  IF NOT clinical.feature_010_authorize_v1('listContextMessages',p_appointment_id) THEN
    RAISE EXCEPTION 'current appointment participant authority is required' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT pg_catalog.jsonb_build_object(
    'id',message.id,
    'contextType','appointment',
    'contextId',message.context_id,
    'senderId',message.sender_person_id,
    'bodyCiphertext',pg_catalog.replace(pg_catalog.replace(pg_catalog.encode(message.body_ciphertext,'base64'),E'\n',''),E'\r',''),
    'sentAt',pg_catalog.to_char(message.sent_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )
  FROM trust.messages message
  WHERE message.context_type='appointment'
    AND message.context_id=p_appointment_id
    AND message.deleted_at IS NULL
    AND (p_before_sent_at IS NULL OR (message.sent_at,message.id)<(p_before_sent_at,p_before_message_id))
  ORDER BY message.sent_at DESC,message.id DESC
  LIMIT p_limit;
END
$$;

CREATE OR REPLACE FUNCTION trust.send_context_message_api_v1(
  p_appointment_id uuid,
  p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  appointment_row clinical.appointments%ROWTYPE;
  queue_row clinical.queue_entries%ROWTYPE;
  encounter_row clinical.encounters%ROWTYPE;
  message_id uuid;
  ciphertext_value bytea;
  response_value jsonb;
  canonical_sent_at timestamptz;
BEGIN
  IF p_appointment_id IS NULL OR p_input IS NULL
     OR pg_catalog.jsonb_typeof(p_input)<>'object'
     OR NOT (p_input ? 'bodyCiphertext')
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_input))<>1
     OR pg_catalog.jsonb_typeof(p_input->'bodyCiphertext')<>'string'
     OR NULLIF(p_input->>'bodyCiphertext','') IS NULL THEN
    RAISE EXCEPTION 'sendContextMessage body-only request is invalid' USING ERRCODE='22023';
  END IF;
  IF platform.context_person_id() IS NULL
     OR platform.context_action() IS DISTINCT FROM 'sendContextMessage'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current context-message authority is required' USING ERRCODE='42501';
  END IF;
  IF (p_input->>'bodyCiphertext') !~ '^[A-Za-z0-9+/]*={0,2}$'
     OR pg_catalog.length(p_input->>'bodyCiphertext')%4<>0 THEN
    RAISE EXCEPTION 'message ciphertext envelope is invalid' USING ERRCODE='22023';
  END IF;
  BEGIN
    ciphertext_value := pg_catalog.decode(p_input->>'bodyCiphertext','base64');
  EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN
    RAISE EXCEPTION 'message ciphertext envelope is invalid' USING ERRCODE='22023';
  END;
  IF pg_catalog.replace(pg_catalog.replace(pg_catalog.encode(ciphertext_value,'base64'),E'\n',''),E'\r','')<>p_input->>'bodyCiphertext'
     OR pg_catalog.octet_length(ciphertext_value)<30
     OR pg_catalog.get_byte(ciphertext_value,0)<>1 THEN
    RAISE EXCEPTION 'message ciphertext envelope is invalid' USING ERRCODE='22023';
  END IF;

  -- Claim the idempotency key before state authorization so changed-body key
  -- reuse always conflicts. All later work rolls back with a rejected request.
  SELECT record_id,is_new,response_body
    INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/contexts/{contextType}/{contextId}/messages');
  IF NOT idem_new THEN
    IF idem_response IS NULL
       OR idem_response->>'id' IS NULL
       OR idem_response->>'contextType'<>'appointment'
       OR idem_response->>'contextId' IS DISTINCT FROM p_appointment_id::text
       OR idem_response->>'senderId' IS DISTINCT FROM actor::text
       OR NULLIF(idem_response->>'bodyCiphertext','') IS NULL THEN
      RAISE EXCEPTION 'idempotency key reused for a different message' USING ERRCODE='23505';
    END IF;
  END IF;

  -- Shared locks follow completion's appointment -> queue -> encounter order
  -- and conflict with participant ending at the encounter/participant rows.
  SELECT * INTO appointment_row
  FROM clinical.appointments appointment
  WHERE appointment.id=p_appointment_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current appointment context is not authorized' USING ERRCODE='42501';
  END IF;

  SELECT * INTO queue_row
  FROM clinical.queue_entries queue
  WHERE queue.appointment_id=p_appointment_id
  ORDER BY queue.id
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current appointment context is not authorized' USING ERRCODE='42501';
  END IF;

  SELECT * INTO encounter_row
  FROM clinical.encounters encounter
  WHERE encounter.appointment_id=p_appointment_id
    AND encounter.status='open'
  ORDER BY encounter.id
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current appointment context is not authorized' USING ERRCODE='42501';
  END IF;

  IF appointment_row.status<>'in_consultation'
     OR queue_row.state<>'in_service'
     OR queue_row.facility_id<>appointment_row.facility_id
     OR queue_row.doctor_person_id<>appointment_row.doctor_person_id
     OR queue_row.civil_date<>appointment_row.civil_date
     OR encounter_row.patient_person_id<>appointment_row.patient_person_id
     OR encounter_row.facility_id<>appointment_row.facility_id THEN
    RAISE EXCEPTION 'current appointment context is not authorized' USING ERRCODE='42501';
  END IF;

  IF platform.context_role()='CLN' THEN
    PERFORM 1 FROM clinical.encounter_participants participant
    WHERE participant.encounter_id=encounter_row.id
      AND participant.person_id=actor
      AND participant.started_at<=platform.context_now()
      AND participant.ended_at IS NULL
    FOR SHARE;
    PERFORM 1
    FROM identity.facilities facility
    JOIN identity.facility_memberships membership
      ON membership.facility_id=facility.id AND membership.person_id=actor
      AND membership.role_code='doctor' AND membership.membership_status='active'
      AND membership.valid_from<=platform.context_now()
      AND (membership.valid_until IS NULL OR membership.valid_until>platform.context_now())
    JOIN identity.professional_licenses license
      ON license.id=membership.employment_license_id AND license.person_id=actor
      AND license.profession='doctor' AND license.status='verified'
      AND license.expires_on>=(platform.context_now() AT TIME ZONE 'UTC')::date
    JOIN identity.people person ON person.id=actor AND person.profile_status='active'
    WHERE facility.id=appointment_row.facility_id AND facility.facility_status='active'
    FOR SHARE OF facility,membership,license,person;
  ELSIF platform.context_role()='PAT' THEN
    PERFORM 1
    FROM identity.people person
    JOIN identity.patients patient ON patient.person_id=person.id AND patient.record_status='active'
    WHERE person.id=actor AND person.profile_status='active'
    FOR SHARE OF person,patient;
  END IF;

  IF NOT clinical.feature_010_authorize_v1('sendContextMessage',p_appointment_id) THEN
    RAISE EXCEPTION 'current appointment participant authority is required' USING ERRCODE='42501';
  END IF;

  IF NOT idem_new THEN
    SELECT message.sent_at INTO canonical_sent_at
    FROM trust.messages message
    WHERE message.id=(idem_response->>'id')::uuid
      AND message.context_type='appointment'
      AND message.context_id=p_appointment_id
      AND message.sender_person_id=actor
      AND message.deleted_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'stored message response is unavailable' USING ERRCODE='55000';
    END IF;
    RETURN idem_response;
  END IF;

  INSERT INTO trust.messages(context_type,context_id,sender_person_id,body_ciphertext,attachment)
  VALUES('appointment',p_appointment_id,actor,ciphertext_value,NULL)
  RETURNING id,sent_at INTO message_id,canonical_sent_at;

  response_value := pg_catalog.jsonb_build_object(
    'id',message_id,
    'contextType','appointment',
    'contextId',p_appointment_id,
    'senderId',actor,
    'bodyCiphertext',pg_catalog.replace(pg_catalog.replace(pg_catalog.encode(ciphertext_value,'base64'),E'\n',''),E'\r',''),
    'sentAt',pg_catalog.to_char(canonical_sent_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
  PERFORM clinical.record_mutation_effect_v2(
    'clinical.context_message.created.v1','context_message.created','context_message',
    message_id,1,appointment_row.facility_id,appointment_row.patient_person_id
  );
  PERFORM clinical.complete_mutation_v1(idem_id,201,'context_message',message_id,response_value);
  RETURN response_value;
END
$$;

REVOKE ALL ON FUNCTION trust.list_context_messages_api_v1(uuid,timestamptz,uuid,integer),
  trust.send_context_message_api_v1(uuid,jsonb) FROM PUBLIC;
DO $feature_010_c22_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION trust.list_context_messages_api_v1(uuid,timestamptz,uuid,integer), trust.send_context_message_api_v1(uuid,jsonb) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='shifaa_api') THEN
    GRANT USAGE ON SCHEMA trust TO shifaa_api;
    GRANT EXECUTE ON FUNCTION trust.list_context_messages_api_v1(uuid,timestamptz,uuid,integer),
      trust.send_context_message_api_v1(uuid,jsonb) TO shifaa_api;
  END IF;
END
$feature_010_c22_execute_grants$;

COMMENT ON FUNCTION trust.list_context_messages_api_v1(uuid,timestamptz,uuid,integer) IS
  'C22 live-authorized appointment message page: locks the linked active encounter context, rechecks actor authority for every cursor page, and returns encrypted bodies only to the trusted adapter.';
COMMENT ON FUNCTION trust.send_context_message_api_v1(uuid,jsonb) IS
  'C22 atomic body-only message send: idempotency claim, compatible lifecycle locks, live authorization, encrypted insert, one audit/outbox effect, and encrypted canonical replay response.';

COMMIT;
