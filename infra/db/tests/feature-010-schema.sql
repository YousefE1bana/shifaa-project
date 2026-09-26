BEGIN;

DO $feature_010_schema$
DECLARE
  missing_tables text[] := ARRAY[]::text[];
  relation_name text;
  required_column record;
  actual_type oid;
  actual_not_null boolean;
  actual_default text;
  check_definition text;
  required_foreign_key record;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'clinical.encounters',
    'clinical.encounter_participants',
    'clinical.clinical_notes',
    'clinical.conditions',
    'clinical.referrals',
    'trust.messages'
  ] LOOP
    IF to_regclass(relation_name) IS NULL THEN
      missing_tables := array_append(missing_tables, relation_name);
    END IF;
  END LOOP;

  IF cardinality(missing_tables) > 0 THEN
    RAISE EXCEPTION 'F010 schema missing tables: %', array_to_string(missing_tables, ', ');
  END IF;

  FOR required_column IN
    SELECT * FROM (VALUES
      ('clinical.encounters', 'id', 'uuid', true),
      ('clinical.encounters', 'patient_person_id', 'uuid', true),
      ('clinical.encounters', 'facility_id', 'uuid', true),
      ('clinical.encounters', 'appointment_id', 'uuid', false),
      ('clinical.encounters', 'responsible_clinician_id', 'uuid', true),
      ('clinical.encounters', 'encounter_type', 'text', true),
      ('clinical.encounters', 'status', 'text', true),
      ('clinical.encounters', 'started_at', 'timestamp with time zone', true),
      ('clinical.encounters', 'ended_at', 'timestamp with time zone', false),
      ('clinical.encounters', 'completion_summary', 'text', false),
      ('clinical.encounters', 'condition_ids', 'uuid[]', true),
      ('clinical.encounters', 'observation_ids', 'uuid[]', true),
      ('clinical.encounters', 'order_ids', 'uuid[]', true),
      ('clinical.encounters', 'created_at', 'timestamp with time zone', true),
      ('clinical.encounters', 'updated_at', 'timestamp with time zone', true),
      ('clinical.encounters', 'version', 'integer', true),
      ('clinical.encounter_participants', 'encounter_id', 'uuid', true),
      ('clinical.encounter_participants', 'person_id', 'uuid', true),
      ('clinical.encounter_participants', 'role_code', 'text', true),
      ('clinical.encounter_participants', 'started_at', 'timestamp with time zone', true),
      ('clinical.encounter_participants', 'ended_at', 'timestamp with time zone', false),
      ('clinical.encounter_participants', 'created_at', 'timestamp with time zone', true),
      ('clinical.encounter_participants', 'updated_at', 'timestamp with time zone', true),
      ('clinical.encounter_participants', 'version', 'integer', true),
      ('clinical.clinical_notes', 'id', 'uuid', true),
      ('clinical.clinical_notes', 'encounter_id', 'uuid', true),
      ('clinical.clinical_notes', 'author_person_id', 'uuid', true),
      ('clinical.clinical_notes', 'note_type', 'text', true),
      ('clinical.clinical_notes', 'body_ciphertext', 'bytea', true),
      ('clinical.clinical_notes', 'visibility_code', 'text', true),
      ('clinical.clinical_notes', 'signed_at', 'timestamp with time zone', true),
      ('clinical.clinical_notes', 'supersedes_id', 'uuid', false),
      ('clinical.conditions', 'id', 'uuid', true),
      ('clinical.conditions', 'patient_id', 'uuid', true),
      ('clinical.conditions', 'code_system', 'text', true),
      ('clinical.conditions', 'code', 'text', true),
      ('clinical.conditions', 'display_name_ar', 'text', true),
      ('clinical.conditions', 'display_name_en', 'text', true),
      ('clinical.conditions', 'clinical_status', 'text', true),
      ('clinical.conditions', 'verification_status', 'text', true),
      ('clinical.conditions', 'onset_date', 'date', false),
      ('clinical.conditions', 'abatement_date', 'date', false),
      ('clinical.conditions', 'recorded_by_person_id', 'uuid', true),
      ('clinical.conditions', 'verified_by_person_id', 'uuid', false),
      ('clinical.conditions', 'pending_standardization', 'boolean', true),
      ('clinical.conditions', 'created_at', 'timestamp with time zone', true),
      ('clinical.conditions', 'updated_at', 'timestamp with time zone', true),
      ('clinical.conditions', 'version', 'integer', true),
      ('clinical.referrals', 'id', 'uuid', true),
      ('clinical.referrals', 'source_encounter_id', 'uuid', true),
      ('clinical.referrals', 'patient_id', 'uuid', true),
      ('clinical.referrals', 'requester_person_id', 'uuid', true),
      ('clinical.referrals', 'target_specialty', 'text', true),
      ('clinical.referrals', 'reason_summary', 'text', true),
      ('clinical.referrals', 'encounter_type', 'text', false),
      ('clinical.referrals', 'status', 'text', true),
      ('clinical.referrals', 'version', 'integer', true),
      ('clinical.referrals', 'target_facility_id', 'uuid', false),
      ('clinical.referrals', 'target_doctor_person_id', 'uuid', false),
      ('clinical.referrals', 'resulting_appointment_id', 'uuid', false),
      ('clinical.referrals', 'accepted_field_codes', 'text[]', false),
      ('clinical.referrals', 'accepted_by_person_id', 'uuid', false),
      ('clinical.referrals', 'accepted_at', 'timestamp with time zone', false),
      ('clinical.referrals', 'created_at', 'timestamp with time zone', true),
      ('clinical.referrals', 'updated_at', 'timestamp with time zone', true),
      ('trust.messages', 'id', 'uuid', true),
      ('trust.messages', 'context_type', 'text', true),
      ('trust.messages', 'context_id', 'uuid', true),
      ('trust.messages', 'sender_person_id', 'uuid', true),
      ('trust.messages', 'body_ciphertext', 'bytea', true),
      ('trust.messages', 'attachment', 'jsonb', false),
      ('trust.messages', 'sent_at', 'timestamp with time zone', true),
      ('trust.messages', 'edited_at', 'timestamp with time zone', false),
      ('trust.messages', 'deleted_at', 'timestamp with time zone', false)
    ) AS expected(table_name, column_name, type_name, not_null)
  LOOP
    SELECT a.atttypid, a.attnotnull
      INTO actual_type, actual_not_null
      FROM pg_attribute a
      WHERE a.attrelid = to_regclass(required_column.table_name)
        AND a.attname = required_column.column_name
        AND a.attnum > 0
        AND NOT a.attisdropped;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'F010 schema missing column %.%', required_column.table_name, required_column.column_name;
    END IF;
    IF actual_type <> to_regtype(required_column.type_name) THEN
      RAISE EXCEPTION 'F010 schema type mismatch for %.%: expected %, found %',
        required_column.table_name, required_column.column_name, required_column.type_name, actual_type::regtype;
    END IF;
    IF actual_not_null IS DISTINCT FROM required_column.not_null THEN
      RAISE EXCEPTION 'F010 schema nullability mismatch for %.%: expected not_null %, found %',
        required_column.table_name, required_column.column_name, required_column.not_null, actual_not_null;
    END IF;
  END LOOP;

  FOR required_foreign_key IN
    SELECT * FROM (VALUES
      ('clinical.encounters', 'patient_person_id', 'identity.people', 'id'),
      ('clinical.encounters', 'facility_id', 'identity.facilities', 'id'),
      ('clinical.encounters', 'appointment_id', 'clinical.appointments', 'id'),
      ('clinical.encounters', 'responsible_clinician_id', 'identity.people', 'id'),
      ('clinical.encounter_participants', 'encounter_id', 'clinical.encounters', 'id'),
      ('clinical.encounter_participants', 'person_id', 'identity.people', 'id'),
      ('clinical.clinical_notes', 'encounter_id', 'clinical.encounters', 'id'),
      ('clinical.clinical_notes', 'author_person_id', 'identity.people', 'id'),
      ('clinical.conditions', 'patient_id', 'identity.patients', 'id'),
      ('clinical.conditions', 'recorded_by_person_id', 'identity.people', 'id'),
      ('clinical.conditions', 'verified_by_person_id', 'identity.people', 'id'),
      ('clinical.referrals', 'source_encounter_id', 'clinical.encounters', 'id'),
      ('clinical.referrals', 'patient_id', 'identity.patients', 'id'),
      ('clinical.referrals', 'requester_person_id', 'identity.people', 'id'),
      ('clinical.referrals', 'target_facility_id', 'identity.facilities', 'id'),
      ('clinical.referrals', 'target_doctor_person_id', 'identity.people', 'id'),
      ('clinical.referrals', 'resulting_appointment_id', 'clinical.appointments', 'id'),
      ('trust.messages', 'context_id', 'clinical.appointments', 'id'),
      ('trust.messages', 'sender_person_id', 'identity.people', 'id')
    ) AS expected(child_table, child_column, parent_table, parent_column)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint fk
      WHERE fk.conrelid = to_regclass(required_foreign_key.child_table)
        AND fk.contype = 'f'
        AND fk.conkey = ARRAY[(
          SELECT a.attnum
          FROM pg_attribute a
          WHERE a.attrelid = to_regclass(required_foreign_key.child_table)
            AND a.attname = required_foreign_key.child_column
            AND a.attnum > 0
            AND NOT a.attisdropped
        )]::smallint[]
        AND fk.confrelid = to_regclass(required_foreign_key.parent_table)
        AND fk.confkey = ARRAY[(
          SELECT a.attnum
          FROM pg_attribute a
          WHERE a.attrelid = to_regclass(required_foreign_key.parent_table)
            AND a.attname = required_foreign_key.parent_column
            AND a.attnum > 0
            AND NOT a.attisdropped
        )]::smallint[]
    ) THEN
      RAISE EXCEPTION 'F010 schema missing foreign key %.% -> %.%',
        required_foreign_key.child_table,
        required_foreign_key.child_column,
        required_foreign_key.parent_table,
        required_foreign_key.parent_column;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint fk
    WHERE fk.conrelid = 'clinical.clinical_notes'::regclass
      AND fk.contype = 'f'
      AND fk.conkey = ARRAY[
        (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'clinical.clinical_notes'::regclass AND a.attname = 'supersedes_id'),
        (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'clinical.clinical_notes'::regclass AND a.attname = 'encounter_id')
      ]::smallint[]
      AND fk.confrelid = 'clinical.clinical_notes'::regclass
      AND fk.confkey = ARRAY[
        (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'clinical.clinical_notes'::regclass AND a.attname = 'id'),
        (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'clinical.clinical_notes'::regclass AND a.attname = 'encounter_id')
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION 'F010 schema missing same-encounter note supersession foreign key';
  END IF;

  FOR relation_name IN
    SELECT unnest(ARRAY[
      'clinical.encounters',
      'clinical.encounter_participants',
      'clinical.clinical_notes',
      'clinical.conditions',
      'clinical.referrals',
      'trust.messages'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.conrelid = to_regclass(relation_name)
        AND c.contype = 'p'
    ) THEN
      RAISE EXCEPTION 'F010 schema missing primary key on %', relation_name;
    END IF;
  END LOOP;

  SELECT pg_get_constraintdef(c.oid) INTO check_definition
  FROM pg_constraint c
  WHERE c.conrelid = 'clinical.encounters'::regclass
    AND c.contype = 'c'
    AND c.conname = 'encounters_status_check';
  IF check_definition IS NULL
    OR check_definition NOT LIKE '%open%'
    OR check_definition NOT LIKE '%completed%' THEN
    RAISE EXCEPTION 'F010 schema encounter status must be open|completed';
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO check_definition
  FROM pg_constraint c
  WHERE c.conrelid = 'clinical.referrals'::regclass
    AND c.contype = 'c'
    AND c.conname = 'referrals_status_check';
  IF check_definition IS NULL
    OR check_definition NOT LIKE '%pending%'
    OR check_definition NOT LIKE '%accepted%' THEN
    RAISE EXCEPTION 'F010 schema referral status must be pending|accepted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'clinical.clinical_notes'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%private%'
      AND pg_get_constraintdef(c.oid) LIKE '%patient_visible%'
  ) THEN
    RAISE EXCEPTION 'F010 schema note visibility must be private|patient_visible';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'clinical.referrals'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%pending%'
      AND pg_get_constraintdef(c.oid) LIKE '%accepted%'
      AND pg_get_constraintdef(c.oid) LIKE '%accepted_field_codes%'
      AND pg_get_constraintdef(c.oid) LIKE '%resulting_appointment_id%'
      AND pg_get_constraintdef(c.oid) LIKE '%accepted_field_codes = ARRAY[''reason_summary''::text]%'
      AND pg_get_constraintdef(c.oid) LIKE '%accepted_field_codes = ARRAY[''reason_summary''::text, ''encounter_type''::text]%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%accepted_field_codes = ARRAY[''encounter_type''::text]%'
  ) THEN
    RAISE EXCEPTION 'F010 schema referral acceptance must require reason_summary and allow only the approved optional encounter_type';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'trust.messages'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%attachment IS NULL%'
  ) THEN
    RAISE EXCEPTION 'F010 schema messages must persist a null attachment';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'trust.messages'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%appointment%'
  ) THEN
    RAISE EXCEPTION 'F010 schema messages must use appointment context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'clinical.encounters'::regclass
      AND i.indisunique
      AND i.indpred IS NOT NULL
      AND pg_get_indexdef(i.indexrelid) LIKE '%appointment_id%'
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%open%'
  ) THEN
    RAISE EXCEPTION 'F010 schema missing partial unique open appointment index';
  END IF;

  FOREACH relation_name IN ARRAY ARRAY['condition_ids', 'observation_ids', 'order_ids'] LOOP
    SELECT pg_get_expr(d.adbin, d.adrelid)
      INTO actual_default
      FROM pg_attribute a
      JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'clinical.encounters'::regclass
        AND a.attname = relation_name;
    IF actual_default IS NULL OR actual_default NOT LIKE '%{}%' THEN
      RAISE EXCEPTION 'F010 schema %.% must default to an empty UUID collection', 'clinical.encounters', relation_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'clinical.encounters'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%version > 0%'
  ) THEN
    RAISE EXCEPTION 'F010 schema encounter version must be positive';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'clinical.encounter_participants',
    'clinical.conditions',
    'clinical.referrals'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass(relation_name)
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%version > 0%'
    ) THEN
      RAISE EXCEPTION 'F010 schema version must be positive on %', relation_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE (n.nspname, c.relname) IN (
      ('clinical', 'encounters'),
      ('clinical', 'encounter_participants'),
      ('clinical', 'clinical_notes'),
      ('clinical', 'conditions'),
      ('clinical', 'referrals'),
      ('trust', 'messages')
    )
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'F010 tables must enable and force row-level security';
  END IF;

END
$feature_010_schema$;

ROLLBACK;
