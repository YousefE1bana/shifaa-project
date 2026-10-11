-- Feature 011 K06: narrow allergy consumers.  The application is the trusted
-- plaintext boundary; these functions accept only closed opaque preparations.

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
  'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
  'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked',
  'relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked',
  'emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked',
  'sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed',
  'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
  'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
  'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
  'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1',
  'clinical.encounter.opened.v1','clinical.encounter.updated.v1','clinical.note.signed.v1','clinical.encounter.completed.v1',
  'clinical.referral.pending.v1','clinical.referral.accepted.v1','clinical.context_message.created.v1',
  'clinical.allergy.changed.v1','clinical.content_release.changed.v1'
));

CREATE FUNCTION clinical.f011_assert_exact_keys_v1(p_value jsonb, p_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actual_count integer;
BEGIN
  IF p_value IS NULL OR pg_catalog.jsonb_typeof(p_value) <> 'object'
     OR p_keys IS NULL THEN
    RAISE EXCEPTION 'invalid closed Feature 011 object' USING ERRCODE = '22023';
  END IF;
  SELECT pg_catalog.count(*) INTO actual_count
  FROM pg_catalog.jsonb_object_keys(p_value) AS item(key);
  IF actual_count <> pg_catalog.cardinality(p_keys)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(p_keys) AS expected(key)
       WHERE NOT (p_value ? expected.key)
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_object_keys(p_value) AS item(key)
       WHERE NOT (item.key = ANY(p_keys))
     ) THEN
    RAISE EXCEPTION 'Feature 011 object has missing or unknown members' USING ERRCODE = '22023';
  END IF;
END
$function$;

CREATE FUNCTION clinical.f011_assert_response_context_v1(
  p_operation text, p_language text, p_request_id uuid, p_min_aal integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := platform.context_person_id();
  native_request_id uuid := NULLIF(pg_catalog.current_setting('shifaa.request_id', true), '')::uuid;
BEGIN
  IF session_user <> 'shifaa_api'
     OR actor IS NULL
     OR platform.context_action() IS DISTINCT FROM p_operation
     OR platform.context_role() IS NULL
     OR platform.context_aal() < p_min_aal
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()), 0) = 0
     OR p_language NOT IN ('ar-EG', 'en-EG')
     OR p_request_id IS NULL
     OR native_request_id IS DISTINCT FROM p_request_id THEN
    RAISE EXCEPTION 'Feature 011 request context is not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN actor;
END
$function$;

CREATE FUNCTION clinical.f011_decode_envelope_v1(p_envelope jsonb, p_contract text)
RETURNS TABLE(key_ref text, nonce_bytes bytea, ciphertext_bytes bytea, tag_bytes bytea)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  nonce_hex text;
  ciphertext_hex text;
  tag_hex text;
BEGIN
  PERFORM clinical.f011_assert_exact_keys_v1(
    p_envelope, ARRAY['contractId','keyRef','nonce','ciphertext','authTag']::text[]
  );
  IF p_envelope->>'contractId' IS DISTINCT FROM p_contract
     OR pg_catalog.jsonb_typeof(p_envelope->'keyRef') <> 'string'
     OR pg_catalog.length(p_envelope->>'keyRef') = 0 THEN
    RAISE EXCEPTION 'invalid protected Feature 011 envelope' USING ERRCODE = '22023';
  END IF;
  nonce_hex := p_envelope->>'nonce';
  ciphertext_hex := p_envelope->>'ciphertext';
  tag_hex := p_envelope->>'authTag';
  IF nonce_hex !~ '^(?:[0-9a-f]{2}){12}$'
     OR ciphertext_hex !~ '^(?:[0-9a-f]{2})+$'
     OR tag_hex !~ '^(?:[0-9a-f]{2}){16}$' THEN
    RAISE EXCEPTION 'invalid protected Feature 011 envelope bytes' USING ERRCODE = '22023';
  END IF;
  key_ref := p_envelope->>'keyRef';
  nonce_bytes := pg_catalog.decode(nonce_hex, 'hex');
  ciphertext_bytes := pg_catalog.decode(ciphertext_hex, 'hex');
  tag_bytes := pg_catalog.decode(tag_hex, 'hex');
  RETURN NEXT;
END
$function$;

