BEGIN;

-- Appointment detail exists before check-in, so its authorized read must
-- expose the current scoped overlay independently of a queue entry.
CREATE OR REPLACE FUNCTION clinical.read_appointment_projection_v1(p_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment_row clinical.appointments%ROWTYPE; actor uuid:=platform.context_person_id();
  allowed boolean:=false; current_delay integer;
BEGIN
  SELECT * INTO appointment_row FROM clinical.appointments WHERE id=p_appointment_id;
  IF NOT FOUND OR actor IS NULL THEN RETURN NULL; END IF;
  IF appointment_row.patient_person_id=actor THEN
    PERFORM clinical.assert_current_patient_scope_v1(actor); allowed:=true;
  ELSE
    SELECT EXISTS(SELECT 1 FROM identity.facility_memberships m
      WHERE m.facility_id=appointment_row.facility_id AND m.person_id=actor
        AND m.membership_status='active') INTO allowed;
  END IF;
  IF NOT allowed THEN RETURN NULL; END IF;
  SELECT e.delay_minutes INTO current_delay
  FROM clinical.queue_scopes scope
  JOIN clinical.schedule_exceptions e ON e.id=scope.current_delay_exception_id
    AND e.exception_type='delay' AND e.superseded_at IS NULL
    AND e.facility_id=scope.facility_id
    AND e.doctor_person_id=scope.doctor_person_id
    AND e.civil_date=scope.civil_date
  WHERE scope.facility_id=appointment_row.facility_id
    AND scope.doctor_person_id=appointment_row.doctor_person_id
    AND scope.civil_date=appointment_row.civil_date;
  RETURN clinical.project_appointment_v1(p_appointment_id)
    || CASE WHEN current_delay IS NULL THEN '{}'::jsonb
            ELSE pg_catalog.jsonb_build_object('delayMinutes',current_delay) END;
END $$;

REVOKE ALL ON FUNCTION clinical.read_appointment_projection_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.read_appointment_projection_v1(uuid) TO shifaa_api;

-- The patient read remains bound to the authorized subject projection. The
-- queue scope points to exactly one current delay declaration; superseded
-- declarations and unrelated doctor/date scopes never enter this response.
CREATE OR REPLACE FUNCTION clinical.read_queue_position_v1(p_appointment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'appointmentId',p_appointment_id,'state',q.state,'queueNumber',q.queue_number,
    'position',q.waiting_order,'estimatedServiceAt',q.estimated_service_at,
    'queueVersion',q.version,'updatedAt',q.updated_at,'stale',false
  ) || CASE WHEN delay.delay_minutes IS NULL THEN '{}'::jsonb
           ELSE pg_catalog.jsonb_build_object('delayMinutes',delay.delay_minutes) END
  FROM clinical.read_my_queue_position_v1(p_appointment_id) q
  LEFT JOIN LATERAL (
    SELECT e.delay_minutes
    FROM clinical.queue_entries entry
    JOIN clinical.queue_scopes scope ON scope.id=entry.queue_scope_id
    JOIN clinical.schedule_exceptions e ON e.id=scope.current_delay_exception_id
      AND e.exception_type='delay' AND e.superseded_at IS NULL
      AND e.facility_id=scope.facility_id
      AND e.doctor_person_id=scope.doctor_person_id
      AND e.civil_date=scope.civil_date
    WHERE entry.appointment_id=p_appointment_id
    LIMIT 1
  ) delay ON true
$$;

REVOKE ALL ON FUNCTION clinical.read_queue_position_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.read_queue_position_v1(uuid) TO shifaa_api;

COMMIT;
