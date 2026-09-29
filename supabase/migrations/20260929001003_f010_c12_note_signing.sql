-- C12 adds a locked, append-only signed-note boundary. The canonical stored
-- response contains only the already encrypted body envelope.
BEGIN;

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
 'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked','relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked','emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked','sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required','notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
 'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
 'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1',
 'clinical.encounter.opened.v1','clinical.encounter.updated.v1','clinical.note.signed.v1'
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
    'clinical.encounter.opened.v1','clinical.encounter.updated.v1','clinical.note.signed.v1'
  );

CREATE OR REPLACE FUNCTION clinical.feature_010_get_encounter_notes_projection_v1(
  p_encounter_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE note_projection jsonb;
BEGIN
  IF NOT clinical.feature_010_authorize_v1('getEncounter',p_encounter_id) THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',note.id,
    'encounterId',note.encounter_id,
    'authorId',note.author_person_id,
    'noteType',note.note_type,
    'visibility',note.visibility_code,
    'signedAt',note.signed_at,
    'supersedesId',note.supersedes_id,
    'bodyCiphertext',pg_catalog.encode(note.body_ciphertext,'base64')
  )) ORDER BY note.signed_at,note.id),'[]'::jsonb)
  INTO note_projection
  FROM clinical.clinical_notes note
  WHERE note.encounter_id=p_encounter_id
    AND clinical.feature_010_note_row_visible_v1(note.encounter_id,note.visibility_code);
  RETURN note_projection;
END
$$;

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

REVOKE ALL ON FUNCTION clinical.feature_010_get_encounter_notes_projection_v1(uuid),
  clinical.sign_encounter_note_api_v1(uuid,jsonb) FROM PUBLIC;
DO $feature_010_c12_note_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION clinical.feature_010_get_encounter_notes_projection_v1(uuid), clinical.sign_encounter_note_api_v1(uuid,jsonb) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  GRANT EXECUTE ON FUNCTION clinical.feature_010_get_encounter_notes_projection_v1(uuid),
    clinical.sign_encounter_note_api_v1(uuid,jsonb) TO shifaa_api;
END
$feature_010_c12_note_execute_grants$;

COMMENT ON FUNCTION clinical.sign_encounter_note_api_v1(uuid,jsonb) IS
  'C12 online note-signing boundary: current CLN authority, locked same-encounter correction rule, immutable encrypted version, atomic audit/outbox, and encrypted canonical idempotent response.';

COMMIT;