CREATE FUNCTION clinical.f011_record_mutation_effect_v1(
  p_idempotency_record_id uuid,
  p_actor_person_id uuid,
  p_operation_id text,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_version integer,
  p_response_status smallint,
  p_response_language text,
  p_response_request_id uuid,
  p_facility_id uuid DEFAULT NULL,
  p_patient_person_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  receipt_id uuid := pg_catalog.gen_random_uuid();
  response_etag text := '"' || p_resource_version::text || '"';
  effect_action text;
  event_type text;
  audit_row record;
  outbox_id uuid;
  occurred_at_value timestamptz := platform.context_now();
BEGIN
  IF p_idempotency_record_id IS NULL OR p_actor_person_id IS DISTINCT FROM platform.context_person_id()
     OR p_resource_id IS NULL OR p_resource_version < 1 OR p_response_request_id IS NULL
     OR p_response_language NOT IN ('ar-EG','en-EG') THEN
    RAISE EXCEPTION 'Feature 011 commit metadata is incomplete' USING ERRCODE = '22023';
  END IF;
  effect_action := CASE p_operation_id
    WHEN 'createAllergy' THEN 'allergy.created'
    WHEN 'verifyAllergy' THEN 'allergy.verified'
    WHEN 'createClinicalContentRelease' THEN 'clinical_content_release.created'
    WHEN 'signClinicalContentRelease' THEN 'clinical_content_release.signed'
    WHEN 'publishClinicalContentRelease' THEN 'clinical_content_release.published'
    ELSE NULL END;
  event_type := CASE p_resource_type
    WHEN 'clinical.allergy_revision' THEN 'clinical.allergy.changed.v1'
    WHEN 'clinical.content_release' THEN 'clinical.content_release.changed.v1'
    ELSE NULL END;
  IF effect_action IS NULL OR event_type IS NULL THEN
    RAISE EXCEPTION 'unsupported Feature 011 mutation' USING ERRCODE = '22023';
  END IF;

  SELECT appended.event_id, appended.event_occurred_at
  INTO STRICT audit_row
  FROM audit.append_event_v1(
    p_response_request_id,
    p_response_request_id::text,
    effect_action,
    p_resource_type,
    'success',
    p_actor_person_id => p_actor_person_id,
    p_authentication_aal => NULLIF(platform.context_aal(), 0)::smallint,
    p_facility_id => p_facility_id,
    p_patient_id => (SELECT patient.id FROM identity.patients patient
      WHERE patient.person_id = p_patient_person_id),
    p_purpose_code => (platform.context_purposes())[1],
    p_resource_id => p_resource_id,
    p_resource_version => p_resource_version,
    p_user_agent_class => 'service'
  ) AS appended;

  INSERT INTO platform.outbox_events(
    aggregate_type, aggregate_id, aggregate_version, event_type, payload
  ) VALUES (
    p_resource_type, p_resource_id, p_resource_version, event_type, '{}'::jsonb
  ) RETURNING id INTO outbox_id;

  INSERT INTO clinical.mutation_commit_obligations(
    idempotency_record_id, receipt_id, actor_person_id, operation_id,
    resource_type, resource_id, resource_version, response_status, response_etag,
    response_language, response_request_id, audit_event_occurred_at, audit_event_id,
    outbox_event_id, occurred_at
  ) VALUES (
    p_idempotency_record_id, receipt_id, p_actor_person_id, p_operation_id,
    p_resource_type, p_resource_id, p_resource_version, p_response_status, response_etag,
    p_response_language, p_response_request_id, audit_row.event_occurred_at, audit_row.event_id,
    outbox_id, occurred_at_value
  );

  RETURN pg_catalog.jsonb_build_object(
    'receiptId', receipt_id,
    'actorPersonId', p_actor_person_id,
    'operationId', p_operation_id,
    'resourceType', p_resource_type,
    'resourceId', p_resource_id,
    'resourceVersion', p_resource_version,
    'responseStatus', p_response_status,
    'responseEtag', response_etag,
    'responseLanguage', p_response_language,
    'responseRequestId', p_response_request_id,
    'occurredAt', occurred_at_value,
    'auditEventId', audit_row.event_id,
    'auditEventOccurredAt', audit_row.event_occurred_at,
    'outboxEventId', outbox_id
  );
END
$function$;

CREATE FUNCTION clinical.f011_allergy_current_authority_v1(
  p_patient_id uuid, p_action text, p_facility_id uuid, p_encounter_id uuid
)
RETURNS TABLE(patient_person_id uuid, patient_id uuid, facility_id uuid, encounter_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := platform.context_person_id();
  actor_role text := platform.context_role();
  patient_person uuid;
  native_facility uuid := NULLIF(pg_catalog.current_setting('shifaa.facility_id', true), '')::uuid;
  native_encounter uuid := NULLIF(pg_catalog.current_setting('shifaa.encounter_id', true), '')::uuid;
  encounter_patient uuid;
  encounter_facility uuid;
  relationship_type_value text;
  candidate_relationship_ids uuid[] := ARRAY[]::uuid[];
  locked_evidence_ids uuid[] := ARRAY[]::uuid[];
  family_people uuid[] := ARRAY[]::uuid[];
  family_row record;
  family_authorized boolean := false;
BEGIN
  IF session_user <> 'shifaa_api'
     OR actor IS NULL OR p_patient_id IS NULL OR p_action NOT IN ('listAllergies','createAllergy','verifyAllergy')
     OR platform.context_action() IS DISTINCT FROM p_action
     OR platform.context_aal() < (CASE WHEN p_action = 'verifyAllergy' THEN 2 ELSE 1 END)
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0) = 0
     OR p_facility_id IS DISTINCT FROM native_facility
     OR p_encounter_id IS DISTINCT FROM native_encounter THEN
    RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE = '42501';
  END IF;

  SELECT patient.person_id INTO patient_person
  FROM identity.patients patient
  WHERE patient.id = p_patient_id AND patient.record_status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE = '42501';
  END IF;

  IF actor_role = 'PAT' AND actor = patient_person THEN
    IF p_action = 'verifyAllergy' THEN
      RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE = '42501';
    END IF;
  ELSIF actor_role = 'CLN' AND native_facility IS NOT NULL AND native_encounter IS NOT NULL
        AND COALESCE(pg_catalog.cardinality(platform.context_purposes()),0) > 0
        AND platform.context_aal() >= (CASE WHEN p_action = 'verifyAllergy' THEN 2 ELSE 1 END) THEN
    IF p_action = 'listAllergies' THEN
      SELECT encounter.patient_person_id, encounter.facility_id
      INTO encounter_patient, encounter_facility
      FROM clinical.encounters encounter
      WHERE encounter.id = native_encounter
      FOR SHARE;
      IF NOT FOUND OR encounter_patient IS DISTINCT FROM patient_person
         OR encounter_facility IS DISTINCT FROM native_facility
         OR NOT clinical.f011_lock_clinician_scope_v1(native_facility,native_encounter,actor) THEN
        RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT clinical.feature_010_current_encounter_clinician_v1(native_encounter, false) THEN
      RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE = '42501';
    END IF;
  ELSIF p_action = 'listAllergies' AND actor_role IN ('GUA','DEL') THEN
    relationship_type_value := CASE actor_role WHEN 'GUA' THEN 'guardianship' ELSE 'delegation' END;

    -- Discover the rank-6 relationship set first so guardianship evidence
    -- parents can be locked at rank 5, before relationships and permissions.
    SELECT COALESCE(pg_catalog.array_agg(relation.id ORDER BY relation.id),ARRAY[]::uuid[]),
           COALESCE(pg_catalog.array_agg(DISTINCT relation.evidence_object_id)
             FILTER (WHERE relation.evidence_object_id IS NOT NULL),ARRAY[]::uuid[])
    INTO candidate_relationship_ids,locked_evidence_ids
    FROM identity.care_relationships relation
    WHERE relation.subject_patient_id=p_patient_id
      AND relation.actor_person_id=actor
      AND relation.relationship_type=relationship_type_value;
    PERFORM evidence.id FROM identity.private_evidence_objects evidence
    WHERE evidence.id=ANY(locked_evidence_ids)
    ORDER BY evidence.id FOR SHARE;

    -- Lock the matching relationship/permission rows in canonical order and
    -- derive authorization only from rows present in this locked snapshot.
    family_people := ARRAY[actor,patient_person]::uuid[];
    FOR family_row IN
      SELECT relation.id AS relationship_id,relation.relationship_type,relation.status,
        relation.valid_from,relation.valid_until,relation.purpose_code,relation.evidence_object_id,
        relation.reviewed_by_person_id,relation.reviewed_at,relation.decision_reason_code,
        relation.invite_token_digest,relation.invite_consumed_at,relation.actor_person_id,
        relation.created_by_person_id,permission.created_by_person_id AS permission_created_by
      FROM identity.care_relationships relation
      JOIN identity.care_relationship_permissions permission
        ON permission.relationship_id=relation.id
       AND permission.permission_code='record.view'
       AND permission.revoked_at IS NULL
      WHERE relation.id=ANY(candidate_relationship_ids)
      ORDER BY relation.id,permission.created_at
      FOR SHARE OF relation,permission
    LOOP
      family_people := pg_catalog.array_append(family_people,family_row.actor_person_id);
      family_people := pg_catalog.array_append(family_people,family_row.created_by_person_id);
      family_people := pg_catalog.array_append(family_people,family_row.reviewed_by_person_id);
      family_people := pg_catalog.array_append(family_people,family_row.permission_created_by);
      IF family_row.status='active'
         AND family_row.valid_from<=platform.context_now()
         AND (family_row.valid_until IS NULL OR family_row.valid_until>platform.context_now())
         AND family_row.purpose_code=ANY(platform.context_purposes())
         AND (
           (relationship_type_value='guardianship'
             AND family_row.evidence_object_id IS NOT NULL
             AND family_row.evidence_object_id=ANY(locked_evidence_ids)
             AND family_row.reviewed_by_person_id IS NOT NULL
             AND family_row.reviewed_at IS NOT NULL
             AND family_row.decision_reason_code IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM identity.private_evidence_objects evidence
               WHERE evidence.id=family_row.evidence_object_id
                 AND evidence.bucket_code='guardianship-evidence'
                 AND evidence.owner_person_id=family_row.actor_person_id
                 AND evidence.resource_patient_id=p_patient_id
                 AND evidence.scan_status='released'
             ))
           OR (relationship_type_value='delegation'
             AND family_row.evidence_object_id IS NULL
             AND family_row.invite_token_digest IS NULL
             AND family_row.invite_consumed_at IS NOT NULL)
         ) THEN
        family_authorized := true;
      END IF;
    END LOOP;
    IF NOT family_authorized OR NOT clinical.feature_010_family_authority_v1(
      patient_person,actor,relationship_type_value,true,false
    ) THEN
      RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE = '42501';
  END IF;

  IF p_action='listAllergies' THEN
    -- Rank 6 follows the complete relationship/permission set. The patient
    -- mapping is immutable, but is rechecked under its shared row lock.
    PERFORM 1 FROM identity.patients patient
    WHERE patient.id=p_patient_id AND patient.person_id=patient_person
      AND patient.record_status='active'
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE='42501'; END IF;
    IF actor_role IN ('GUA','DEL') THEN
      family_people := pg_catalog.array_append(family_people,actor);
      family_people := pg_catalog.array_append(family_people,patient_person);
    ELSE
      family_people := ARRAY[actor,patient_person]::uuid[];
    END IF;
    PERFORM person.id FROM identity.people person
    WHERE person.id=ANY(family_people)
    ORDER BY person.id FOR SHARE;
    IF NOT EXISTS (SELECT 1 FROM identity.people person
      WHERE person.id=actor AND person.profile_status='active') THEN
      RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE='42501';
    END IF;

    -- Consent evidence is immutable and purpose-scoped. Lock any existing
    -- current-context records before the encounter participant interval.
    PERFORM consent_row.id FROM consent.records consent_row
    WHERE consent_row.person_id IN (actor,patient_person)
      AND consent_row.purpose_code=ANY(platform.context_purposes())
    ORDER BY consent_row.person_id,consent_row.purpose_code,consent_row.occurred_at,consent_row.id
    FOR SHARE;
    IF native_encounter IS NOT NULL THEN
      PERFORM 1 FROM clinical.encounter_participants participant
      WHERE participant.encounter_id=native_encounter AND participant.person_id=actor
        AND participant.ended_at IS NULL AND participant.started_at<=platform.context_now()
      FOR SHARE;
      IF actor_role='CLN' AND NOT FOUND THEN
        RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE='42501';
      END IF;
      IF actor_role='CLN' AND NOT clinical.feature_010_current_encounter_clinician_v1(native_encounter,false) THEN
        RAISE EXCEPTION 'Feature 011 allergy authority denied' USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT patient_person, p_patient_id, native_facility, native_encounter;
