-- K04 test-session helpers only. No Feature 011 relation, role, migration or
-- production function is created here. Ciphertext fixtures prove structure only.
CREATE FUNCTION pg_temp.f011_check(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'F011_K04_ASSERTION: %', message;
  END IF;
END $$;

-- Test-only direct structural seed for deferred obligations. This is not a
-- domain producer/finalizer or an evidence source. Every case owns its transaction.
CREATE FUNCTION pg_temp.f011_receipt_fault(operation text, fault text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  idem uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); target uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid(); outbox uuid:=gen_random_uuid(); audit_row record;
  actor uuid:='f0110000-0000-4000-8000-000000000001';
  resource text:=CASE WHEN operation IN ('createAllergy','verifyAllergy') THEN 'clinical.allergy_revision' ELSE 'clinical.content_release' END;
  status smallint:=CASE WHEN operation IN ('createAllergy','createClinicalContentRelease') THEN 201 ELSE 200 END;
  route text:=CASE operation
    WHEN 'createAllergy' THEN '/v1/patients/{managedPatientId}/allergies'
    WHEN 'verifyAllergy' THEN '/v1/allergies/{allergyId}/verification'
    WHEN 'createClinicalContentRelease' THEN '/v1/admin/clinical-content/{contentType}/releases'
    WHEN 'signClinicalContentRelease' THEN '/v1/admin/clinical-content/releases/{releaseId}/signatures'
    WHEN 'publishClinicalContentRelease' THEN '/v1/admin/clinical-content/releases/{releaseId}/publish' END;
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_require_table('clinical.mutation_receipts');
  PERFORM pg_temp.f011_context(actor,'PAT',operation);
  SELECT record_id INTO idem FROM clinical.claim_idempotency_v1('POST',route,current_setting('shifaa.k04_case'),repeat('a',64));
  SELECT * INTO audit_row FROM audit.append_event_v1(request,request::text,
    'clinical.synthetic.structural_test',resource,'success',NULL,actor,2::smallint,NULL,NULL,
    'synthetic.feature011',target,1);
  INSERT INTO platform.outbox_events(id,aggregate_type,aggregate_id,event_type,payload,aggregate_version)
  VALUES(outbox,resource,target,'identity.verification.changed','{}'::jsonb,1);
  IF fault='wrong-audit' THEN
    SELECT * INTO audit_row FROM audit.append_event_v1(gen_random_uuid(),request::text,
      'clinical.synthetic.structural_test',resource,'success',NULL,actor,2::smallint,NULL,NULL,
      'synthetic.feature011',gen_random_uuid(),1);
  END IF;
  IF fault='wrong-outbox' THEN
    INSERT INTO platform.outbox_events(aggregate_type,aggregate_id,event_type,payload,aggregate_version)
    VALUES(resource,gen_random_uuid(),'identity.verification.changed','{}'::jsonb,1) RETURNING id INTO outbox;
  END IF;
  -- The existing event type is a neutral structural FK fixture. It is not a
  -- proposed Feature 011 product event or acceptance of the later domain phase.
  INSERT INTO clinical.mutation_commit_obligations(idempotency_record_id,receipt_id,actor_person_id,
    operation_id,resource_type,resource_id,resource_version,response_status,response_etag,response_language,
    response_request_id,audit_event_occurred_at,audit_event_id,outbox_event_id,occurred_at)
  VALUES(idem,receipt,actor,operation,resource,target,1,status,'"1"','ar-EG',request,
    audit_row.event_occurred_at,
    CASE WHEN fault='missing-audit' THEN gen_random_uuid() ELSE audit_row.event_id END,
    CASE WHEN fault='missing-outbox' THEN gen_random_uuid() ELSE outbox END,clock_timestamp());
  IF fault<>'missing-receipt' THEN
    INSERT INTO clinical.mutation_receipts(id,idempotency_record_id,actor_person_id,operation_id,
      resource_type,resource_id,resource_version,response_status,response_etag,response_language,
      response_request_id,occurred_at,receipt_contract_id,receipt_key_ref,receipt_nonce,receipt_ciphertext,receipt_auth_tag)
    VALUES(receipt,idem,actor,operation,resource,CASE WHEN fault='wrong-tuple' THEN gen_random_uuid() ELSE target END,
      1,status,'"1"','ar-EG',request,clock_timestamp(),'SHIFAA-F011-RECEIPT-PROTECTED/1',
      'synthetic-kms/receipt/versions/1',decode('000102030405060708090a0b','hex'),decode('d0d1','hex'),decode('808182838485868788898a8b8c8d8e8f','hex'));
  END IF;
  IF fault<>'incomplete-idempotency' THEN
    UPDATE platform.idempotency_records SET state='completed',response_status=status,
      response_headers=jsonb_build_object('ETag','"1"','Content-Language','ar-EG','Cache-Control','private, no-store','X-Request-Id',request),
      response_body=jsonb_build_object('featureReceiptId',CASE WHEN fault='wrong-pointer' THEN gen_random_uuid() ELSE receipt END),
      resource_type=resource,resource_id=target WHERE id=idem;
  END IF;
END $$;

CREATE FUNCTION pg_temp.f011_require_table(relation text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(relation) IS NULL THEN
    RAISE EXCEPTION 'F011_K04_MISSING:%:table:%', current_setting('shifaa.k04_case'),relation;
  END IF;
END $$;

-- Offline synthetic row fixture, not an online mutation implementation. It is
-- unreachable while storage is absent. It seeds complete typed support/binding
-- history so later denial assertions cannot rely on a missing predecessor row.
CREATE FUNCTION pg_temp.f011_allergy_path(states text[]) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  assertion uuid:=gen_random_uuid(); revision uuid; previous uuid; support uuid;
  patient uuid:='f0110000-0000-4000-8100-000000000001';
  recorder uuid:='f0110000-0000-4000-8000-000000000001';
  clinician uuid:='f0110000-0000-4000-8000-000000000002';
  recorded timestamptz:='2026-10-06T10:00:00Z'; version integer;
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  FOR version IN 1..array_length(states,1) LOOP
    revision:=gen_random_uuid(); support:=CASE WHEN version=1 THEN NULL ELSE gen_random_uuid() END;
    IF version=1 THEN
      INSERT INTO clinical.allergy_heads(id,patient_id,current_revision_id,current_version)
      VALUES(assertion,patient,revision,1);
    ELSE
      INSERT INTO clinical.allergy_verification_support(id,patient_id,allergy_id,previous_revision_id,previous_version,
        target_status,attestor_person_id,source_identity,source_evidence_identity,producer_id,recorded_at,synthetic)
      VALUES(support,patient,assertion,previous,version-1,states[version],clinician,
        'synthetic.internal_clinician_provenance',support,'f011.allergy_evidence_boundary',recorded,true);
    END IF;
    INSERT INTO clinical.allergies(id,allergy_id,patient_id,version,supersedes_id,verification_status,
      facts_contract_id,facts_key_ref,facts_nonce,facts_ciphertext,facts_auth_tag,
      original_recorder_person_id,original_recorded_at,action_actor_person_id,facility_id,encounter_id,
      reason_contract_id,reason_key_ref,reason_nonce,reason_ciphertext,reason_auth_tag,verification_evidence_ref,recorded_at)
    VALUES(revision,assertion,patient,version,previous,states[version],
      'SHIFAA-F011-ALLERGY-PROTECTED/1','synthetic-kms/allergy/versions/1',decode('000102030405060708090a0b','hex'),
      decode(lpad(to_hex(version),2,'0'),'hex'),decode('808182838485868788898a8b8c8d8e8f','hex'),
      recorder,recorded,CASE WHEN version=1 THEN recorder ELSE clinician END,
      CASE WHEN version=1 THEN NULL ELSE 'f0110000-0000-4000-8200-000000000001'::uuid END,
      CASE WHEN version=1 THEN NULL ELSE 'f0110000-0000-4000-8400-000000000001'::uuid END,
      CASE WHEN version=1 THEN NULL ELSE 'SHIFAA-F011-ALLERGY-PROTECTED/1' END,
      CASE WHEN version=1 THEN NULL ELSE 'synthetic-kms/allergy/versions/1' END,
      CASE WHEN version=1 THEN NULL ELSE decode('101112131415161718191a1b','hex') END,
      CASE WHEN version=1 THEN NULL ELSE decode('d0d1','hex') END,
      CASE WHEN version=1 THEN NULL ELSE decode('909192939495969798999a9b9c9d9e9f','hex') END,support,recorded);
    IF version>1 THEN
      INSERT INTO clinical.allergy_verification_bindings(revision_id,binding_id,binding_contract_id,evidence_ref,producer_id,verified_at)
      VALUES(revision,gen_random_uuid(),'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',support,'f011.allergy_evidence_boundary',recorded);
      UPDATE clinical.allergy_heads SET current_revision_id=revision,current_version=version WHERE id=assertion;
    END IF;
    previous:=revision;
  END LOOP;
  RETURN assertion;
END $$;

CREATE FUNCTION pg_temp.f011_require_function(signature text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regprocedure(signature) IS NULL THEN
    RAISE EXCEPTION 'F011_K04_MISSING:%:function:%',current_setting('shifaa.k04_case'),signature;
  END IF;
END $$;

CREATE FUNCTION pg_temp.f011_require_executor() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regrole('shifaa_f011_executor') IS NULL THEN
    RAISE EXCEPTION 'F011_K04_MISSING:%:role:shifaa_f011_executor',current_setting('shifaa.k04_case');
  END IF;
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_roles
    WHERE rolname='shifaa_f011_executor' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls),
    'executor must remain NOLOGIN/NOSUPERUSER/NOBYPASSRLS');
END $$;

CREATE FUNCTION pg_temp.f011_columns(relation text, expected jsonb, exact_columns boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE field jsonb; actual record;
BEGIN
  PERFORM pg_temp.f011_require_table(relation);
  FOR field IN SELECT value FROM jsonb_array_elements(expected) LOOP
    SELECT format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required INTO actual
    FROM pg_attribute a WHERE a.attrelid=to_regclass(relation)
      AND a.attname=field->>'name' AND a.attnum>0 AND NOT a.attisdropped;
    PERFORM pg_temp.f011_check(FOUND AND actual.type=CASE field->>'type'
      WHEN 'timestamptz' THEN 'timestamp with time zone' ELSE field->>'type' END
      AND actual.required=NOT (field->>'nullable')::boolean,'typed/nullability column '||relation||'.'||(field->>'name'));
  END LOOP;
  IF exact_columns THEN
    PERFORM pg_temp.f011_check((SELECT count(*) FROM pg_attribute
      WHERE attrelid=to_regclass(relation) AND attnum>0 AND NOT attisdropped)=jsonb_array_length(expected),
      'closed physical columns '||relation);
  END IF;
END $$;

CREATE FUNCTION pg_temp.f011_unique(relation text, columns text[]) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.f011_require_table(relation);
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass(relation)
    AND c.contype IN ('p','u') AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
      FROM unnest(c.conkey) WITH ORDINALITY k(num,ordinality)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num)=columns),
    'unique context '||relation||' '||array_to_string(columns,','));
