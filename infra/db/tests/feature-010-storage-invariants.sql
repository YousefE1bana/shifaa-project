-- Synthetic storage-only vectors. No body, key, or patient content is emitted.
BEGIN;

INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
 ('f0160000-0000-4000-8000-000000000001','f0160000-0000-4000-9000-000000000001','F010 synthetic clinician','active'),
 ('f0160000-0000-4000-8000-000000000002','f0160000-0000-4000-9000-000000000002','F010 synthetic patient','active'),
 ('f0160000-0000-4000-8000-000000000003','f0160000-0000-4000-9000-000000000003','F010 synthetic other patient','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status) VALUES
 ('f0160000-0000-4000-8100-000000000001','f0160000-0000-4000-8000-000000000002','F010-SYN-16-A','active'),
 ('f0160000-0000-4000-8100-000000000002','f0160000-0000-4000-8000-000000000003','F010-SYN-16-B','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('f0160000-0000-4000-8200-000000000001','clinic','عيادة اختبارية','F010 synthetic clinic','active','C','Cairo','Test','Synthetic address','f0160000-0000-4000-8000-000000000001');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
VALUES ('f0160000-0000-4000-8400-000000000001','f0160000-0000-4000-8200-000000000001','f0160000-0000-4000-8000-000000000001','Africa/Cairo','2030-04-01','2030-04-30',30,10000,'EGP','f0160000-0000-4000-8000-000000000001','f0160000-0000-4000-8000-000000000001');
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id) VALUES
 ('f0160000-0000-4000-8500-000000000001','f0160000-0000-4000-8000-000000000002','f0160000-0000-4000-8200-000000000001','f0160000-0000-4000-8000-000000000001','f0160000-0000-4000-8400-000000000001','2030-04-05T06:00:00Z','2030-04-05T06:30:00Z','Africa/Cairo','2030-04-05','08:00',10000,'EGP','cash_on_arrival','confirmed','f0160000-0000-4000-8000-000000000001','f0160000-0000-4000-8000-000000000001'),
 ('f0160000-0000-4000-8500-000000000002','f0160000-0000-4000-8000-000000000003','f0160000-0000-4000-8200-000000000001','f0160000-0000-4000-8000-000000000001','f0160000-0000-4000-8400-000000000001','2030-04-05T07:00:00Z','2030-04-05T07:30:00Z','Africa/Cairo','2030-04-05','09:00',10000,'EGP','cash_on_arrival','confirmed','f0160000-0000-4000-8000-000000000001','f0160000-0000-4000-8000-000000000001'),
 ('f0160000-0000-4000-8500-000000000003','f0160000-0000-4000-8000-000000000002','f0160000-0000-4000-8200-000000000001','f0160000-0000-4000-8000-000000000001','f0160000-0000-4000-8400-000000000001','2030-04-05T08:00:00Z','2030-04-05T08:30:00Z','Africa/Cairo','2030-04-05','10:00',10000,'EGP','cash_on_arrival','confirmed','f0160000-0000-4000-8000-000000000001','f0160000-0000-4000-8000-000000000001');
INSERT INTO clinical.encounters(id,patient_person_id,facility_id,appointment_id,responsible_clinician_id,encounter_type) VALUES
 ('f0160000-0000-4000-8600-000000000001','f0160000-0000-4000-8000-000000000002','f0160000-0000-4000-8200-000000000001','f0160000-0000-4000-8500-000000000001','f0160000-0000-4000-8000-000000000001','consultation'),
 ('f0160000-0000-4000-8600-000000000002','f0160000-0000-4000-8000-000000000003','f0160000-0000-4000-8200-000000000001','f0160000-0000-4000-8500-000000000002','f0160000-0000-4000-8000-000000000001','consultation');

INSERT INTO clinical.clinical_notes(id,encounter_id,author_person_id,note_type,body_ciphertext,visibility_code) VALUES
 ('f0160000-0000-4000-8700-000000000001','f0160000-0000-4000-8600-000000000001','f0160000-0000-4000-8000-000000000001','progress',decode('01020304','hex'),'private');

DO $storage_vectors$
DECLARE
  prior_body bytea;
  prior_visibility text;
  accepted_id uuid := 'f0160000-0000-4000-8800-000000000001';
BEGIN
  SELECT body_ciphertext,visibility_code INTO prior_body,prior_visibility
    FROM clinical.clinical_notes WHERE id='f0160000-0000-4000-8700-000000000001';
  BEGIN
    UPDATE clinical.clinical_notes SET visibility_code='patient_visible'
      WHERE id='f0160000-0000-4000-8700-000000000001';
    RAISE EXCEPTION 'missing F010 signed-note no-update guard';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM clinical.clinical_notes WHERE id='f0160000-0000-4000-8700-000000000001';
    RAISE EXCEPTION 'missing F010 signed-note no-delete guard';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  INSERT INTO clinical.clinical_notes(id,encounter_id,author_person_id,note_type,body_ciphertext,visibility_code,supersedes_id)
  VALUES ('f0160000-0000-4000-8700-000000000002','f0160000-0000-4000-8600-000000000001','f0160000-0000-4000-8000-000000000001','progress',decode('01050607','hex'),'patient_visible','f0160000-0000-4000-8700-000000000001');
  IF (SELECT body_ciphertext IS DISTINCT FROM prior_body OR visibility_code IS DISTINCT FROM prior_visibility
      FROM clinical.clinical_notes WHERE id='f0160000-0000-4000-8700-000000000001') THEN
    RAISE EXCEPTION 'correction changed prior signed note';
  END IF;
  BEGIN
    INSERT INTO clinical.clinical_notes(encounter_id,author_person_id,note_type,body_ciphertext,visibility_code)
    VALUES ('f0160000-0000-4000-8600-000000000001','f0160000-0000-4000-8000-000000000001','progress',decode('01','hex'),'shared');
    RAISE EXCEPTION 'unsupported note visibility was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO clinical.clinical_notes(encounter_id,author_person_id,note_type,body_ciphertext,visibility_code)
    VALUES ('f0160000-0000-4000-8600-000000000001','f0160000-0000-4000-8000-000000000001','progress',''::bytea,'private');
    RAISE EXCEPTION 'blank note ciphertext was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO clinical.clinical_notes(encounter_id,author_person_id,note_type,body_ciphertext,visibility_code,supersedes_id)
    VALUES ('f0160000-0000-4000-8600-000000000002','f0160000-0000-4000-8000-000000000001','progress',decode('01','hex'),'private','f0160000-0000-4000-8700-000000000001');
    RAISE EXCEPTION 'cross-encounter note supersession was stored';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  INSERT INTO clinical.referrals(id,source_encounter_id,patient_id,requester_person_id,target_specialty,reason_summary)
  VALUES (accepted_id,'f0160000-0000-4000-8600-000000000001','f0160000-0000-4000-8100-000000000001','f0160000-0000-4000-8000-000000000001','general','Synthetic referral reason');
  IF (SELECT status<>'pending' OR resulting_appointment_id IS NOT NULL OR accepted_field_codes IS NOT NULL
      FROM clinical.referrals WHERE id=accepted_id) THEN
    RAISE EXCEPTION 'pending referral had an accepted disclosure or appointment';
  END IF;
  BEGIN
    INSERT INTO clinical.referrals(source_encounter_id,patient_id,requester_person_id,target_specialty,reason_summary,status)
    VALUES ('f0160000-0000-4000-8600-000000000001','f0160000-0000-4000-8100-000000000001',
      'f0160000-0000-4000-8000-000000000001','general','Synthetic invalid status','cancelled');
    RAISE EXCEPTION 'unapproved referral status was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE clinical.referrals SET patient_id='f0160000-0000-4000-8100-000000000002' WHERE id=accepted_id;
    RAISE EXCEPTION 'missing F010 source encounter/patient link guard';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    UPDATE clinical.referrals SET accepted_field_codes=ARRAY['reason_summary'] WHERE id=accepted_id;
    RAISE EXCEPTION 'pending referral stored disclosure selection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE clinical.referrals SET resulting_appointment_id='f0160000-0000-4000-8500-000000000001' WHERE id=accepted_id;
    RAISE EXCEPTION 'pending referral linked an appointment';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE clinical.referrals SET encounter_type='unrelated-type' WHERE id=accepted_id;
    RAISE EXCEPTION 'referral stored an encounter type unrelated to its source';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE clinical.referrals SET status='accepted',resulting_appointment_id='f0160000-0000-4000-8500-000000000001',
      target_facility_id='f0160000-0000-4000-8200-000000000001',target_doctor_person_id='f0160000-0000-4000-8000-000000000001',
      accepted_field_codes=ARRAY['reason_summary','reason_summary'],accepted_by_person_id='f0160000-0000-4000-8000-000000000002',accepted_at=statement_timestamp()
      WHERE id=accepted_id;
    RAISE EXCEPTION 'duplicate disclosure field selection was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE clinical.referrals SET status='accepted',resulting_appointment_id='f0160000-0000-4000-8500-000000000001',
      target_facility_id='f0160000-0000-4000-8200-000000000001',target_doctor_person_id='f0160000-0000-4000-8000-000000000001',
      accepted_field_codes=ARRAY['reason_summary','private_note'],accepted_by_person_id='f0160000-0000-4000-8000-000000000002',accepted_at=statement_timestamp()
      WHERE id=accepted_id;
    RAISE EXCEPTION 'unapproved referral disclosure field was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE clinical.referrals SET status='accepted',resulting_appointment_id='f0160000-0000-4000-8500-000000000001',
      target_facility_id='f0160000-0000-4000-8200-000000000001',target_doctor_person_id='f0160000-0000-4000-8000-000000000001',
      accepted_field_codes=ARRAY['reason_summary','encounter_type'],accepted_by_person_id='f0160000-0000-4000-8000-000000000002',accepted_at=statement_timestamp()
      WHERE id=accepted_id;
    RAISE EXCEPTION 'encounter_type disclosure without source value was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE clinical.referrals SET status='accepted',resulting_appointment_id='f0160000-0000-4000-8500-000000000002',
      target_facility_id='f0160000-0000-4000-8200-000000000001',target_doctor_person_id='f0160000-0000-4000-8000-000000000001',
      accepted_field_codes=ARRAY['reason_summary'],accepted_by_person_id='f0160000-0000-4000-8000-000000000002',accepted_at=statement_timestamp()
      WHERE id=accepted_id;
    RAISE EXCEPTION 'missing F010 accepted appointment/patient link guard';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  UPDATE clinical.referrals SET status='accepted',resulting_appointment_id='f0160000-0000-4000-8500-000000000001',
    target_facility_id='f0160000-0000-4000-8200-000000000001',target_doctor_person_id='f0160000-0000-4000-8000-000000000001',
    accepted_field_codes=ARRAY['reason_summary'],accepted_by_person_id='f0160000-0000-4000-8000-000000000002',accepted_at=statement_timestamp()
    WHERE id=accepted_id;
  INSERT INTO clinical.referrals(id,source_encounter_id,patient_id,requester_person_id,target_specialty,reason_summary)
  VALUES ('f0160000-0000-4000-8800-000000000002','f0160000-0000-4000-8600-000000000001',
    'f0160000-0000-4000-8100-000000000001','f0160000-0000-4000-8000-000000000001','general','Synthetic second reason');
  BEGIN
    UPDATE clinical.referrals SET status='accepted',resulting_appointment_id='f0160000-0000-4000-8500-000000000001',
      target_facility_id='f0160000-0000-4000-8200-000000000001',target_doctor_person_id='f0160000-0000-4000-8000-000000000001',
      accepted_field_codes=ARRAY['reason_summary'],accepted_by_person_id='f0160000-0000-4000-8000-000000000002',accepted_at=statement_timestamp()
      WHERE id='f0160000-0000-4000-8800-000000000002';
    RAISE EXCEPTION 'duplicate resulting appointment was linked to two referrals';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE clinical.referrals SET status='accepted',resulting_appointment_id='f0160000-0000-4000-8500-000000000003',
    target_facility_id='f0160000-0000-4000-8200-000000000001',target_doctor_person_id='f0160000-0000-4000-8000-000000000001',
    encounter_type='consultation',accepted_field_codes=ARRAY['reason_summary','encounter_type'],
    accepted_by_person_id='f0160000-0000-4000-8000-000000000002',accepted_at=statement_timestamp()
    WHERE id='f0160000-0000-4000-8800-000000000002';
  IF (SELECT accepted_field_codes IS DISTINCT FROM ARRAY['reason_summary','encounter_type']::text[]
      OR encounter_type IS DISTINCT FROM 'consultation'
      FROM clinical.referrals WHERE id='f0160000-0000-4000-8800-000000000002') THEN
    RAISE EXCEPTION 'valid explicit encounter_type selection was not stored';
  END IF;
  BEGIN
    UPDATE clinical.referrals SET reason_summary='Changed after acceptance' WHERE id=accepted_id;
    RAISE EXCEPTION 'missing F010 immutable accepted disclosure guard';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE clinical.referrals SET status='pending',resulting_appointment_id=NULL,accepted_field_codes=NULL,
      accepted_by_person_id=NULL,accepted_at=NULL WHERE id=accepted_id;
    RAISE EXCEPTION 'missing F010 accepted referral reversal guard';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  INSERT INTO trust.messages(id,context_type,context_id,sender_person_id,body_ciphertext,attachment)
  VALUES ('f0160000-0000-4000-8900-000000000001','appointment','f0160000-0000-4000-8500-000000000001',
    'f0160000-0000-4000-8000-000000000002',decode('01020304','hex'),NULL);
  IF (SELECT attachment IS NOT NULL OR octet_length(body_ciphertext)=0 OR context_type<>'appointment'
      FROM trust.messages WHERE id='f0160000-0000-4000-8900-000000000001') THEN
    RAISE EXCEPTION 'valid body-only appointment message storage shape failed';
  END IF;
  BEGIN
    INSERT INTO trust.messages(context_type,context_id,sender_person_id,body_ciphertext)
    VALUES ('encounter','f0160000-0000-4000-8500-000000000001','f0160000-0000-4000-8000-000000000002',decode('01','hex'));
    RAISE EXCEPTION 'non-appointment message context was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO trust.messages(context_id,sender_person_id,body_ciphertext)
    VALUES ('f0160000-0000-4000-8500-000000000001','f0160000-0000-4000-8000-000000000002',''::bytea);
    RAISE EXCEPTION 'blank message ciphertext was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO trust.messages(context_id,sender_person_id,body_ciphertext,attachment)
    VALUES ('f0160000-0000-4000-8500-000000000001','f0160000-0000-4000-8000-000000000002',decode('01','hex'),'{}'::jsonb);
    RAISE EXCEPTION 'attachment object was persisted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE trust.messages SET attachment='null'::jsonb WHERE id='f0160000-0000-4000-8900-000000000001';
    RAISE EXCEPTION 'JSON null attachment was persisted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$storage_vectors$;

ROLLBACK;
