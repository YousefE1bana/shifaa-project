BEGIN;

DO $$
DECLARE relation_name text;
BEGIN
 IF (SELECT rolbypassrls FROM pg_roles WHERE rolname='shifaa_api') THEN RAISE EXCEPTION 'online role bypasses RLS'; END IF;
 FOREACH relation_name IN ARRAY ARRAY[
  'identity.governance_designations','consent.data_subject_requests','consent.data_subject_request_events','consent.dsr_assignments','consent.dsr_export_capabilities',
  'platform.notification_template_releases','platform.notifications','platform.notification_delivery_attempts','platform.provider_callback_receipts','platform.outbox_replay_attempts'
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=relation_name::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION '% is not forced RLS',relation_name; END IF;
 END LOOP;
 IF EXISTS(
  SELECT 1 FROM information_schema.role_table_grants
  WHERE grantee='shifaa_api' AND privilege_type='DELETE' AND table_name IN ('data_subject_requests','data_subject_request_events','dsr_assignments','dsr_export_capabilities','notification_template_releases','notifications','notification_delivery_attempts','provider_callback_receipts','outbox_replay_attempts')
 ) THEN RAISE EXCEPTION 'online delete grant exists'; END IF;
 IF (SELECT count(*) FROM consent.processing_inventory WHERE process_code LIKE 'privacy-%-synthetic' AND status='active')<>4 THEN RAISE EXCEPTION 'processing inventory incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM consent.data_subject_requests WHERE due_policy_code<>'synthetic_dsr_due_v1' OR due_at<>submitted_at+interval '17 days') THEN RAISE EXCEPTION 'synthetic due rule drift'; END IF;
 IF (SELECT status FROM platform.notification_template_releases WHERE id='54000000-0000-4000-8000-000000000001')<>'published' THEN RAISE EXCEPTION 'paired template seed missing'; END IF;
 IF EXISTS(SELECT 1 FROM platform.notification_template_releases WHERE status='published' AND created_by_person_id=published_by_person_id) THEN RAISE EXCEPTION 'template separation violated'; END IF;
 IF EXISTS(SELECT 1 FROM platform.notifications WHERE field_values ?| ARRAY['diagnosis','national_id','raw_contact','phone','email','token','download_url','export_body','message_body','secret']) THEN RAISE EXCEPTION 'notification forbidden field persisted'; END IF;
END $$;

DO $$ BEGIN
 BEGIN
  INSERT INTO consent.data_subject_requests(id,person_id,patient_id,submitted_by_person_id,request_type,scope,contact_preference,status,submitted_at,due_at,decision_code,decision_reason,decided_by_person_id,decided_at,fulfilment_action_codes,fulfilment_summary,evidence_object_id,subject_notice_code,released_at,closed_at)
  VALUES(gen_random_uuid(),'50000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','erasure_pseudonymization','{"data_category_codes":["profile.demographics"]}','in_app','fulfilled',now(),now()+interval '17 days','approve','synthetic','50000000-0000-4000-8000-000000000006',now(),ARRAY['hard_delete'],'must fail','58000000-0000-4000-8000-000000000001','DSR_STATUS_CHANGED',now(),now());
  RAISE EXCEPTION 'unapproved hard delete accepted';
 EXCEPTION WHEN check_violation THEN NULL; WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE consent.data_subject_request_events SET reason_code='mutated' WHERE id='55000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'append-only event mutated'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;

ROLLBACK;
