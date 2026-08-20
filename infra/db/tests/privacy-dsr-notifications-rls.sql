BEGIN;
INSERT INTO platform.outbox_events(id,aggregate_type,aggregate_id,event_type,payload,state,aggregate_version)
VALUES('59000000-0000-4000-8000-000000000001','notification','59000000-0000-4000-8000-000000000002','notification.delivery.requested','{}','dead_letter',99);
SET LOCAL ROLE shifaa_api;

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000001',true);
SELECT set_config('shifaa.actor_role','PAT',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','privacy_dsr',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM consent.data_subject_requests WHERE id='52000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'patient own DSR projection missing'; END IF;
 IF EXISTS(SELECT 1 FROM consent.data_subject_requests WHERE patient_id<>'51000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'cross-subject DSR leak'; END IF;
 IF EXISTS(SELECT 1 FROM identity.governance_designations) THEN RAISE EXCEPTION 'patient read governance designation'; END IF;
 IF EXISTS(SELECT 1 FROM platform.notification_template_releases) THEN RAISE EXCEPTION 'patient read template governance'; END IF;
END $$;

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF NOT platform.person_can_manage_dsr('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'guardian consent.manage authority missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM consent.data_subject_requests WHERE id='52000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'guardian subject read denied'; END IF;
END $$;

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 IF platform.person_can_manage_dsr('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'delegate gained DSR authority'; END IF;
 IF EXISTS(SELECT 1 FROM consent.data_subject_requests) THEN RAISE EXCEPTION 'delegate read DSR'; END IF;
END $$;

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000005',true);
SELECT set_config('shifaa.actor_role','FACILITY-STAFF',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM consent.data_subject_requests) THEN RAISE EXCEPTION 'facility membership granted DSR access'; END IF; END $$;

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000006',true);
SELECT set_config('shifaa.actor_role','DPO',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','privacy.dsr.review',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM consent.data_subject_requests WHERE id='52000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'assigned DPO worklist missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM consent.dsr_assignments WHERE request_id='52000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'DPO minimum assignment predicate missing'; END IF;
END $$;
SELECT set_config('shifaa.aal','1',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM consent.data_subject_requests) THEN RAISE EXCEPTION 'AAL1 DPO read assigned DSR'; END IF; END $$;
SELECT set_config('shifaa.aal','2',true); SELECT set_config('shifaa.purposes','wrong.purpose',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM consent.data_subject_requests) THEN RAISE EXCEPTION 'wrong-purpose DPO read assigned DSR'; END IF; END $$;

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000007',true);
SELECT set_config('shifaa.purposes','privacy.dsr.review',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM consent.data_subject_requests) THEN RAISE EXCEPTION 'unassigned DPO read DSR'; END IF; END $$;

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000008',true);
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT set_config('shifaa.purposes','notification.template.manage',true);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM platform.notification_template_releases WHERE id='54000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'template author worklist missing'; END IF; END $$;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000009',true);
SELECT set_config('shifaa.aal','2',true); SELECT set_config('shifaa.purposes','notification.template.publish',true);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM platform.notification_template_releases WHERE id='54000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'independent publisher read missing'; END IF; END $$;

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000010',true);
SELECT set_config('shifaa.actor_role','PLATFORM-OPERATOR',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','platform.outbox.replay',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM platform.outbox_events WHERE id='59000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'authorized operator cannot see dead letter'; END IF;
END $$;
SELECT set_config('shifaa.purposes','wrong.purpose',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM platform.outbox_events) THEN RAISE EXCEPTION 'wrong-purpose operator read dead letter'; END IF; END $$;

INSERT INTO platform.provider_callback_receipts(provider_code,event_reference,receipt_reference_hash,nonce_hash,request_digest,delivery_status,provider_occurred_at)
VALUES('local-synthetic','rls-callback-005',repeat('a',64),repeat('b',64),repeat('c',64),'delivered',now());
DO $$ BEGIN IF EXISTS(SELECT 1 FROM platform.provider_callback_receipts) THEN RAISE EXCEPTION 'callback write path gained receipt read access'; END IF; END $$;

RESET ROLE;
SET LOCAL ROLE shifaa_worker;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform.notification_template_releases WHERE id='54000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'worker published-template projection missing'; END IF;
 IF has_schema_privilege(current_user,'consent','USAGE') THEN RAISE EXCEPTION 'worker gained consent/DSR schema access'; END IF;
 IF has_table_privilege(current_user,'platform.notifications','DELETE') THEN RAISE EXCEPTION 'worker gained notification delete'; END IF;
 IF NOT has_table_privilege(current_user,'platform.outbox_events','SELECT') THEN RAISE EXCEPTION 'worker cannot claim allowed outbox events'; END IF;
END $$;

ROLLBACK;