END
$function$;

CREATE FUNCTION clinical.f011_lock_clinician_scope_v1(
  p_facility_id uuid, p_encounter_id uuid, p_actor_person_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  membership_license_id uuid;
  license_evidence_id uuid;
  facility_license_evidence_id uuid;
BEGIN
  IF p_facility_id IS NULL OR p_encounter_id IS NULL OR p_actor_person_id IS NULL THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM identity.facilities facility
  WHERE facility.id = p_facility_id AND facility.facility_status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT membership.employment_license_id INTO membership_license_id
  FROM identity.facility_memberships membership
  WHERE membership.facility_id = p_facility_id AND membership.person_id = p_actor_person_id
    AND membership.role_code = 'doctor' AND membership.membership_status = 'active'
    AND membership.valid_from <= platform.context_now()
    AND (membership.valid_until IS NULL OR membership.valid_until > platform.context_now())
  ORDER BY membership.id LIMIT 1;
  IF membership_license_id IS NULL THEN RETURN false; END IF;

  -- Lock workforce predicates in the approved rank-5 order:
  -- facility (above), professional license, facility license, membership.
  SELECT license.evidence_object_id INTO license_evidence_id
  FROM identity.professional_licenses license
  WHERE license.id = membership_license_id AND license.person_id = p_actor_person_id
    AND license.profession = 'doctor' AND license.status = 'verified'
    AND license.expires_on >= (platform.context_now() AT TIME ZONE 'UTC')::date
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT facility_license.evidence_object_id INTO facility_license_evidence_id
  FROM identity.facility_licenses facility_license
  WHERE facility_license.facility_id = p_facility_id
    AND facility_license.status = 'verified'
    AND facility_license.expires_on >= (platform.context_now() AT TIME ZONE 'UTC')::date
  ORDER BY facility_license.id LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  PERFORM 1 FROM identity.facility_memberships membership
  WHERE membership.facility_id = p_facility_id AND membership.person_id = p_actor_person_id
    AND membership.employment_license_id = membership_license_id
    AND membership.role_code = 'doctor' AND membership.membership_status = 'active'
    AND membership.valid_from <= platform.context_now()
    AND (membership.valid_until IS NULL OR membership.valid_until > platform.context_now())
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM evidence.id FROM identity.private_evidence_objects evidence
  WHERE evidence.id IN (facility_license_evidence_id,license_evidence_id)
  ORDER BY evidence.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM identity.private_evidence_objects evidence
      WHERE evidence.id=facility_license_evidence_id
        AND evidence.bucket_code='facility-license-evidence'
        AND evidence.facility_id=p_facility_id AND evidence.scan_status='released')
     OR (license_evidence_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM identity.private_evidence_objects evidence
       WHERE evidence.id=license_evidence_id
         AND evidence.bucket_code='professional-license-evidence'
         AND evidence.owner_person_id=p_actor_person_id AND evidence.scan_status='released'
     )) THEN RETURN false; END IF;
  RETURN true;