END $$;

CREATE FUNCTION pg_temp.f011_fk(relation text, columns text[], target text, target_columns text[], require_restrict boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.f011_require_table(relation);
  PERFORM pg_temp.f011_require_table(target);
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass(relation)
    AND c.contype='f' AND c.confrelid=to_regclass(target)
    AND CASE WHEN require_restrict THEN c.confdeltype='r' ELSE c.confdeltype IN ('r','a') END
    AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(c.conkey) WITH ORDINALITY k(num,ordinality)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num)=columns
    AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(c.confkey) WITH ORDINALITY k(num,ordinality)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num)=target_columns),
    'exact stable-ID/context FK without cascade '||relation||' -> '||target);
END $$;

CREATE FUNCTION pg_temp.f011_deferred(relation text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.f011_require_table(relation);
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_trigger
    WHERE tgrelid=to_regclass(relation) AND NOT tgisinternal AND tgconstraint<>0 AND tgdeferrable AND tginitdeferred),
    'INITIALLY DEFERRED reciprocal/commit enforcement '||relation);
END $$;

CREATE FUNCTION pg_temp.f011_denied(statement text, expected_states text[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE state text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE;
    IF state=ANY(expected_states) THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'F011_K04_ASSERTION: expected denial %',array_to_string(expected_states,',');
END $$;

CREATE FUNCTION pg_temp.f011_context(actor uuid, role_code text, action text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('shifaa.environment','ci',true);
  PERFORM set_config('shifaa.person_id',actor::text,true);
  PERFORM set_config('shifaa.actor_role',role_code,true);
  PERFORM set_config('shifaa.action',action,true);
  PERFORM set_config('shifaa.aal','2',true);
  PERFORM set_config('shifaa.purposes','synthetic.feature011',true);
  PERFORM set_config('shifaa.facility_id','f0110000-0000-4000-8200-000000000001',true);
  PERFORM set_config('shifaa.encounter_id','f0110000-0000-4000-8400-000000000001',true);
  PERFORM set_config('shifaa.request_id',gen_random_uuid()::text,true);
  PERFORM set_config('shifaa.idempotency_key',current_setting('shifaa.k04_case'),true);
  PERFORM set_config('shifaa.request_hash',repeat('a',64),true);
END $$;
