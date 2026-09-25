BEGIN;

-- Roll forward the Feature 009 exception guard without rewriting the already
-- committed scheduling migration. Base candidates use the same civil-time,
-- gap, and earlier-offset rules as list_availability_v1.
CREATE OR REPLACE FUNCTION clinical.create_schedule_exception_v1(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_row clinical.schedules%ROWTYPE; exception_id uuid; exception_type text; expected_version integer;
  idem_id uuid; idem_new boolean; idem_response jsonb; result jsonb;
BEGIN
  expected_version := NULLIF(p_input->>'expected_version','')::integer;
  IF p_input IS NULL OR (p_input->>'schedule_id')::uuid IS NULL OR expected_version IS NULL OR expected_version<1 OR (p_input->>'civil_date')::date IS NULL
     OR (p_input->>'starts_at')::timestamptz IS NULL OR (p_input->>'ends_at')::timestamptz IS NULL
     OR (p_input->>'reason') IS NULL OR octet_length(p_input->>'reason') NOT BETWEEN 1 AND 500
     OR (p_input->>'reason') ~ E'[\\r\\n\\t]'
  THEN RAISE EXCEPTION 'invalid schedule exception request' USING ERRCODE='22023'; END IF;
  exception_type := p_input->>'exception_type';
  IF exception_type NOT IN ('blocked','added') THEN RAISE EXCEPTION 'ordinary exception type is invalid' USING ERRCODE='22023'; END IF;
  IF p_input ? 'delay_minutes' OR p_input ? 'delayMinutes' THEN
    RAISE EXCEPTION 'delay declarations require send_doctor_delay_v1' USING ERRCODE='22023';
  END IF;
  SELECT * INTO schedule_row FROM clinical.schedules WHERE id=(p_input->>'schedule_id')::uuid FOR UPDATE;
  IF NOT FOUND OR schedule_row.status<>'active' OR NOT ((p_input->>'civil_date')::date <@ schedule_row.valid_dates)
     OR (p_input->>'ends_at')::timestamptz <= (p_input->>'starts_at')::timestamptz
     OR ((p_input->>'starts_at')::timestamptz AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM (p_input->>'civil_date')::date
  THEN RAISE EXCEPTION 'schedule exception scope denied' USING ERRCODE='42501'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(schedule_row.facility_id,schedule_row.doctor_person_id,(p_input->>'civil_date')::date,'schedule.manage');
  IF schedule_row.version IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION 'schedule is stale or missing' USING ERRCODE='40001';
  END IF;
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/clinics/{facilityId}/schedules/{scheduleId}/exceptions');
  IF NOT idem_new THEN RETURN idem_response; END IF;

  IF exception_type='added' THEN
    IF EXISTS (
      WITH candidates AS (
        SELECT schedule_row.timezone_name,schedule_row.slot_duration_minutes,
          ((p_input->>'civil_date')::date::timestamp + (w.start_second + series.step)::double precision * interval '1 second') AS local_start_ts
        FROM clinical.schedule_windows w
        CROSS JOIN LATERAL generate_series(0,w.end_second-w.start_second-schedule_row.slot_duration_minutes*60,schedule_row.slot_duration_minutes*60) AS series(step)
        WHERE w.schedule_id=schedule_row.id AND w.iso_weekday=extract(isodow FROM (p_input->>'civil_date')::date)::smallint
      ), resolved AS (
        SELECT candidates.*,make_timestamptz(
          extract(year FROM candidates.local_start_ts)::integer,extract(month FROM candidates.local_start_ts)::integer,
          extract(day FROM candidates.local_start_ts)::integer,extract(hour FROM candidates.local_start_ts)::integer,
          extract(minute FROM candidates.local_start_ts)::integer,extract(second FROM candidates.local_start_ts),candidates.timezone_name
        ) AS start_utc_raw
        FROM candidates
      ), slots AS (
        SELECT CASE WHEN ((resolved.start_utc_raw-interval '1 hour') AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts
          THEN resolved.start_utc_raw-interval '1 hour' ELSE resolved.start_utc_raw END AS starts_at,
          (CASE WHEN ((resolved.start_utc_raw-interval '1 hour') AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts
            THEN resolved.start_utc_raw-interval '1 hour' ELSE resolved.start_utc_raw END
            + resolved.slot_duration_minutes*interval '1 minute') AS ends_at
        FROM resolved
        WHERE (resolved.start_utc_raw AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts
      )
      SELECT 1 FROM slots
      WHERE tstzrange(slots.starts_at,slots.ends_at,'[)') && tstzrange((p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz,'[)')
    ) THEN
      RAISE EXCEPTION 'added schedule exception overlaps effective base availability' USING ERRCODE='23P01';
    END IF;

    IF EXISTS (
      SELECT 1 FROM clinical.schedule_exceptions e
      WHERE e.schedule_id=schedule_row.id AND e.civil_date=(p_input->>'civil_date')::date
        AND e.exception_type IN ('blocked','absence') AND e.superseded_at IS NULL
        AND e.effective_range && tstzrange((p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz,'[)')
    ) THEN
      RAISE EXCEPTION 'added schedule exception overlaps unavailable time' USING ERRCODE='23P01';
    END IF;
  END IF;

  INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
  VALUES (schedule_row.id,schedule_row.facility_id,schedule_row.doctor_person_id,schedule_row.timezone_name,(p_input->>'civil_date')::date,
    (p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz,exception_type,p_input->>'reason',platform.context_person_id(),platform.context_person_id())
  RETURNING id INTO exception_id;
  UPDATE clinical.schedules
  SET version=version+1,updated_by_person_id=platform.context_person_id()
  WHERE id=schedule_row.id AND version=expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule is stale or missing' USING ERRCODE='40001'; END IF;
  result := clinical.project_schedule_exception_v1(exception_id);
  IF result IS NULL THEN RAISE EXCEPTION 'schedule exception projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.record_mutation_effect_v2('clinical.schedule.changed.v1','schedule.exception.created','schedule_exception',exception_id,(result->>'version')::integer,schedule_row.facility_id);
  PERFORM clinical.maybe_inject_failure_v1('create_schedule_exception');
  PERFORM clinical.complete_mutation_v1(idem_id,201,'schedule_exception',exception_id,result);
  RETURN result;
END $$;

COMMIT;