END
$function$;

CREATE FUNCTION clinical.list_allergies_api_v1(p_patient_id uuid, p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  view_value text := COALESCE(p_input->>'view', 'current');
  requested_status text := p_input->>'status';
  requested_allergy uuid := NULLIF(p_input->>'allergyId','')::uuid;
  page_limit integer := COALESCE(NULLIF(p_input->>'limit','')::integer, 25);
  cursor_value jsonb := p_input->'cursor';
  cursor_recorded_at timestamptz;
  cursor_revision_id uuid;
  continuation_value jsonb;
  has_more boolean := false;
  actor uuid := platform.context_person_id();
  authority record;
  result_data jsonb;
BEGIN
  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input) <> 'object'
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(p_input) AS key(name)
       WHERE NOT (key.name = ANY(ARRAY['view','status','allergyId','limit','cursor']::text[]))
     )
     OR view_value NOT IN ('current','history')
     OR (requested_status IS NOT NULL AND requested_status NOT IN
       ('self_reported','clinician_confirmed','refuted','entered_in_error'))
     OR page_limit < 1 OR page_limit > 100 THEN
    RAISE EXCEPTION 'invalid allergy list filters' USING ERRCODE = '22023';
  END IF;
  IF cursor_value IS NOT NULL AND cursor_value <> 'null'::jsonb THEN
    PERFORM clinical.f011_assert_exact_keys_v1(cursor_value,ARRAY[
      'actorPersonId','patientId','view','status','allergyId','recordedAt','revisionId'
    ]::text[]);
    IF cursor_value->>'actorPersonId' IS DISTINCT FROM actor::text
       OR cursor_value->>'patientId' IS DISTINCT FROM p_patient_id::text
       OR cursor_value->>'view' IS DISTINCT FROM view_value
       OR cursor_value->'status' IS DISTINCT FROM COALESCE(p_input->'status','null'::jsonb)
       OR cursor_value->'allergyId' IS DISTINCT FROM COALESCE(p_input->'allergyId','null'::jsonb)
       OR pg_catalog.jsonb_typeof(cursor_value->'revisionId') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(cursor_value->'recordedAt') IS DISTINCT FROM 'string'
       OR cursor_value->>'revisionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR cursor_value->>'recordedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$' THEN
      RAISE EXCEPTION 'allergy cursor does not match the authorized page' USING ERRCODE='22023';
    END IF;
    BEGIN
      cursor_recorded_at := (cursor_value->>'recordedAt')::timestamptz;
      cursor_revision_id := (cursor_value->>'revisionId')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid allergy cursor tuple' USING ERRCODE='22023';
    END;
    IF pg_catalog.to_char(cursor_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
         IS DISTINCT FROM cursor_value->>'recordedAt' THEN
      RAISE EXCEPTION 'invalid allergy cursor timestamp' USING ERRCODE='22023';
    END IF;
  ELSIF p_input ? 'cursor' AND cursor_value <> 'null'::jsonb THEN
    RAISE EXCEPTION 'invalid allergy cursor' USING ERRCODE='22023';
  END IF;

  SELECT * INTO STRICT authority
  FROM clinical.f011_allergy_current_authority_v1(
    p_patient_id, 'listAllergies',
    NULLIF(pg_catalog.current_setting('shifaa.facility_id', true), '')::uuid,
    NULLIF(pg_catalog.current_setting('shifaa.encounter_id', true), '')::uuid
  );

  WITH page_candidates AS MATERIALIZED (
    SELECT allergy.id AS revision_id, allergy.recorded_at,
      pg_catalog.jsonb_build_object(
        'revisionId', allergy.id, 'allergyId', allergy.allergy_id,
        'patientId', allergy.patient_id, 'version', allergy.version,
        'previousRevisionId', allergy.supersedes_id,
        'status', allergy.verification_status,
        'facts', pg_catalog.jsonb_build_object(
          'contractId', allergy.facts_contract_id, 'keyRef', allergy.facts_key_ref,
          'nonce', pg_catalog.encode(allergy.facts_nonce,'hex'),
          'ciphertext', pg_catalog.encode(allergy.facts_ciphertext,'hex'),
          'authTag', pg_catalog.encode(allergy.facts_auth_tag,'hex')
        ),
        'reason', CASE WHEN allergy.reason_contract_id IS NULL THEN NULL ELSE
          pg_catalog.jsonb_build_object(
            'contractId',allergy.reason_contract_id,'keyRef',allergy.reason_key_ref,
            'nonce',pg_catalog.encode(allergy.reason_nonce,'hex'),
            'ciphertext',pg_catalog.encode(allergy.reason_ciphertext,'hex'),
            'authTag',pg_catalog.encode(allergy.reason_auth_tag,'hex')
          ) END,
        'recorderPersonId', allergy.original_recorder_person_id,
        'recordedAt', allergy.original_recorded_at,
        'actionActorPersonId', allergy.action_actor_person_id,
        'actionAt', allergy.recorded_at,
        'verificationEvidenceRef', allergy.verification_evidence_ref,
        'correctsAllergyId', allergy.corrects_allergy_id,
        'facilityId', allergy.facility_id,
        'encounterId', allergy.encounter_id
      ) AS row_value
    FROM clinical.allergies allergy
    LEFT JOIN clinical.allergy_heads head
      ON head.id = allergy.allergy_id AND head.patient_id = allergy.patient_id
    WHERE allergy.patient_id = p_patient_id
      AND (requested_allergy IS NULL OR allergy.allergy_id = requested_allergy)
      AND (requested_status IS NULL OR allergy.verification_status = requested_status)
      AND (view_value = 'history' OR allergy.id = head.current_revision_id)
      AND (cursor_recorded_at IS NULL OR (allergy.recorded_at,allergy.id)<(cursor_recorded_at,cursor_revision_id))
    ORDER BY allergy.recorded_at DESC, allergy.id DESC
    LIMIT page_limit+1
  ), visible_page AS MATERIALIZED (
    SELECT candidate.* FROM page_candidates candidate
    ORDER BY candidate.recorded_at DESC,candidate.revision_id DESC
    LIMIT page_limit
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(item.row_value ORDER BY item.recorded_at DESC,item.revision_id DESC),'[]'::jsonb),
    (SELECT pg_catalog.count(*)>page_limit FROM page_candidates),
    (SELECT pg_catalog.jsonb_build_object(
       'actorPersonId',actor,'patientId',p_patient_id,'view',view_value,
       'status',COALESCE(p_input->'status','null'::jsonb),
       'allergyId',COALESCE(p_input->'allergyId','null'::jsonb),
       'recordedAt',pg_catalog.to_char(tail.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
       'revisionId',tail.revision_id)
     FROM visible_page tail
     ORDER BY tail.recorded_at ASC,tail.revision_id ASC LIMIT 1)
  INTO result_data,has_more,continuation_value
  FROM visible_page item;

  RETURN pg_catalog.jsonb_build_object(
    'view', view_value,
    'data', COALESCE(result_data, '[]'::jsonb),
    'meta', pg_catalog.jsonb_build_object(
      'nextCursor', NULL,
      'lastUpdatedAt', platform.context_now(),
      'stale', false
    ),
    -- Internal repository continuation claims; the adapter signs these into
    -- the existing opaque nextCursor field and strips this private carrier.
    'continuation',CASE WHEN has_more THEN continuation_value ELSE NULL END
  );
END
$function$;

CREATE FUNCTION clinical.create_allergy_api_v1(p_patient_id uuid, p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  prep jsonb := p_input->'preparation';
  facts record;
  reason record;
  actor uuid;
  context_row record;
  patient_person_value uuid;
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  result jsonb;
  recorded_at_value timestamptz := platform.context_now();
  corrects_id uuid;
  correction_status text;
  actual_version integer;
BEGIN
  PERFORM clinical.f011_assert_exact_keys_v1(
    p_input, ARRAY['responseLanguage','responseRequestId','preparation']::text[]
  );

  -- A committed receipt needs current authorization, not new producer work.
  actor := clinical.f011_assert_response_context_v1(
    'createAllergy', p_input->>'responseLanguage',
    (p_input->>'responseRequestId')::uuid, 1
  );
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
  FROM clinical.begin_mutation_v1('POST','/v1/patients/{managedPatientId}/allergies');
  IF NOT idem_new THEN
    SELECT * INTO STRICT context_row
    FROM clinical.f011_allergy_current_authority_v1(
      p_patient_id,'createAllergy',
      NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid,
      NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid
    );
    RETURN clinical.f011_receipt_replay_metadata_v1((idem_response->>'featureReceiptId')::uuid);
  END IF;
  -- The existing claim settles any prior transaction; absent producer input
  -- must roll back its new claim without a domain effect. Never infer absence
  -- from a generic validation, runtime, authorization, or connection failure.
  IF idem_new AND (prep IS NULL OR prep='null'::jsonb) THEN
    RAISE EXCEPTION 'F011_FRESH_PREPARATION_REQUIRED' USING ERRCODE='22023';
  END IF;

  PERFORM clinical.f011_assert_exact_keys_v1(
    prep, ARRAY['allergyId','revisionId','revisionVersion','previousRevisionId',
                'protectedFacts','protectedReason','correctsAllergyId']::text[]
  );
  IF p_input->>'responseLanguage' NOT IN ('ar-EG','en-EG')
     OR NULLIF(p_input->>'responseRequestId','') IS NULL
     OR (prep->>'revisionVersion')::integer IS DISTINCT FROM 1
     OR NULLIF(prep->>'allergyId','') IS NULL
     OR NULLIF(prep->>'revisionId','') IS NULL
     OR prep->'previousRevisionId' IS DISTINCT FROM 'null'::jsonb
     OR prep->'protectedReason' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'invalid initial allergy preparation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT facts
  FROM clinical.f011_decode_envelope_v1(prep->'protectedFacts','SHIFAA-F011-ALLERGY-PROTECTED/1');
  IF prep->>'correctsAllergyId' IS NOT NULL AND prep->>'correctsAllergyId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid allergy correction identity' USING ERRCODE = '22023';
  END IF;
  corrects_id := NULLIF(prep->>'correctsAllergyId','')::uuid;


  SELECT patient.person_id INTO STRICT patient_person_value
  FROM identity.patients patient WHERE patient.id = p_patient_id AND patient.record_status = 'active';
  -- Lock the correction target set before encounter, workforce, patient/person,
  -- and provenance rows.  A correction is only a new assertion after terminal error.
  IF corrects_id IS NOT NULL THEN
    SELECT head.current_version, allergy.verification_status
    INTO actual_version, correction_status
    FROM clinical.allergy_heads head
    JOIN clinical.allergies allergy
      ON allergy.id = head.current_revision_id
     AND allergy.allergy_id = head.id AND allergy.patient_id = head.patient_id
    WHERE head.id = corrects_id AND head.patient_id = p_patient_id
    FOR SHARE OF head, allergy;
    IF NOT FOUND OR correction_status <> 'entered_in_error' THEN
      RAISE EXCEPTION 'allergy correction target is not current terminal error' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'') IS NOT NULL THEN
    PERFORM 1 FROM clinical.encounters encounter
    WHERE encounter.id = NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid
      AND encounter.patient_person_id = patient_person_value
      AND encounter.facility_id = NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'allergy encounter context changed' USING ERRCODE = '40001'; END IF;
  END IF;
  IF platform.context_role() = 'CLN' AND NOT clinical.f011_lock_clinician_scope_v1(
    NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid,
    NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid,
    actor
  ) THEN
    RAISE EXCEPTION 'current clinician authority changed' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM identity.patients patient
  WHERE patient.id = p_patient_id AND patient.record_status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'patient is unavailable' USING ERRCODE = '42501'; END IF;
  PERFORM person.id FROM identity.people person
  WHERE person.id IN (actor,patient_person_value)
  ORDER BY person.id FOR SHARE;
  IF (SELECT pg_catalog.count(*) FROM identity.people person
      WHERE person.id IN (actor,patient_person_value)) < 1 THEN
    RAISE EXCEPTION 'patient identity is unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM consent_row.id FROM consent.records consent_row
  WHERE consent_row.person_id IN (actor,patient_person_value)
    AND consent_row.purpose_code=ANY(platform.context_purposes())
  ORDER BY consent_row.person_id,consent_row.purpose_code,consent_row.occurred_at,consent_row.id
  FOR SHARE;
  IF NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'') IS NOT NULL THEN
    PERFORM 1 FROM clinical.encounter_participants participant
    WHERE participant.encounter_id = NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid
      AND participant.person_id = actor AND participant.ended_at IS NULL
      AND participant.started_at <= platform.context_now()
    FOR SHARE;
  END IF;
  SELECT * INTO STRICT context_row
  FROM clinical.f011_allergy_current_authority_v1(
    p_patient_id,'createAllergy',
    NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid,
    NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid
  );

  INSERT INTO clinical.allergy_heads(
    id,patient_id,current_revision_id,current_version,corrects_allergy_id
  ) VALUES (
    (prep->>'allergyId')::uuid,p_patient_id,(prep->>'revisionId')::uuid,1,corrects_id
  );
  INSERT INTO clinical.allergies(
    id,allergy_id,patient_id,version,supersedes_id,verification_status,
    facts_contract_id,facts_key_ref,facts_nonce,facts_ciphertext,facts_auth_tag,
    original_recorder_person_id,original_recorded_at,action_actor_person_id,
    facility_id,encounter_id,corrects_allergy_id
  ) VALUES (
    (prep->>'revisionId')::uuid,(prep->>'allergyId')::uuid,p_patient_id,1,NULL,'self_reported',
    'SHIFAA-F011-ALLERGY-PROTECTED/1',facts.key_ref,facts.nonce_bytes,facts.ciphertext_bytes,facts.tag_bytes,
    actor,recorded_at_value,actor,
    context_row.facility_id,context_row.encounter_id,corrects_id
  );
  result := clinical.f011_record_mutation_effect_v1(
    idem_id,actor,'createAllergy','clinical.allergy_revision',(prep->>'allergyId')::uuid,1,
    201::smallint,p_input->>'responseLanguage',(p_input->>'responseRequestId')::uuid,
  context_row.facility_id,context_row.patient_person_id
  );
  RETURN result;
END
$function$;

CREATE FUNCTION clinical.verify_allergy_api_v1(
  p_allergy_id uuid, p_expected_version integer, p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  prep jsonb := p_input->'preparation';
  protected_revision jsonb := prep->'protectedRevision';
  verified jsonb := prep->'verifiedEvidence';
  facts record;
  reason record;
  head clinical.allergy_heads%ROWTYPE;
  prior clinical.allergies%ROWTYPE;
  context_row record;
  patient_person_value uuid;
  actor uuid;
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  support_row clinical.allergy_verification_support%ROWTYPE;
  result jsonb;
  recorded_at_value timestamptz := platform.context_now();
  allowed_edge boolean;
BEGIN
  PERFORM clinical.f011_assert_exact_keys_v1(
    p_input, ARRAY['responseLanguage','responseRequestId','preparation']::text[]
  );

  -- A committed receipt needs current authorization, not new producer work.
  actor := clinical.f011_assert_response_context_v1(
    'verifyAllergy',p_input->>'responseLanguage',
    (p_input->>'responseRequestId')::uuid,2
  );
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
  FROM clinical.begin_mutation_v1('POST','/v1/allergies/{allergyId}/verification');
  -- The existing claim settles any prior transaction; absent producer input
  -- must roll back its new claim without a domain effect. Never infer absence
  -- from a generic validation, runtime, authorization, or connection failure.
  IF idem_new AND (prep IS NULL OR prep='null'::jsonb) THEN
    RAISE EXCEPTION 'F011_FRESH_PREPARATION_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF idem_new THEN
  PERFORM clinical.f011_assert_exact_keys_v1(
    prep, ARRAY['protectedRevision','verifiedEvidence']::text[]
  );
  PERFORM clinical.f011_assert_exact_keys_v1(
    protected_revision,
    ARRAY['allergyId','revisionId','revisionVersion','previousRevisionId',
          'protectedFacts','protectedReason']::text[]
  );
  IF p_allergy_id IS NULL OR p_expected_version < 1
     OR p_input->>'responseLanguage' NOT IN ('ar-EG','en-EG')
     OR protected_revision->>'allergyId' IS DISTINCT FROM p_allergy_id::text
     OR (protected_revision->>'revisionVersion')::integer IS DISTINCT FROM p_expected_version + 1
     OR protected_revision->>'previousRevisionId' IS NULL
     OR (protected_revision->>'revisionId') IS NULL THEN
    RAISE EXCEPTION 'invalid allergy verification preparation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT facts
  FROM clinical.f011_decode_envelope_v1(protected_revision->'protectedFacts','SHIFAA-F011-ALLERGY-PROTECTED/1');
  SELECT * INTO STRICT reason
  FROM clinical.f011_decode_envelope_v1(protected_revision->'protectedReason','SHIFAA-F011-ALLERGY-PROTECTED/1');

  END IF;


  IF idem_new THEN
    SELECT * INTO STRICT head
    FROM clinical.allergy_heads candidate
    WHERE candidate.id = p_allergy_id
    FOR UPDATE;
  ELSE
    SELECT * INTO STRICT head
    FROM clinical.allergy_heads candidate
    WHERE candidate.id = p_allergy_id
    FOR SHARE;
  END IF;
  -- Fail unauthorized roles before encounter/CAS context checks. PAT is a
  -- read-only principal for allergies and has no clinician encounter context.
  -- The exact current predicate is repeated after ordered locks below.
  PERFORM 1 FROM clinical.f011_allergy_current_authority_v1(
    head.patient_id,'verifyAllergy',
    NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid,
    NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid
  );
  SELECT * INTO STRICT prior
  FROM clinical.allergies revision
  WHERE revision.id = head.current_revision_id
    AND revision.allergy_id = head.id AND revision.patient_id = head.patient_id
    AND revision.version = head.current_version
  FOR SHARE;

  IF idem_new AND (head.current_version <> p_expected_version
     OR head.current_revision_id <> (protected_revision->>'previousRevisionId')::uuid) THEN
    RAISE EXCEPTION 'allergy version changed' USING ERRCODE = '40001';
  END IF;

  SELECT patient.person_id INTO STRICT patient_person_value
  FROM identity.patients patient
  WHERE patient.id = head.patient_id AND patient.record_status = 'active';
  PERFORM 1 FROM clinical.encounters encounter
  WHERE encounter.id = NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid
    AND encounter.patient_person_id = patient_person_value
    AND encounter.facility_id = NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'allergy encounter context changed' USING ERRCODE = '40001'; END IF;
  IF NOT clinical.f011_lock_clinician_scope_v1(
    NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid,
    NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid,
    actor
  ) THEN
    RAISE EXCEPTION 'current clinician authority changed' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM identity.patients patient
  WHERE patient.id = head.patient_id AND patient.record_status = 'active'
  FOR SHARE;
  PERFORM person.id FROM identity.people person
  WHERE person.id IN (actor,patient_person_value)
  ORDER BY person.id FOR SHARE;
  PERFORM consent_row.id FROM consent.records consent_row
  WHERE consent_row.person_id IN (actor,patient_person_value)
    AND consent_row.purpose_code=ANY(platform.context_purposes())
  ORDER BY consent_row.person_id,consent_row.purpose_code,consent_row.occurred_at,consent_row.id
  FOR SHARE;
  PERFORM 1 FROM clinical.encounter_participants participant
  WHERE participant.encounter_id = NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid
    AND participant.person_id = actor
    AND participant.ended_at IS NULL AND participant.started_at <= platform.context_now()
  FOR SHARE;
  SELECT * INTO STRICT context_row
  FROM clinical.f011_allergy_current_authority_v1(
    head.patient_id,'verifyAllergy',
    NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid,
    NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid
  );
  IF NOT idem_new THEN
    RETURN clinical.f011_receipt_replay_metadata_v1((idem_response->>'featureReceiptId')::uuid);
  END IF;

  PERFORM clinical.f011_assert_exact_keys_v1(
    verified,
    ARRAY['contractId','profile','bindingId','producerId','verifiedAt','evidenceRef',
      'patientId','allergyId','previousRevisionId','previousVersion','revisionId',
      'revisionVersion','targetStatus','attestorPersonId','sourceIdentity',
      'sourceEvidenceIdentity','synthetic']::text[]
  );
  IF verified->>'contractId' IS DISTINCT FROM 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
     OR verified->>'profile' IS DISTINCT FROM 'allergy_verification'
     OR verified->>'producerId' IS DISTINCT FROM 'f011.allergy_evidence_boundary'
     OR (verified->>'verifiedAt')::timestamptz > platform.context_now()
     OR verified->>'patientId' IS DISTINCT FROM head.patient_id::text
     OR verified->>'allergyId' IS DISTINCT FROM head.id::text
     OR verified->>'previousRevisionId' IS DISTINCT FROM head.current_revision_id::text
     OR (verified->>'previousVersion')::integer IS DISTINCT FROM head.current_version
     OR verified->>'revisionId' IS DISTINCT FROM protected_revision->>'revisionId'
     OR (verified->>'revisionVersion')::integer IS DISTINCT FROM head.current_version + 1
     OR verified->>'attestorPersonId' IS DISTINCT FROM actor::text
     OR verified->>'sourceEvidenceIdentity' IS DISTINCT FROM verified->>'evidenceRef' THEN
    RAISE EXCEPTION 'allergy verification evidence does not bind the locked head' USING ERRCODE = '23514';
  END IF;
  IF verified->>'sourceIdentity' NOT IN (
       'governed.internal_clinician_provenance','synthetic.internal_clinician_provenance'
     )
     OR (verified->>'synthetic')::boolean IS DISTINCT FROM
       (verified->>'sourceIdentity' = 'synthetic.internal_clinician_provenance') THEN
    RAISE EXCEPTION 'invalid allergy verification provenance' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO STRICT support_row
  FROM clinical.allergy_verification_support support
  WHERE support.id = (verified->>'evidenceRef')::uuid
    AND support.patient_id = head.patient_id
    AND support.allergy_id = head.id
    AND support.previous_revision_id = head.current_revision_id
    AND support.previous_version = head.current_version
    AND support.target_status = verified->>'targetStatus'
    AND support.attestor_person_id = actor
    AND support.source_identity = verified->>'sourceIdentity'
    AND support.source_evidence_identity = (verified->>'sourceEvidenceIdentity')::uuid
    AND support.producer_id = verified->>'producerId'
    AND support.synthetic = (verified->>'synthetic')::boolean
  FOR SHARE;
  IF (verified->>'bindingId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR (verified->>'revisionId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR (verified->>'revisionVersion')::integer <> p_expected_version + 1
     OR prior.verification_status = 'entered_in_error' THEN
    RAISE EXCEPTION 'allergy verification transition is terminal or malformed' USING ERRCODE = '23514';
  END IF;
  allowed_edge :=
    (prior.verification_status = 'self_reported' AND verified->>'targetStatus' IN ('clinician_confirmed','refuted','entered_in_error'))
    OR (prior.verification_status = 'clinician_confirmed' AND verified->>'targetStatus' IN ('refuted','entered_in_error'))
    OR (prior.verification_status = 'refuted' AND verified->>'targetStatus' IN ('clinician_confirmed','entered_in_error'));
  IF NOT allowed_edge THEN
    RAISE EXCEPTION 'allergy verification transition is not allowed' USING ERRCODE = '23514';
  END IF;

  INSERT INTO clinical.allergies(
    id,allergy_id,patient_id,version,supersedes_id,verification_status,
    facts_contract_id,facts_key_ref,facts_nonce,facts_ciphertext,facts_auth_tag,
    original_recorder_person_id,original_recorded_at,action_actor_person_id,
    facility_id,encounter_id,reason_contract_id,reason_key_ref,reason_nonce,
    reason_ciphertext,reason_auth_tag,verification_evidence_ref,corrects_allergy_id
  ) VALUES (
    (protected_revision->>'revisionId')::uuid,head.id,head.patient_id,head.current_version + 1,
    head.current_revision_id,verified->>'targetStatus',
    'SHIFAA-F011-ALLERGY-PROTECTED/1',facts.key_ref,facts.nonce_bytes,facts.ciphertext_bytes,facts.tag_bytes,
    prior.original_recorder_person_id,prior.original_recorded_at,actor,
    context_row.facility_id,context_row.encounter_id,
    'SHIFAA-F011-ALLERGY-PROTECTED/1',reason.key_ref,reason.nonce_bytes,reason.ciphertext_bytes,reason.tag_bytes,
    support_row.id,head.corrects_allergy_id
  );
  INSERT INTO clinical.allergy_verification_bindings(
    revision_id,binding_id,binding_contract_id,evidence_ref,producer_id,verified_at
  ) VALUES (
    (protected_revision->>'revisionId')::uuid,(verified->>'bindingId')::uuid,
    'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',support_row.id,
    'f011.allergy_evidence_boundary',(verified->>'verifiedAt')::timestamptz
  );
  UPDATE clinical.allergy_heads
  SET current_revision_id = (protected_revision->>'revisionId')::uuid,
      current_version = head.current_version + 1,
      updated_at = platform.context_now()
  WHERE id = head.id AND current_version = p_expected_version
    AND current_revision_id = head.current_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'allergy head compare-and-swap failed' USING ERRCODE = '40001'; END IF;

  result := clinical.f011_record_mutation_effect_v1(
    idem_id,actor,'verifyAllergy','clinical.allergy_revision',head.id,head.current_version + 1,
    200::smallint,p_input->>'responseLanguage',(p_input->>'responseRequestId')::uuid,
    context_row.facility_id,context_row.patient_person_id
  );
  RETURN result;
END
$function$;
