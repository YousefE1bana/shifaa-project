-- C12 RED probe. Runs after the approved C10 and C11 PostgreSQL migrations so
-- an absent routine is reported directly, before any note fixture is created.
DO $feature_010_c12_red$
BEGIN
  IF pg_catalog.to_regprocedure('clinical.sign_encounter_note_api_v1(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F010_C12_MISSING_SIGNER: clinical.sign_encounter_note_api_v1(uuid,jsonb)';
  END IF;
END
$feature_010_c12_red$;

-- This vector fragment is appended to the C11 fixture in the isolated
-- PostgreSQL runner. It runs with fixture setup committed only inside the
-- surrounding transaction, then rolls back with that transaction.
INSERT INTO clinical.encounter_participants(encounter_id,person_id,role_code,started_at)
VALUES ('f0101000-0000-4000-8800-000000000002','f0101000-0000-4000-8000-000000000003','consulting_clinician','2030-04-05T07:20:00Z');
INSERT INTO clinical.clinical_notes(id,encounter_id,author_person_id,note_type,body_ciphertext,visibility_code,signed_at)
VALUES ('f0101000-0000-4000-8900-000000000099','f0101000-0000-4000-8800-000000000003','f0101000-0000-4000-8000-000000000001','cross-encounter',decode('01'||repeat('a1',12)||repeat('b2',16)||repeat('c3',8),'hex'),'private','2030-04-05T06:10:00Z');

DO $feature_010_c12_boundary$
BEGIN
  IF pg_catalog.to_regprocedure('clinical.sign_encounter_note_api_v1(uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('clinical.feature_010_get_encounter_notes_projection_v1(uuid)') IS NULL THEN
    RAISE EXCEPTION 'C12 locked signer or authorized body projection is missing';
  END IF;
  IF NOT pg_catalog.has_function_privilege('shifaa_api','clinical.sign_encounter_note_api_v1(uuid,jsonb)','EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure_row.proacl,pg_catalog.acldefault('f',procedure_row.proowner))) privilege
       WHERE procedure_row.oid='clinical.sign_encounter_note_api_v1(uuid,jsonb)'::regprocedure
         AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
     ) THEN
    RAISE EXCEPTION 'C12 signer execute grants are not narrow';
  END IF;
END
$feature_010_c12_boundary$;

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c12_online_vectors$
DECLARE
  encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  request jsonb;
  response jsonb;
  replay jsonb;
  denied boolean;
  note_id uuid;
  private_cipher text := pg_catalog.encode(pg_catalog.decode('01'||pg_catalog.repeat('a1',12)||pg_catalog.repeat('b2',16)||pg_catalog.repeat('c3',24),'hex'),'base64');
  released_cipher text := pg_catalog.encode(pg_catalog.decode('01'||pg_catalog.repeat('d1',12)||pg_catalog.repeat('e2',16)||pg_catalog.repeat('f3',24),'hex'),'base64');
  protected_projection jsonb;
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'C12 assertions must run with the non-owner, non-BYPASSRLS online role';
  END IF;
  IF pg_catalog.has_table_privilege(current_user,'clinical.clinical_notes','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'C12 online role has direct clinical note table privileges';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','signEncounterNote',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000021',true);
  PERFORM pg_catalog.set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000021',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-private-key-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('1',64),true);
  request := pg_catalog.jsonb_build_object('noteType','c12-private','visibility','private','bodyCiphertext',private_cipher);
  SELECT clinical.sign_encounter_note_api_v1(encounter_id,request) INTO response;
  SELECT clinical.sign_encounter_note_api_v1(encounter_id,request) INTO replay;
  IF response IS DISTINCT FROM replay OR response::text IS DISTINCT FROM replay::text
     OR response ? 'body' OR NOT (response ? 'bodyCiphertext') THEN
    RAISE EXCEPTION 'C12 exact replay did not return the same protected canonical response';
  END IF;
  note_id := (response->>'id')::uuid;
  PERFORM pg_catalog.set_config('shifaa.test_c12_response',response::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c12_note_id',note_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c12_replay_key','f010-c12-private-key-001',true);

  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('2',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.sign_encounter_note_api_v1(encounter_id,
      pg_catalog.jsonb_build_object('noteType','c12-private','visibility','private','bodyCiphertext',released_cipher));
  EXCEPTION WHEN unique_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C12 accepted changed-body reuse of a completed idempotency key'; END IF;

  -- A current treating clinician who is neither the signed author nor the
  -- responsible clinician cannot correct that signed version.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-unrelated-corrector',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('3',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.sign_encounter_note_api_v1(encounter_id,
      pg_catalog.jsonb_build_object('noteType','c12-denied','visibility','private','supersedesId','f0101000-0000-4000-8900-000000000001','bodyCiphertext',private_cipher));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C12 unrelated current clinician corrected another author’s note'; END IF;

  -- A different encounter's note is not a valid supersession target.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-cross-encounter',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('4',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.sign_encounter_note_api_v1(encounter_id,
      pg_catalog.jsonb_build_object('noteType','c12-denied','visibility','private','supersedesId','f0101000-0000-4000-8900-000000000099','bodyCiphertext',private_cipher));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C12 accepted cross-encounter supersession'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-invalid-visibility',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('8',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.sign_encounter_note_api_v1(encounter_id,
      pg_catalog.jsonb_build_object('noteType','c12-invalid','visibility','internal','bodyCiphertext',private_cipher));
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C12 accepted an unsupported note visibility'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-invalid-envelope',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('9',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.sign_encounter_note_api_v1(encounter_id,
      pg_catalog.jsonb_build_object('noteType','c12-invalid','visibility','private','bodyCiphertext','not-base64'));
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C12 accepted a malformed protected body envelope'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-stale-encounter',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('a',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.sign_encounter_note_api_v1('f0101000-0000-4000-8800-000000000003',
      pg_catalog.jsonb_build_object('noteType','c12-stale','visibility','private','bodyCiphertext',private_cipher));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C12 accepted signing on a completed encounter'; END IF;
END
$feature_010_c12_online_vectors$;
RESET SESSION AUTHORIZATION;

DO $feature_010_c12_negative_atomic_effects$
BEGIN
  IF (SELECT count(*) FROM clinical.clinical_notes WHERE note_type LIKE 'c12-%')<>1
     OR (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/encounters/{encounterId}/notes' AND state='completed')<>1
     OR (SELECT count(*) FROM audit.events WHERE resource_type='clinical_note' AND action_code='encounter.note_signed')<>1
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='clinical_note' AND event_type='clinical.note.signed.v1')<>1 THEN
    RAISE EXCEPTION 'C12 negative counts differed: notes %, idempotency %, audit %, outbox %',
      (SELECT count(*) FROM clinical.clinical_notes WHERE note_type LIKE 'c12-%'),
      (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/encounters/{encounterId}/notes' AND state='completed'),
      (SELECT count(*) FROM audit.events WHERE resource_type='clinical_note' AND action_code='encounter.note_signed'),
      (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='clinical_note' AND event_type='clinical.note.signed.v1');
  END IF;
END
$feature_010_c12_negative_atomic_effects$;

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c12_correction_vectors$
DECLARE
  encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  note_id uuid := pg_catalog.current_setting('shifaa.test_c12_note_id')::uuid;
  response jsonb;
  denied boolean;
  private_cipher text := pg_catalog.encode(pg_catalog.decode('01'||pg_catalog.repeat('a1',12)||pg_catalog.repeat('b2',16)||pg_catalog.repeat('c3',24),'hex'),'base64');
  released_cipher text := pg_catalog.encode(pg_catalog.decode('01'||pg_catalog.repeat('d1',12)||pg_catalog.repeat('e2',16)||pg_catalog.repeat('f3',24),'hex'),'base64');
  protected_projection jsonb;
BEGIN

  -- The original author can append a private correction without changing the
  -- prior ciphertext or visibility.
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-author-correction',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('5',64),true);
  SELECT clinical.sign_encounter_note_api_v1(encounter_id,
    pg_catalog.jsonb_build_object('noteType','c12-private-correction','visibility','private','supersedesId',note_id,'bodyCiphertext',private_cipher)) INTO response;
  IF response->>'supersedesId' IS DISTINCT FROM note_id::text OR response->>'authorId' IS DISTINCT FROM 'f0101000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'C12 original author correction did not append the expected signed version';
  END IF;

  -- The alternate current clinician signs a patient-visible note; the current
  -- responsible clinician may append its correction.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-alt-original',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('6',64),true);
  SELECT clinical.sign_encounter_note_api_v1(encounter_id,
    pg_catalog.jsonb_build_object('noteType','c12-release','visibility','patient_visible','bodyCiphertext',released_cipher)) INTO response;
  note_id := (response->>'id')::uuid;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-responsible-correction',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('7',64),true);
  SELECT clinical.sign_encounter_note_api_v1(encounter_id,
    pg_catalog.jsonb_build_object('noteType','c12-release-correction','visibility','patient_visible','supersedesId',note_id,'bodyCiphertext',released_cipher)) INTO response;
  IF response->>'supersedesId' IS DISTINCT FROM note_id::text THEN
    RAISE EXCEPTION 'C12 current responsible clinician could not correct an authorized current note';
  END IF;

  -- The subject, guardian, and delegate receive only patient_visible note
  -- bodies. The treating CLN can read private and patient_visible ciphertext.
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  SELECT clinical.feature_010_get_encounter_notes_projection_v1(encounter_id) INTO protected_projection;
  IF protected_projection IS NULL OR protected_projection::text LIKE '%"private"%' OR protected_projection::text LIKE '%c12-private%' THEN
    RAISE EXCEPTION 'C12 PAT projection included a private signed note';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  SELECT clinical.feature_010_get_encounter_notes_projection_v1(encounter_id) INTO protected_projection;
  IF protected_projection IS NULL OR protected_projection::text LIKE '%"private"%' THEN
    RAISE EXCEPTION 'C12 GUA projection included a private signed note';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  SELECT clinical.feature_010_get_encounter_notes_projection_v1(encounter_id) INTO protected_projection;
  IF protected_projection IS NULL OR protected_projection::text LIKE '%"private"%' THEN
    RAISE EXCEPTION 'C12 DEL projection included a private signed note';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  SELECT clinical.feature_010_get_encounter_notes_projection_v1(encounter_id) INTO protected_projection;
  IF protected_projection IS NULL OR protected_projection::text NOT LIKE '%"private"%' OR protected_projection::text NOT LIKE '%bodyCiphertext%' THEN
    RAISE EXCEPTION 'C12 CLN projection did not contain authorized private ciphertext';
  END IF;

  denied := false;
  BEGIN
    UPDATE clinical.clinical_notes SET visibility_code='patient_visible' WHERE id=pg_catalog.current_setting('shifaa.test_c12_note_id')::uuid;
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE '55000' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C12 online role directly mutated a signed note'; END IF;
  denied := false;
  BEGIN
    DELETE FROM clinical.clinical_notes WHERE id=pg_catalog.current_setting('shifaa.test_c12_note_id')::uuid;
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE '55000' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C12 online role directly deleted a signed note'; END IF;
END
$feature_010_c12_correction_vectors$;
RESET SESSION AUTHORIZATION;

UPDATE clinical.encounter_participants
SET ended_at='2030-04-05T07:21:00Z'
WHERE encounter_id='f0101000-0000-4000-8800-000000000002'
  AND person_id='f0101000-0000-4000-8000-000000000003'
  AND role_code='consulting_clinician'
  AND started_at='2030-04-05T07:20:00Z'
  AND ended_at IS NULL;
SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c12_revoked_authority$
DECLARE denied boolean := false;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','signEncounterNote',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c12-revoked-authority',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('b',64),true);
  BEGIN
    PERFORM clinical.sign_encounter_note_api_v1('f0101000-0000-4000-8800-000000000002',
      pg_catalog.jsonb_build_object('noteType','c12-revoked','visibility','private',
        'bodyCiphertext',pg_catalog.encode(pg_catalog.decode('01'||pg_catalog.repeat('d1',12)||pg_catalog.repeat('e2',16)||pg_catalog.repeat('f3',24),'hex'),'base64')));
  EXCEPTION WHEN no_data_found THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C12 signed a note after current treating authority was revoked'; END IF;
END
$feature_010_c12_revoked_authority$;
RESET SESSION AUTHORIZATION;

DO $feature_010_c12_atomic_effects$
DECLARE note_id uuid := pg_catalog.current_setting('shifaa.test_c12_note_id')::uuid;
  stored_response jsonb;
  ciphertext_value text;
  replay_key text := pg_catalog.current_setting('shifaa.test_c12_replay_key');
BEGIN
  SELECT pg_catalog.encode(body_ciphertext,'base64') INTO ciphertext_value
  FROM clinical.clinical_notes WHERE id=note_id;
  SELECT response_body INTO stored_response
  FROM platform.idempotency_records
  WHERE method='POST' AND route_template='/v1/encounters/{encounterId}/notes'
    AND key_hash=pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to(
      'shifaa:idempotency:key:v1:'||pg_catalog.octet_length(replay_key)||':'||replay_key,'UTF8')),'hex');
  IF stored_response IS DISTINCT FROM pg_catalog.current_setting('shifaa.test_c12_response')::jsonb
     OR stored_response ? 'body' OR NOT (stored_response ? 'bodyCiphertext')
     OR stored_response->>'bodyCiphertext' IS DISTINCT FROM (
       SELECT pg_catalog.encode(body_ciphertext,'base64')
       FROM clinical.clinical_notes WHERE id=note_id
     )
     OR (SELECT count(*) FROM clinical.clinical_notes WHERE note_type LIKE 'c12-%')<>4
     OR (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/encounters/{encounterId}/notes' AND state='completed')<>4
     OR (SELECT count(*) FROM audit.events WHERE resource_type='clinical_note' AND action_code='encounter.note_signed')<>4
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='clinical_note' AND event_type='clinical.note.signed.v1')<>4
     OR EXISTS (SELECT 1 FROM platform.outbox_events
       WHERE event_type='clinical.note.signed.v1'
         AND (payload ? 'body' OR payload ? 'bodyCiphertext'
           OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(payload))<>2))
     OR EXISTS (SELECT 1 FROM audit.events event
       WHERE event.resource_type='clinical_note' AND event.action_code='encounter.note_signed'
         AND (
           pg_catalog.to_jsonb(event) ? 'body'
           OR pg_catalog.to_jsonb(event) ? 'bodyCiphertext'
           OR pg_catalog.to_jsonb(event)::text LIKE '%c12-private%'
         ))
     OR EXISTS (SELECT 1 FROM audit.events event
       WHERE event.resource_type='clinical_note' AND event.action_code='encounter.note_signed'
         AND pg_catalog.strpos(pg_catalog.to_jsonb(event)::text,ciphertext_value)>0)
     OR EXISTS (SELECT 1 FROM platform.outbox_events event
       WHERE event.aggregate_type='clinical_note' AND event.event_type='clinical.note.signed.v1'
         AND pg_catalog.strpos(pg_catalog.to_jsonb(event)::text,ciphertext_value)>0)
     OR EXISTS (SELECT 1 FROM platform.idempotency_records record
       WHERE record.method='POST' AND record.route_template='/v1/encounters/{encounterId}/notes'
         AND pg_catalog.strpos((pg_catalog.to_jsonb(record)-'response_body')::text,ciphertext_value)>0) THEN
    RAISE EXCEPTION 'C12 replay/effects are not protected and exactly once';
  END IF;
  IF (SELECT body_ciphertext FROM clinical.clinical_notes WHERE id=note_id) IS NULL
     OR (SELECT visibility_code FROM clinical.clinical_notes WHERE id=note_id)<>'private'
     OR NOT EXISTS (SELECT 1 FROM clinical.clinical_notes WHERE supersedes_id=note_id AND note_type='c12-private-correction')
     OR NOT EXISTS (SELECT 1 FROM clinical.clinical_notes WHERE note_type='c12-release-correction' AND visibility_code='patient_visible') THEN
    RAISE EXCEPTION 'C12 append-only correction history or visibility changed';
  END IF;
END
$feature_010_c12_atomic_effects$;
