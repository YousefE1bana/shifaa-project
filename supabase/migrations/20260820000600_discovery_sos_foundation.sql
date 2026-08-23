BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS hospital;

ALTER TABLE identity.facilities
  ADD COLUMN IF NOT EXISTS location geography(Point,4326),
  ADD COLUMN IF NOT EXISTS location_verified_at timestamptz;
CREATE INDEX IF NOT EXISTS facilities_location_gist
  ON identity.facilities USING gist(location)
  WHERE location IS NOT NULL;

ALTER TABLE identity.patients ADD COLUMN IF NOT EXISTS blood_group text;
ALTER TABLE identity.patients DROP CONSTRAINT IF EXISTS patients_blood_group_check;
ALTER TABLE identity.patients ADD CONSTRAINT patients_blood_group_check
  CHECK (blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown'));

-- Objective callback verification for the seeded-synthetic 006 runtime. This
-- admits no production verifier and closes no vendor or legal gate.
CREATE TABLE IF NOT EXISTS identity.callback_contact_verifications (
  person_id uuid PRIMARY KEY REFERENCES identity.people(id),
  phone_e164 text NOT NULL,
  source_code text NOT NULL CHECK (source_code='synthetic_seed'),
  verified_at timestamptz NOT NULL,
  valid_until timestamptz,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (verified_at<=created_at),
  CHECK (valid_until IS NULL OR valid_until>verified_at),
  CHECK (revoked_at IS NULL OR revoked_at>=verified_at)
);

CREATE TABLE IF NOT EXISTS hospital.capacity_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL UNIQUE REFERENCES identity.facilities(id),
  emergency_available_count integer NOT NULL CHECK (emergency_available_count >= 0),
  emergency_held_count integer NOT NULL CHECK (emergency_held_count >= 0),
  signal text NOT NULL CHECK (signal IN ('available','limited','unavailable','unknown')),
  observed_at timestamptz NOT NULL,
  fresh_until timestamptz NOT NULL,
  source_code text NOT NULL CHECK (source_code = 'synthetic_seed'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fresh_until >= observed_at),
  CHECK (
    (signal IN ('available','limited') AND emergency_available_count > 0)
    OR (signal IN ('unavailable','unknown') AND emergency_available_count = 0)
  )
);
CREATE INDEX IF NOT EXISTS capacity_projection_freshness_idx
  ON hospital.capacity_projections(fresh_until,facility_id);

CREATE TABLE IF NOT EXISTS platform.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  environment text NOT NULL CHECK (environment IN ('local','ci','production')),
  enabled boolean NOT NULL DEFAULT false,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(constraints)='object'),
  approved_by_person_id uuid REFERENCES identity.people(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code,environment)
);

CREATE TABLE IF NOT EXISTS platform.sos_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES identity.patients(id),
  initiated_by_user_id uuid NOT NULL REFERENCES identity.people(id),
  coordinates geography(Point,4326) NOT NULL,
  coordinate_precision text NOT NULL CHECK (coordinate_precision='exact'),
  qualifying_reason_code text NOT NULL CHECK (qualifying_reason_code IN ('medical_emergency','accident_or_injury','other_life_safety')),
  contact_preference text NOT NULL CHECK (contact_preference IN ('none','all_confirmed')),
  callback_source text NOT NULL CHECK (callback_source IN ('patient_verified_contact','initiator_verified_contact')),
  status text NOT NULL CHECK (status IN ('active_unmatched','matched','accepted','closed')),
  matched_facility_id uuid REFERENCES identity.facilities(id),
  accepted_by_user_id uuid REFERENCES identity.people(id),
  acceptance_note_code text CHECK (acceptance_note_code IN ('capacity_acknowledged','manual_coordination_required')),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES identity.people(id),
  close_outcome_code text CHECK (close_outcome_code IN ('help_received','no_longer_needed','hospital_follow_up','created_in_error')),
  retention_class text NOT NULL DEFAULT 'SOS_LOCATION' CHECK (retention_class='SOS_LOCATION'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (public.ST_SRID(coordinates::public.geometry)=4326 AND public.GeometryType(coordinates::public.geometry)='POINT'),
  CHECK (accepted_at IS NULL OR accepted_at>=initiated_at),
  CHECK (closed_at IS NULL OR closed_at>=initiated_at),
  CHECK (
    (status='active_unmatched' AND matched_facility_id IS NULL AND accepted_by_user_id IS NULL AND acceptance_note_code IS NULL AND accepted_at IS NULL AND closed_at IS NULL AND closed_by_user_id IS NULL AND close_outcome_code IS NULL)
    OR (status='matched' AND matched_facility_id IS NOT NULL AND accepted_by_user_id IS NULL AND acceptance_note_code IS NULL AND accepted_at IS NULL AND closed_at IS NULL AND closed_by_user_id IS NULL AND close_outcome_code IS NULL)
    OR (status='accepted' AND matched_facility_id IS NOT NULL AND accepted_by_user_id IS NOT NULL AND acceptance_note_code IS NOT NULL AND accepted_at IS NOT NULL AND closed_at IS NULL AND closed_by_user_id IS NULL AND close_outcome_code IS NULL)
    OR (status='closed' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL AND close_outcome_code IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS sos_incident_one_open_per_patient_uq
  ON platform.sos_incidents(patient_id)
  WHERE status<>'closed';
CREATE INDEX IF NOT EXISTS sos_incident_patient_history_idx
  ON platform.sos_incidents(patient_id,initiated_at DESC,id);
CREATE INDEX IF NOT EXISTS sos_incident_hospital_worklist_idx
  ON platform.sos_incidents(matched_facility_id,status,initiated_at DESC,id)
  WHERE matched_facility_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.emergency_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES platform.sos_incidents(id),
  created_by_user_id uuid NOT NULL REFERENCES identity.people(id),
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest)=32),
  scope_fields text[] NOT NULL CHECK (cardinality(scope_fields)>0),
  expires_at timestamptz NOT NULL,
  access_limit smallint NOT NULL DEFAULT 1 CHECK (access_limit=1),
  access_count smallint NOT NULL DEFAULT 0 CHECK (access_count IN (0,1)),
  used_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES identity.people(id),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '30 minutes'),
  CHECK ((access_count=0 AND used_at IS NULL) OR (access_count=1 AND used_at IS NOT NULL)),
  CHECK ((revoked_at IS NULL AND revoked_by_user_id IS NULL) OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)),
  CHECK (NOT (used_at IS NOT NULL AND revoked_at IS NOT NULL)),
  CHECK (scope_fields <@ ARRAY['blood_group','confirmed_allergies','active_dispensed_medicines','chronic_conditions','emergency_notes']::text[])
);
CREATE INDEX IF NOT EXISTS emergency_share_incident_history_idx
  ON platform.emergency_share_links(incident_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS emergency_share_active_expiry_idx
  ON platform.emergency_share_links(expires_at,id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- Generalize the governed notification metadata without changing existing patient rows.
ALTER TABLE platform.notification_template_releases
  DROP CONSTRAINT IF EXISTS notification_template_releases_allowed_recipient_types_check;
ALTER TABLE platform.notification_template_releases
  ADD CONSTRAINT notification_template_releases_allowed_recipient_types_check
  CHECK (
    cardinality(allowed_recipient_types) BETWEEN 1 AND 2
    AND allowed_recipient_types <@ ARRAY['patient','emergency_contact']::text[]
  );

ALTER TABLE platform.notifications
  ADD COLUMN IF NOT EXISTS recipient_emergency_contact_id uuid REFERENCES identity.emergency_contacts(id);
ALTER TABLE platform.notifications ALTER COLUMN recipient_person_id DROP NOT NULL;
ALTER TABLE platform.notifications DROP CONSTRAINT IF EXISTS notifications_recipient_type_check;
ALTER TABLE platform.notifications ADD CONSTRAINT notifications_recipient_type_check
  CHECK (recipient_type IN ('patient','emergency_contact'));
ALTER TABLE platform.notifications DROP CONSTRAINT IF EXISTS notifications_recipient_shape_check;
ALTER TABLE platform.notifications ADD CONSTRAINT notifications_recipient_shape_check CHECK (
  (recipient_type='patient' AND recipient_person_id IS NOT NULL AND recipient_emergency_contact_id IS NULL)
  OR (recipient_type='emergency_contact' AND recipient_person_id IS NULL AND recipient_emergency_contact_id IS NOT NULL)
);
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  WHERE c.conrelid='platform.notifications'::regclass
    AND c.contype='u'
    AND pg_get_constraintdef(c.oid) LIKE '%template_release_id, source_event_id, recipient_type, recipient_person_id, channel%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE platform.notifications DROP CONSTRAINT %I',constraint_name);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_patient_dedup_uq
  ON platform.notifications(template_release_id,source_event_id,recipient_person_id,channel)
  WHERE recipient_type='patient';
CREATE UNIQUE INDEX IF NOT EXISTS notifications_emergency_contact_dedup_uq
  ON platform.notifications(template_release_id,source_event_id,recipient_emergency_contact_id,channel)
  WHERE recipient_type='emergency_contact';
CREATE INDEX IF NOT EXISTS notification_emergency_contact_idx
  ON platform.notifications(recipient_emergency_contact_id,status,created_at DESC)
  WHERE recipient_emergency_contact_id IS NOT NULL;

-- Keep the actual provider idempotency key stable across retries. Attempt
-- identity remains unique through (notification_id,attempt_number); the
-- provider key is a non-unique lookup because append-only retries repeat it.
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  WHERE c.conrelid='platform.notification_delivery_attempts'::regclass
    AND c.contype='u'
    AND pg_get_constraintdef(c.oid)='UNIQUE (provider_idempotency_key)';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE platform.notification_delivery_attempts DROP CONSTRAINT %I',constraint_name);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS notification_attempt_provider_key_idx
  ON platform.notification_delivery_attempts(provider_idempotency_key,finished_at DESC,id);

-- Durable receipt registry for the local-synthetic messaging boundary. Only
-- keyed digests are stored; the recipient alias and rendered body stay outside
-- durable provider state. This table is never a production provider adapter.
CREATE TABLE IF NOT EXISTS platform.synthetic_message_receipts (
  provider_idempotency_key text PRIMARY KEY CHECK (provider_idempotency_key ~ '^[a-f0-9]{64}$'),
  destination_alias_digest text NOT NULL CHECK (destination_alias_digest ~ '^[a-f0-9]{64}$'),
  rendered_digest text NOT NULL CHECK (rendered_digest ~ '^[a-f0-9]{64}$'),
  visible_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

-- Keep the platform event vocabulary closed while adding the 006 domain events.
DROP INDEX IF EXISTS platform.outbox_aggregate_version_uq;
CREATE UNIQUE INDEX outbox_aggregate_version_uq
  ON platform.outbox_events(aggregate_type,aggregate_id,aggregate_version)
  WHERE event_type IN (
    'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
    'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
    'sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','sos.emergency_contact.requested'
  );
ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
  'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
  'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked',
  'relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked',
  'emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked',
  'sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed',
  'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
  'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested'
));

CREATE OR REPLACE FUNCTION platform.context_patient_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT nullif(current_setting('shifaa.patient_context',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION platform.context_environment() RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT nullif(current_setting('shifaa.environment',true),'')
$$;

CREATE OR REPLACE FUNCTION platform.text_array_is_unique(p_values text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT cardinality(p_values)=(SELECT count(DISTINCT value) FROM unnest(p_values) AS value)
$$;
ALTER TABLE platform.emergency_share_links DROP CONSTRAINT IF EXISTS emergency_share_scope_unique_check;
ALTER TABLE platform.emergency_share_links ADD CONSTRAINT emergency_share_scope_unique_check
  CHECK (platform.text_array_is_unique(scope_fields));

CREATE OR REPLACE FUNCTION platform.feature_enabled(p_code text,p_environment text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(
    SELECT 1 FROM platform.feature_flags f
    WHERE f.code=p_code AND f.environment=p_environment AND f.enabled
  )
$$;

CREATE OR REPLACE FUNCTION platform.person_can_activate_sos(p_patient_id uuid,p_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT platform.person_is_patient_self(p_patient_id,p_person_id)
    OR platform.person_has_family_relationship(p_patient_id,p_person_id,'sos.activate')
$$;
CREATE OR REPLACE FUNCTION platform.person_can_share_sos(p_patient_id uuid,p_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT platform.person_is_patient_self(p_patient_id,p_person_id)
    OR platform.person_has_family_relationship(p_patient_id,p_person_id,'sos.share')
$$;
CREATE OR REPLACE FUNCTION platform.person_can_share_incident(p_incident_id uuid,p_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(
    SELECT 1 FROM platform.sos_incidents i
    WHERE i.id=p_incident_id AND i.status<>'closed'
      AND i.patient_id=platform.context_patient_id()
      AND platform.person_can_share_sos(i.patient_id,p_person_id)
  )
$$;
CREATE OR REPLACE FUNCTION platform.person_can_revoke_share(p_share_id uuid,p_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(
    SELECT 1
    FROM platform.emergency_share_links l
    JOIN platform.sos_incidents i ON i.id=l.incident_id
    WHERE l.id=p_share_id
      AND i.patient_id=platform.context_patient_id()
      AND platform.person_can_share_sos(i.patient_id,p_person_id)
  )
$$;
CREATE OR REPLACE FUNCTION platform.hospital_member_authorized(
  p_facility_id uuid,p_person_id uuid,p_require_aal2 boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT platform.context_role()='HSP'
    AND 'sos_prearrival'=ANY(platform.context_purposes())
    AND (NOT p_require_aal2 OR platform.context_aal()>=2)
    AND EXISTS(
      SELECT 1
      FROM identity.facilities f
      JOIN identity.facility_memberships m ON m.facility_id=f.id
      WHERE f.id=p_facility_id AND f.facility_type='hospital' AND f.facility_status='active'
        AND EXISTS(
          SELECT 1 FROM identity.facility_licenses fl
          WHERE fl.facility_id=f.id AND fl.status='verified' AND fl.expires_on>=CURRENT_DATE
        )
        AND m.person_id=p_person_id AND m.membership_status='active'
        AND m.valid_from<=statement_timestamp()
        AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
        AND (
          m.employment_license_id IS NULL
          OR EXISTS(
            SELECT 1 FROM identity.professional_licenses pl
            WHERE pl.id=m.employment_license_id AND pl.person_id=m.person_id
              AND pl.profession=m.role_code AND pl.status='verified' AND pl.expires_on>=CURRENT_DATE
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION hospital.guard_capacity_projection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM identity.facilities f
    WHERE f.id=NEW.facility_id AND f.facility_type='hospital'
  ) THEN
    RAISE EXCEPTION 'capacity projection requires a hospital facility' USING ERRCODE='23514';
  END IF;
  IF NEW.observed_at>statement_timestamp() THEN
    RAISE EXCEPTION 'capacity observation cannot be in the future' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.facility_id<>OLD.facility_id OR NEW.created_at<>OLD.created_at THEN
      RAISE EXCEPTION 'capacity projection identity is immutable' USING ERRCODE='23514';
    END IF;
    NEW.version=OLD.version+1;
    NEW.updated_at=statement_timestamp();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS capacity_projection_guard ON hospital.capacity_projections;
CREATE TRIGGER capacity_projection_guard
  BEFORE INSERT OR UPDATE ON hospital.capacity_projections
  FOR EACH ROW EXECUTE FUNCTION hospital.guard_capacity_projection();

CREATE OR REPLACE FUNCTION platform.guard_sos_incident() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.matched_facility_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM identity.facilities f
    WHERE f.id=NEW.matched_facility_id AND f.facility_type='hospital'
  ) THEN
    RAISE EXCEPTION 'SOS match must reference a hospital' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.patient_id<>OLD.patient_id OR NEW.initiated_by_user_id<>OLD.initiated_by_user_id
      OR NOT public.ST_Equals(NEW.coordinates::public.geometry,OLD.coordinates::public.geometry)
      OR NEW.coordinate_precision<>OLD.coordinate_precision
      OR NEW.qualifying_reason_code<>OLD.qualifying_reason_code
      OR NEW.contact_preference<>OLD.contact_preference
      OR NEW.callback_source<>OLD.callback_source
      OR NEW.matched_facility_id IS DISTINCT FROM OLD.matched_facility_id
      OR NEW.initiated_at<>OLD.initiated_at OR NEW.created_at<>OLD.created_at
      OR NEW.retention_class<>OLD.retention_class THEN
      RAISE EXCEPTION 'SOS incident identity and activation evidence are immutable' USING ERRCODE='23514';
    END IF;
    IF NOT (
      (OLD.status='matched' AND NEW.status='accepted')
      OR (OLD.status IN ('active_unmatched','matched','accepted') AND NEW.status='closed')
    ) THEN
      RAISE EXCEPTION 'invalid SOS transition' USING ERRCODE='23514';
    END IF;
    NEW.version=OLD.version+1;
    NEW.updated_at=statement_timestamp();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sos_incident_guard ON platform.sos_incidents;
CREATE TRIGGER sos_incident_guard
  BEFORE INSERT OR UPDATE ON platform.sos_incidents
  FOR EACH ROW EXECUTE FUNCTION platform.guard_sos_incident();
DROP TRIGGER IF EXISTS sos_incident_no_delete ON platform.sos_incidents;
CREATE TRIGGER sos_incident_no_delete
  BEFORE DELETE ON platform.sos_incidents
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

CREATE OR REPLACE FUNCTION platform.guard_emergency_share_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.incident_id<>OLD.incident_id OR NEW.created_by_user_id<>OLD.created_by_user_id
      OR NEW.token_digest<>OLD.token_digest OR NEW.scope_fields<>OLD.scope_fields
      OR NEW.expires_at<>OLD.expires_at OR NEW.access_limit<>OLD.access_limit OR NEW.created_at<>OLD.created_at THEN
      RAISE EXCEPTION 'emergency-share authority and bearer scope are immutable' USING ERRCODE='23514';
    END IF;
    IF NOT (
      (OLD.access_count=0 AND OLD.revoked_at IS NULL AND NEW.access_count=1 AND NEW.used_at IS NOT NULL AND NEW.revoked_at IS NULL)
      OR (OLD.access_count=0 AND OLD.revoked_at IS NULL AND NEW.access_count=0 AND NEW.used_at IS NULL AND NEW.revoked_at IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'invalid emergency-share transition' USING ERRCODE='23514';
    END IF;
    NEW.version=OLD.version+1;
    NEW.updated_at=statement_timestamp();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS emergency_share_link_guard ON platform.emergency_share_links;
CREATE TRIGGER emergency_share_link_guard
  BEFORE INSERT OR UPDATE ON platform.emergency_share_links
  FOR EACH ROW EXECUTE FUNCTION platform.guard_emergency_share_link();
DROP TRIGGER IF EXISTS emergency_share_link_no_delete ON platform.emergency_share_links;
CREATE TRIGGER emergency_share_link_no_delete
  BEFORE DELETE ON platform.emergency_share_links
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

CREATE OR REPLACE FUNCTION platform.capacity_count_band(p_signal text,p_available_count integer)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN p_signal IS NULL OR p_signal='unknown' THEN 'unknown'
              WHEN p_available_count=0 THEN 'none'
              WHEN p_available_count<=4 THEN 'one_to_four'
              WHEN p_available_count<=9 THEN 'five_to_nine'
              ELSE 'ten_or_more' END
$$;

CREATE OR REPLACE FUNCTION platform.search_discovery_facilities(
  p_longitude double precision DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_radius_m integer DEFAULT 25000,
  p_facility_type text DEFAULT NULL,
  p_service_code text DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_after_distance_m double precision DEFAULT NULL,
  p_after_facility_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 25
) RETURNS TABLE(
  facility_id uuid,facility_type text,name_ar text,name_en text,services text[],
  longitude double precision,latitude double precision,distance_m double precision,
  capacity_signal text,capacity_count_band text,capacity_freshness text,
  capacity_observed_at timestamptz,capacity_fresh_until timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE query_point public.geography(Point,4326);
BEGIN
  IF (p_longitude IS NULL)<>(p_latitude IS NULL) OR p_longitude NOT BETWEEN -180 AND 180 OR p_latitude NOT BETWEEN -90 AND 90
    OR p_radius_m NOT BETWEEN 100 AND 100000 OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid discovery query' USING ERRCODE='22023';
  END IF;
  IF p_facility_type IS NOT NULL AND p_facility_type NOT IN ('clinic','pharmacy','hospital','laboratory') THEN
    RAISE EXCEPTION 'invalid facility type' USING ERRCODE='22023';
  END IF;
  IF p_longitude IS NOT NULL THEN
    query_point:=public.ST_SetSRID(public.ST_MakePoint(p_longitude,p_latitude),4326)::public.geography;
  END IF;
  RETURN QUERY
  WITH eligible AS (
    SELECT f.id,f.facility_type,f.name_ar,f.name_en,f.location,
      ARRAY(SELECT DISTINCT activity FROM identity.facility_licenses fl2,unnest(fl2.licensed_activities) activity
            WHERE fl2.facility_id=f.id AND fl2.status='verified' AND fl2.expires_on>=CURRENT_DATE
            ORDER BY activity) AS service_codes,
      CASE WHEN query_point IS NULL THEN NULL ELSE public.ST_Distance(f.location,query_point) END AS measured_distance,
      cp.signal,cp.emergency_available_count,cp.observed_at,cp.fresh_until
    FROM identity.facilities f
    LEFT JOIN hospital.capacity_projections cp ON cp.facility_id=f.id
    WHERE f.facility_status='active' AND f.location IS NOT NULL AND f.location_verified_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM identity.facility_licenses fl WHERE fl.facility_id=f.id AND fl.status='verified' AND fl.expires_on>=CURRENT_DATE)
      AND (p_facility_type IS NULL OR f.facility_type=p_facility_type)
      AND (p_service_code IS NULL OR EXISTS(
        SELECT 1 FROM identity.facility_licenses fl,unnest(fl.licensed_activities) activity
        WHERE fl.facility_id=f.id AND fl.status='verified' AND fl.expires_on>=CURRENT_DATE AND activity=p_service_code
      ))
      AND (p_area IS NULL OR f.governorate_code ILIKE p_area OR f.city ILIKE p_area OR f.district ILIKE p_area OR f.address_line ILIKE '%'||p_area||'%')
      AND (query_point IS NULL OR public.ST_DWithin(f.location,query_point,p_radius_m))
  )
  SELECT e.id,e.facility_type,e.name_ar,e.name_en,e.service_codes,
    public.ST_X(e.location::public.geometry),public.ST_Y(e.location::public.geometry),e.measured_distance,
    COALESCE(e.signal,'unknown'),
    platform.capacity_count_band(e.signal,e.emergency_available_count),
    CASE WHEN e.observed_at IS NULL OR e.fresh_until IS NULL THEN 'unknown'
         WHEN e.observed_at<=statement_timestamp() AND statement_timestamp()<=e.fresh_until THEN 'fresh'
         ELSE 'stale' END,
    e.observed_at,e.fresh_until
  FROM eligible e
  WHERE p_after_facility_id IS NULL
     OR (query_point IS NULL AND e.id>p_after_facility_id)
     OR (query_point IS NOT NULL AND (e.measured_distance>p_after_distance_m OR (e.measured_distance=p_after_distance_m AND e.id>p_after_facility_id)))
  ORDER BY e.measured_distance NULLS LAST,e.id
  LIMIT p_limit;
END $$;

CREATE OR REPLACE FUNCTION platform.get_discovery_facility(p_facility_id uuid)
RETURNS TABLE(
  facility_id uuid,facility_type text,name_ar text,name_en text,services text[],
  longitude double precision,latitude double precision,distance_m double precision,
  capacity_signal text,capacity_count_band text,capacity_freshness text,
  capacity_observed_at timestamptz,capacity_fresh_until timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT f.id,f.facility_type,f.name_ar,f.name_en,
    ARRAY(SELECT DISTINCT activity FROM identity.facility_licenses fl2,unnest(fl2.licensed_activities) activity
          WHERE fl2.facility_id=f.id AND fl2.status='verified' AND fl2.expires_on>=CURRENT_DATE
          ORDER BY activity),
    public.ST_X(f.location::public.geometry),public.ST_Y(f.location::public.geometry),NULL::double precision,
    COALESCE(cp.signal,'unknown'),platform.capacity_count_band(cp.signal,cp.emergency_available_count),
    CASE WHEN cp.observed_at IS NULL OR cp.fresh_until IS NULL THEN 'unknown'
         WHEN cp.observed_at<=statement_timestamp() AND statement_timestamp()<=cp.fresh_until THEN 'fresh'
         ELSE 'stale' END,
    cp.observed_at,cp.fresh_until
  FROM identity.facilities f
  LEFT JOIN hospital.capacity_projections cp ON cp.facility_id=f.id
  WHERE f.id=p_facility_id AND f.facility_status='active'
    AND f.location IS NOT NULL AND f.location_verified_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM identity.facility_licenses fl
      WHERE fl.facility_id=f.id AND fl.status='verified' AND fl.expires_on>=CURRENT_DATE)
$$;

CREATE OR REPLACE FUNCTION platform.get_discovery_capacity(p_facility_id uuid)
RETURNS TABLE(
  facility_id uuid,signal text,count_band text,freshness text,
  observed_at timestamptz,fresh_until timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT f.id,COALESCE(cp.signal,'unknown'),
    platform.capacity_count_band(cp.signal,cp.emergency_available_count),
    CASE WHEN cp.id IS NULL THEN 'unknown'
         WHEN cp.observed_at<=statement_timestamp() AND statement_timestamp()<=cp.fresh_until THEN 'fresh'
         ELSE 'stale' END,
    cp.observed_at,cp.fresh_until
  FROM identity.facilities f
  LEFT JOIN hospital.capacity_projections cp ON cp.facility_id=f.id
  WHERE f.id=p_facility_id AND f.facility_type='hospital' AND f.facility_status='active'
    AND f.location IS NOT NULL AND f.location_verified_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM identity.facility_licenses fl WHERE fl.facility_id=f.id AND fl.status='verified' AND fl.expires_on>=CURRENT_DATE)
$$;

CREATE OR REPLACE FUNCTION platform.find_sos_match(
  p_longitude double precision,p_latitude double precision,p_radius_m integer,p_allowed_source text,p_at timestamptz DEFAULT statement_timestamp()
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT f.id
  FROM identity.facilities f
  JOIN hospital.capacity_projections cp ON cp.facility_id=f.id
  WHERE p_allowed_source IS NOT NULL AND cp.source_code=p_allowed_source
    AND f.facility_type='hospital' AND f.facility_status='active'
    AND f.location IS NOT NULL AND f.location_verified_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM identity.facility_licenses fl WHERE fl.facility_id=f.id AND fl.status='verified' AND fl.expires_on>=CURRENT_DATE)
    AND cp.signal IN ('available','limited') AND cp.emergency_available_count>0
    AND cp.observed_at<=p_at AND p_at<=cp.fresh_until
    AND public.ST_DWithin(f.location,public.ST_SetSRID(public.ST_MakePoint(p_longitude,p_latitude),4326)::public.geography,p_radius_m)
  ORDER BY public.ST_Distance(f.location,public.ST_SetSRID(public.ST_MakePoint(p_longitude,p_latitude),4326)::public.geography),f.id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION platform.callback_source_is_verified(
  p_patient_id uuid,p_initiator_id uuid,p_callback_source text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(
    SELECT 1
    FROM identity.patients p
    JOIN identity.people patient_person ON patient_person.id=p.person_id
    JOIN identity.people initiator ON initiator.id=p_initiator_id
    JOIN identity.callback_contact_verifications verification
      ON verification.person_id=CASE p_callback_source
        WHEN 'patient_verified_contact' THEN patient_person.id
        WHEN 'initiator_verified_contact' THEN initiator.id
        ELSE NULL END
     AND verification.phone_e164=CASE p_callback_source
        WHEN 'patient_verified_contact' THEN patient_person.phone_e164
        WHEN 'initiator_verified_contact' THEN initiator.phone_e164
        ELSE NULL END
     AND verification.source_code='synthetic_seed'
     AND verification.verified_at<=statement_timestamp()
     AND (verification.valid_until IS NULL OR verification.valid_until>statement_timestamp())
     AND verification.revoked_at IS NULL
    WHERE p.id=p_patient_id
  )
$$;

CREATE OR REPLACE FUNCTION platform.create_sos_incident_record(
  p_incident_id uuid,p_patient_id uuid,p_longitude double precision,p_latitude double precision,
  p_reason_code text,p_contact_preference text,p_callback_source text,p_radius_m integer,p_allowed_source text
) RETURNS platform.sos_incidents
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE matched_id uuid; created platform.sos_incidents;
BEGIN
  IF platform.context_environment() NOT IN ('local','ci') OR NOT platform.feature_enabled('sos.activation',platform.context_environment()) THEN
    RAISE EXCEPTION 'SOS activation is disabled' USING ERRCODE='42501';
  END IF;
  IF p_patient_id IS DISTINCT FROM platform.context_patient_id()
    OR NOT platform.person_can_activate_sos(p_patient_id,platform.context_person_id()) THEN
    RAISE EXCEPTION 'current SOS activation authority required' USING ERRCODE='42501';
  END IF;
  IF p_longitude NOT BETWEEN -180 AND 180 OR p_latitude NOT BETWEEN -90 AND 90 OR p_radius_m NOT BETWEEN 100 AND 100000 THEN
    RAISE EXCEPTION 'invalid SOS coordinates or radius' USING ERRCODE='22023';
  END IF;
  IF NOT platform.callback_source_is_verified(p_patient_id,platform.context_person_id(),p_callback_source) THEN
    RAISE EXCEPTION 'current verified callback source required' USING ERRCODE='42501';
  END IF;
  matched_id:=platform.find_sos_match(p_longitude,p_latitude,p_radius_m,p_allowed_source,statement_timestamp());
  INSERT INTO platform.sos_incidents(
    id,patient_id,initiated_by_user_id,coordinates,coordinate_precision,qualifying_reason_code,
    contact_preference,callback_source,status,matched_facility_id
  ) VALUES(
    p_incident_id,p_patient_id,platform.context_person_id(),
    public.ST_SetSRID(public.ST_MakePoint(p_longitude,p_latitude),4326)::public.geography,'exact',p_reason_code,
    p_contact_preference,p_callback_source,CASE WHEN matched_id IS NULL THEN 'active_unmatched' ELSE 'matched' END,matched_id
  ) RETURNING * INTO created;
  RETURN created;
END $$;

CREATE OR REPLACE FUNCTION platform.accept_sos_prearrival(
  p_incident_id uuid,p_facility_id uuid,p_expected_version integer,p_note_code text
) RETURNS platform.sos_incidents
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE incident platform.sos_incidents; capacity hospital.capacity_projections;
BEGIN
  IF platform.context_environment() NOT IN ('local','ci')
    OR NOT platform.feature_enabled('sos.prearrival',platform.context_environment()) THEN
    RAISE EXCEPTION 'SOS pre-arrival is disabled' USING ERRCODE='42501';
  END IF;
  SELECT * INTO incident FROM platform.sos_incidents WHERE id=p_incident_id FOR UPDATE;
  IF incident.id IS NULL OR incident.status<>'matched' OR incident.matched_facility_id<>p_facility_id OR incident.version<>p_expected_version THEN
    RAISE EXCEPTION 'SOS incident version or matched state conflict' USING ERRCODE='40001';
  END IF;
  IF NOT platform.hospital_member_authorized(p_facility_id,platform.context_person_id(),true) THEN
    RAISE EXCEPTION 'current matched hospital AAL2 purpose required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO capacity FROM hospital.capacity_projections WHERE facility_id=p_facility_id FOR UPDATE;
  IF capacity.id IS NULL OR capacity.signal NOT IN ('available','limited') OR capacity.emergency_available_count<=0
    OR capacity.observed_at>statement_timestamp() OR capacity.fresh_until<statement_timestamp() THEN
    RAISE EXCEPTION 'capacity-stale' USING ERRCODE='40001';
  END IF;
  UPDATE platform.sos_incidents SET status='accepted',accepted_by_user_id=platform.context_person_id(),
    acceptance_note_code=p_note_code,accepted_at=statement_timestamp()
  WHERE id=p_incident_id RETURNING * INTO incident;
  RETURN incident;
END $$;

CREATE OR REPLACE FUNCTION platform.close_sos_incident(
  p_incident_id uuid,p_expected_version integer,p_outcome_code text
) RETURNS platform.sos_incidents
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE incident platform.sos_incidents; subject_allowed boolean; hospital_allowed boolean;
BEGIN
  SELECT * INTO incident FROM platform.sos_incidents WHERE id=p_incident_id FOR UPDATE;
  IF incident.id IS NULL OR incident.status='closed' OR incident.version<>p_expected_version THEN
    RAISE EXCEPTION 'SOS incident version or state conflict' USING ERRCODE='40001';
  END IF;
  subject_allowed:=incident.patient_id=platform.context_patient_id()
    AND platform.person_can_activate_sos(incident.patient_id,platform.context_person_id());
  hospital_allowed:=incident.matched_facility_id IS NOT NULL
    AND platform.hospital_member_authorized(incident.matched_facility_id,platform.context_person_id(),true);
  IF NOT subject_allowed AND NOT hospital_allowed THEN
    RAISE EXCEPTION 'current subject or matched hospital authority required' USING ERRCODE='42501';
  END IF;
  UPDATE platform.sos_incidents SET status='closed',closed_by_user_id=platform.context_person_id(),
    close_outcome_code=p_outcome_code,closed_at=statement_timestamp()
  WHERE id=p_incident_id RETURNING * INTO incident;
  RETURN incident;
END $$;

CREATE OR REPLACE FUNCTION platform.create_emergency_share_record(
  p_share_id uuid,p_incident_id uuid,p_token_digest bytea,p_scope_fields text[],p_expires_at timestamptz
) RETURNS platform.emergency_share_links
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE link platform.emergency_share_links;
BEGIN
  IF platform.context_environment() NOT IN ('local','ci') OR NOT platform.feature_enabled('sos.share',platform.context_environment()) THEN
    RAISE EXCEPTION 'emergency share is disabled' USING ERRCODE='42501';
  END IF;
  IF NOT platform.person_can_share_incident(p_incident_id,platform.context_person_id()) THEN
    RAISE EXCEPTION 'current independent SOS share authority required' USING ERRCODE='42501';
  END IF;
  INSERT INTO platform.emergency_share_links(id,incident_id,created_by_user_id,token_digest,scope_fields,expires_at)
  VALUES(p_share_id,p_incident_id,platform.context_person_id(),p_token_digest,p_scope_fields,p_expires_at)
  RETURNING * INTO link;
  RETURN link;
END $$;

CREATE OR REPLACE FUNCTION platform.revoke_emergency_share(
  p_share_id uuid,p_expected_version integer
) RETURNS platform.emergency_share_links
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE link platform.emergency_share_links;
BEGIN
  SELECT * INTO link FROM platform.emergency_share_links WHERE id=p_share_id FOR UPDATE;
  IF link.id IS NULL OR link.version<>p_expected_version OR link.used_at IS NOT NULL OR link.revoked_at IS NOT NULL
    OR NOT platform.person_can_revoke_share(p_share_id,platform.context_person_id()) THEN
    RAISE EXCEPTION 'emergency-share conflict or authority missing' USING ERRCODE='40001';
  END IF;
  UPDATE platform.emergency_share_links SET revoked_at=statement_timestamp(),revoked_by_user_id=platform.context_person_id()
  WHERE id=p_share_id RETURNING * INTO link;
  RETURN link;
END $$;

CREATE OR REPLACE FUNCTION platform.consume_emergency_share(
  p_token_digest bytea,p_request_id uuid
) RETURNS TABLE(
  outcome text,denial_code text,share_id uuid,incident_id uuid,expires_at timestamptz,
  scope_fields text[],blood_group text,unavailable_fields text[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE link platform.emergency_share_links; incident platform.sos_incidents; patient_blood text; available text[]:=ARRAY[]::text[]; unavailable text[];
BEGIN
  IF platform.context_environment() NOT IN ('local','ci')
    OR NOT platform.feature_enabled('sos.share',platform.context_environment()) THEN
    INSERT INTO audit.events(event_hash,action,resource_type,resource_id,outcome,request_id,metadata)
    VALUES(encode(public.digest('sos.share.view.disabled:'||p_request_id::text,'sha256'),'hex'),'sos.share.view','emergency-share',NULL,'denied',p_request_id,'{"reason_code":"share-disabled"}'::jsonb);
    RETURN QUERY SELECT 'denied'::text,'emergency-share-expired'::text,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::text[],NULL::text,NULL::text[];
    RETURN;
  END IF;
  IF octet_length(p_token_digest)=32 THEN
    SELECT * INTO link FROM platform.emergency_share_links l WHERE l.token_digest=p_token_digest FOR UPDATE;
  END IF;
  IF link.id IS NULL OR link.used_at IS NOT NULL OR link.revoked_at IS NOT NULL OR link.expires_at<=statement_timestamp() THEN
    INSERT INTO audit.events(event_hash,action,resource_type,resource_id,outcome,request_id,metadata)
    VALUES(encode(public.digest('sos.share.view.denied:'||p_request_id::text,'sha256'),'hex'),'sos.share.view','emergency-share',NULL,'denied',p_request_id,'{"reason_code":"emergency-share-expired"}'::jsonb);
    RETURN QUERY SELECT 'denied'::text,'emergency-share-expired'::text,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::text[],NULL::text,NULL::text[];
    RETURN;
  END IF;
  SELECT * INTO incident FROM platform.sos_incidents WHERE id=link.incident_id;
  IF incident.id IS NULL OR incident.status='closed' THEN
    INSERT INTO audit.events(event_hash,patient_id,action,resource_type,resource_id,outcome,request_id,metadata)
    VALUES(encode(public.digest('sos.share.view.closed:'||p_request_id::text,'sha256'),'hex'),incident.patient_id,'sos.share.view','emergency-share',link.id,'denied',p_request_id,'{"reason_code":"incident-closed"}'::jsonb);
    RETURN QUERY SELECT 'denied'::text,'emergency-share-expired'::text,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::text[],NULL::text,NULL::text[];
    RETURN;
  END IF;
  SELECT p.blood_group INTO patient_blood FROM identity.patients p WHERE p.id=incident.patient_id;
  IF 'blood_group'=ANY(link.scope_fields) AND patient_blood IS NOT NULL THEN available:=ARRAY['blood_group']; END IF;
  SELECT ARRAY(SELECT field FROM unnest(link.scope_fields) field WHERE NOT field=ANY(available) ORDER BY field) INTO unavailable;
  UPDATE platform.emergency_share_links SET access_count=1,used_at=statement_timestamp() WHERE id=link.id;
  INSERT INTO audit.events(event_hash,patient_id,action,resource_type,resource_id,outcome,request_id,metadata)
  VALUES(encode(public.digest('sos.share.view.success:'||link.id::text||':'||p_request_id::text,'sha256'),'hex'),incident.patient_id,'sos.share.view','emergency-share',link.id,'success',p_request_id,jsonb_build_object('scope_fields',link.scope_fields,'unavailable_fields',unavailable));
  RETURN QUERY SELECT 'success'::text,NULL::text,link.id,link.incident_id,link.expires_at,link.scope_fields,
    CASE WHEN 'blood_group'=ANY(available) THEN patient_blood ELSE NULL END,unavailable;
END $$;

CREATE OR REPLACE FUNCTION platform.sos_contact_delivery_candidates(p_incident_id uuid)
RETURNS TABLE(
  contact_id uuid,patient_id uuid,patient_display_name text,preferred_locale text,
  location_precision text,location_value text,incident_time timestamptz,callback_number text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT c.id,i.patient_id,patient_person.display_name,c.preferred_locale,c.location_precision,
    CASE c.location_precision
      WHEN 'coarse' THEN round(public.ST_Y(i.coordinates::public.geometry)::numeric,2)::text||','||round(public.ST_X(i.coordinates::public.geometry)::numeric,2)::text
      WHEN 'exact' THEN round(public.ST_Y(i.coordinates::public.geometry)::numeric,6)::text||','||round(public.ST_X(i.coordinates::public.geometry)::numeric,6)::text
      ELSE NULL
    END,
    i.initiated_at,
    CASE i.callback_source WHEN 'patient_verified_contact' THEN patient_person.phone_e164 ELSE initiator.phone_e164 END
  FROM platform.sos_incidents i
  JOIN identity.patients p ON p.id=i.patient_id
  JOIN identity.people patient_person ON patient_person.id=p.person_id
  JOIN identity.people initiator ON initiator.id=i.initiated_by_user_id
  JOIN identity.emergency_contacts c ON c.subject_patient_id=i.patient_id
  JOIN identity.callback_contact_verifications callback_verification
    ON callback_verification.person_id=CASE i.callback_source
      WHEN 'patient_verified_contact' THEN patient_person.id ELSE initiator.id END
   AND callback_verification.phone_e164=CASE i.callback_source
      WHEN 'patient_verified_contact' THEN patient_person.phone_e164 ELSE initiator.phone_e164 END
   AND callback_verification.source_code='synthetic_seed'
   AND callback_verification.verified_at<=statement_timestamp()
   AND (callback_verification.valid_until IS NULL OR callback_verification.valid_until>statement_timestamp())
   AND callback_verification.revoked_at IS NULL
  WHERE platform.context_environment() IN ('local','ci')
    AND platform.feature_enabled('sos.contact_delivery',platform.context_environment())
    AND i.id=p_incident_id AND i.status IN ('active_unmatched','matched','accepted')
    AND i.contact_preference='all_confirmed' AND c.status='confirmed'
    AND platform.processing_inventory_active('sos-life-safety-synthetic')
$$;

CREATE OR REPLACE FUNCTION platform.sos_contact_delivery_status(p_incident_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  incident platform.sos_incidents;
  contact_event platform.outbox_events;
  notification_count integer;
  delivered_count integer;
  failed_count integer;
BEGIN
  SELECT * INTO incident FROM platform.sos_incidents i WHERE i.id=p_incident_id;
  IF incident.id IS NULL
    OR incident.patient_id IS DISTINCT FROM platform.context_patient_id()
    OR NOT platform.person_can_activate_sos(incident.patient_id,platform.context_person_id()) THEN
    RAISE EXCEPTION 'current SOS subject authority required' USING ERRCODE='42501';
  END IF;
  IF incident.contact_preference='none' THEN RETURN 'not_requested'; END IF;

  SELECT * INTO contact_event
  FROM platform.outbox_events e
  WHERE e.event_type='sos.emergency_contact.requested' AND e.aggregate_id=p_incident_id
  ORDER BY e.created_at DESC,e.id DESC
  LIMIT 1;
  IF contact_event.id IS NULL THEN RETURN 'pending'; END IF;

  SELECT count(*)::integer,
    count(*) FILTER (WHERE n.status='delivered')::integer,
    count(*) FILTER (WHERE n.status IN ('failed','dead_letter'))::integer
  INTO notification_count,delivered_count,failed_count
  FROM platform.notifications n
  WHERE n.source_event_id=contact_event.id AND n.recipient_type='emergency_contact';

  IF contact_event.state='dead_letter' THEN RETURN 'failed'; END IF;
  IF contact_event.state='delivered' THEN
    IF notification_count>0 AND delivered_count=notification_count THEN RETURN 'delivered'; END IF;
    RETURN 'failed';
  END IF;
  IF failed_count>0 OR contact_event.attempt_count>1 THEN RETURN 'delayed'; END IF;
  RETURN 'pending';
END $$;

CREATE OR REPLACE FUNCTION platform.claim_next_sos_contact_event(
  p_worker_id text,p_lease_seconds integer DEFAULT 30
) RETURNS TABLE(
  event_id uuid,incident_id uuid,aggregate_version integer,payload jsonb,attempt_count integer,lease_expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 3 AND 96 OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'invalid SOS worker lease request' USING ERRCODE='22023';
  END IF;
  IF platform.context_environment() NOT IN ('local','ci')
    OR NOT platform.feature_enabled('sos.contact_delivery',platform.context_environment()) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT e.id
    FROM platform.outbox_events e
    WHERE e.event_type='sos.emergency_contact.requested'
      AND e.available_at<=statement_timestamp()
      AND (
        e.state='pending'
        OR (e.state='processing' AND e.lease_expires_at IS NOT NULL AND e.lease_expires_at<=statement_timestamp())
      )
    ORDER BY e.available_at,e.created_at,e.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE platform.outbox_events e
    SET state='processing',attempt_count=e.attempt_count+1,lease_owner=p_worker_id,
      lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=statement_timestamp()
    FROM candidate c
    WHERE e.id=c.id
    RETURNING e.id,e.aggregate_id,e.aggregate_version,e.payload,e.attempt_count,e.lease_expires_at
  )
  SELECT c.id,c.aggregate_id,c.aggregate_version,c.payload,c.attempt_count,c.lease_expires_at FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION platform.complete_sos_contact_event(
  p_event_id uuid,p_worker_id text,p_outcome text,p_safe_error_code text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE next_state text; changed integer;
BEGIN
  IF p_outcome NOT IN ('delivered','retry','dead_letter') THEN
    RAISE EXCEPTION 'invalid SOS worker completion outcome' USING ERRCODE='22023';
  END IF;
  IF p_outcome='retry' AND (p_retry_at IS NULL OR p_retry_at<=statement_timestamp()) THEN
    RAISE EXCEPTION 'retry requires a future availability time' USING ERRCODE='22023';
  END IF;
  next_state:=CASE p_outcome WHEN 'delivered' THEN 'delivered' WHEN 'retry' THEN 'pending' ELSE 'dead_letter' END;
  UPDATE platform.outbox_events
  SET state=next_state,available_at=COALESCE(p_retry_at,available_at),last_error_code=p_safe_error_code,
    lease_owner=NULL,lease_expires_at=NULL,updated_at=statement_timestamp()
  WHERE id=p_event_id AND event_type='sos.emergency_contact.requested' AND state='processing'
    AND lease_owner=p_worker_id AND lease_expires_at>statement_timestamp();
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=1 AND p_outcome IN ('delivered','dead_letter') THEN
    INSERT INTO platform.event_receipts(event_id,consumer,result_code)
    VALUES(p_event_id,'discovery-sos-contact-worker',p_outcome)
    ON CONFLICT(event_id,consumer) DO NOTHING;
  END IF;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION platform.deliver_local_synthetic_message(
  p_provider_key text,p_destination_alias_digest text,p_rendered_digest text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt platform.synthetic_message_receipts;
BEGIN
  IF platform.context_environment() NOT IN ('local','ci')
    OR NOT platform.feature_enabled('sos.contact_delivery',platform.context_environment()) THEN
    RAISE EXCEPTION 'local synthetic messaging is disabled' USING ERRCODE='42501';
  END IF;
  IF p_provider_key !~ '^[a-f0-9]{64}$'
    OR p_destination_alias_digest !~ '^[a-f0-9]{64}$'
    OR p_rendered_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid synthetic message digest' USING ERRCODE='22023';
  END IF;
  INSERT INTO platform.synthetic_message_receipts(
    provider_idempotency_key,destination_alias_digest,rendered_digest
  ) VALUES(p_provider_key,p_destination_alias_digest,p_rendered_digest)
  ON CONFLICT(provider_idempotency_key) DO NOTHING;
  SELECT * INTO receipt FROM platform.synthetic_message_receipts
  WHERE provider_idempotency_key=p_provider_key;
  IF receipt.destination_alias_digest<>p_destination_alias_digest
    OR receipt.rendered_digest<>p_rendered_digest THEN
    RAISE EXCEPTION 'synthetic provider dedup payload mismatch' USING ERRCODE='23505';
  END IF;
  RETURN 'synthetic-receipt-'||substr(encode(public.digest(p_provider_key,'sha256'),'hex'),1,16);
END $$;

REVOKE ALL ON FUNCTION platform.context_patient_id(),platform.context_environment(),platform.text_array_is_unique(text[]),
  platform.capacity_count_band(text,integer),
  platform.feature_enabled(text,text),platform.person_can_activate_sos(uuid,uuid),platform.person_can_share_sos(uuid,uuid),
  platform.person_can_share_incident(uuid,uuid),platform.person_can_revoke_share(uuid,uuid),platform.hospital_member_authorized(uuid,uuid,boolean),
  platform.search_discovery_facilities(double precision,double precision,integer,text,text,text,double precision,uuid,integer),
  platform.get_discovery_facility(uuid),
  platform.get_discovery_capacity(uuid),platform.find_sos_match(double precision,double precision,integer,text,timestamptz),
  platform.callback_source_is_verified(uuid,uuid,text),
  platform.create_sos_incident_record(uuid,uuid,double precision,double precision,text,text,text,integer,text),
  platform.accept_sos_prearrival(uuid,uuid,integer,text),platform.close_sos_incident(uuid,integer,text),
  platform.create_emergency_share_record(uuid,uuid,bytea,text[],timestamptz),platform.revoke_emergency_share(uuid,integer),
  platform.consume_emergency_share(bytea,uuid),platform.sos_contact_delivery_candidates(uuid),
  platform.sos_contact_delivery_status(uuid),platform.claim_next_sos_contact_event(text,integer),
  platform.complete_sos_contact_event(uuid,text,text,text,timestamptz),
  platform.deliver_local_synthetic_message(text,text,text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.context_patient_id(),platform.context_environment(),platform.feature_enabled(text,text),
  platform.person_can_activate_sos(uuid,uuid),platform.person_can_share_sos(uuid,uuid),platform.person_can_share_incident(uuid,uuid),
  platform.person_can_revoke_share(uuid,uuid),platform.hospital_member_authorized(uuid,uuid,boolean),
  platform.search_discovery_facilities(double precision,double precision,integer,text,text,text,double precision,uuid,integer),
  platform.get_discovery_facility(uuid),
  platform.get_discovery_capacity(uuid),platform.find_sos_match(double precision,double precision,integer,text,timestamptz),
  platform.create_sos_incident_record(uuid,uuid,double precision,double precision,text,text,text,integer,text),
  platform.accept_sos_prearrival(uuid,uuid,integer,text),platform.close_sos_incident(uuid,integer,text),
  platform.create_emergency_share_record(uuid,uuid,bytea,text[],timestamptz),platform.revoke_emergency_share(uuid,integer),
  platform.consume_emergency_share(bytea,uuid),platform.sos_contact_delivery_status(uuid)
TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.feature_enabled(text,text),platform.sos_contact_delivery_candidates(uuid),
  platform.claim_next_sos_contact_event(text,integer),platform.complete_sos_contact_event(uuid,text,text,text,timestamptz),
  platform.deliver_local_synthetic_message(text,text,text)
TO shifaa_worker;

GRANT USAGE ON SCHEMA hospital TO shifaa_api;
GRANT SELECT ON platform.sos_incidents,platform.emergency_share_links TO shifaa_api;
REVOKE INSERT,UPDATE,DELETE ON platform.sos_incidents,platform.emergency_share_links FROM PUBLIC,shifaa_api;
REVOKE ALL ON hospital.capacity_projections,platform.feature_flags FROM PUBLIC,shifaa_api,shifaa_worker;
REVOKE ALL ON identity.callback_contact_verifications FROM PUBLIC,shifaa_api,shifaa_worker;

ALTER TABLE identity.callback_contact_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.callback_contact_verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE hospital.capacity_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital.capacity_projections FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.feature_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.sos_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.sos_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.emergency_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.emergency_share_links FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.synthetic_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.synthetic_message_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON platform.synthetic_message_receipts FROM PUBLIC,shifaa_api,shifaa_worker;

CREATE POLICY sos_incident_subject_or_hospital_select ON platform.sos_incidents FOR SELECT TO shifaa_api USING (
  (patient_id=platform.context_patient_id()
   AND platform.context_role()='PAT'
   AND platform.person_can_activate_sos(patient_id,platform.context_person_id()))
  OR (matched_facility_id IS NOT NULL
      AND platform.context_environment() IN ('local','ci')
      AND platform.feature_enabled('sos.prearrival',platform.context_environment())
      AND platform.hospital_member_authorized(matched_facility_id,platform.context_person_id(),false))
);
CREATE POLICY emergency_share_authorized_select ON platform.emergency_share_links FOR SELECT TO shifaa_api USING (
  platform.person_can_revoke_share(id,platform.context_person_id())
);

DROP POLICY IF EXISTS outbox_worker_select ON platform.outbox_events;
CREATE POLICY outbox_worker_select ON platform.outbox_events FOR SELECT TO shifaa_worker USING (
  event_type IN ('privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested','sos.emergency_contact.requested')
);
DROP POLICY IF EXISTS outbox_worker_lease_update ON platform.outbox_events;
CREATE POLICY outbox_worker_lease_update ON platform.outbox_events FOR UPDATE TO shifaa_worker
USING (event_type IN ('privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested','sos.emergency_contact.requested'))
WITH CHECK (event_type IN ('privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested','sos.emergency_contact.requested'));

COMMENT ON COLUMN identity.facilities.location IS 'Verified WGS84 facility point; public search points are never stored';
COMMENT ON COLUMN identity.patients.blood_group IS 'Canonical nullable blood group; 006 seeds synthetic evidence only';
COMMENT ON TABLE identity.callback_contact_verifications IS 'Seeded-synthetic callback verification evidence only; production verification remains gated';
COMMENT ON TABLE hospital.capacity_projections IS 'Aggregate synthetic capacity projection; no patient, ward, bed, or clinical detail';
COMMENT ON TABLE platform.sos_incidents IS 'retention_class=SOS_LOCATION; no statutory duration asserted under OPEN-LEGAL-002';
COMMENT ON TABLE platform.emergency_share_links IS 'One-use emergency capability; digest only, no plaintext bearer';
COMMENT ON TABLE platform.feature_flags IS 'Environment-scoped feature gates; production 006 capabilities remain disabled';

-- Deterministic seeded-synthetic actors and patient. No real identity, contact, location, or clinical data.
INSERT INTO identity.people(id,user_id,display_name,nationality_code,preferred_locale,phone_e164,profile_status) VALUES
 ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-9000-000000000001','Synthetic SOS Patient','EG','ar-EG','+999600000001','active'),
 ('60000000-0000-4000-8000-000000000002','60000000-0000-4000-9000-000000000002','Synthetic SOS Guardian','EG','ar-EG','+999600000002','active'),
 ('60000000-0000-4000-8000-000000000003','60000000-0000-4000-9000-000000000003','Synthetic SOS Activate Delegate','EG','en-EG','+999600000003','active'),
 ('60000000-0000-4000-8000-000000000004','60000000-0000-4000-9000-000000000004','Synthetic SOS Share Delegate','EG','en-EG','+999600000004','active'),
 ('60000000-0000-4000-8000-000000000005','60000000-0000-4000-9000-000000000005','Synthetic Record Only Delegate','EG','en-EG','+999600000005','active'),
 ('60000000-0000-4000-8000-000000000006','60000000-0000-4000-9000-000000000006','Synthetic SOS Unrelated','EG','en-EG','+999600000006','active'),
 ('60000000-0000-4000-8000-000000000007','60000000-0000-4000-9000-000000000007','Synthetic Hospital A Owner','EG','ar-EG','+999600000007','active'),
 ('60000000-0000-4000-8000-000000000008','60000000-0000-4000-9000-000000000008','Synthetic Hospital B Owner','EG','en-EG','+999600000008','active'),
 ('60000000-0000-4000-8000-000000000009','60000000-0000-4000-9000-000000000009','Synthetic Facility Seed Owner','EG','ar-EG','+999600000009','active')
ON CONFLICT(id) DO NOTHING;
ALTER TABLE identity.callback_contact_verifications NO FORCE ROW LEVEL SECURITY;
INSERT INTO identity.callback_contact_verifications(
  person_id,phone_e164,source_code,verified_at,valid_until
) VALUES
 ('60000000-0000-4000-8000-000000000001','+999600000001','synthetic_seed','2026-08-20T00:00:00Z','2099-01-01T00:00:00Z'),
 ('60000000-0000-4000-8000-000000000002','+999600000002','synthetic_seed','2026-08-20T00:00:00Z','2099-01-01T00:00:00Z'),
 ('60000000-0000-4000-8000-000000000003','+999600000003','synthetic_seed','2026-08-20T00:00:00Z','2099-01-01T00:00:00Z'),
 ('60000000-0000-4000-8000-000000000004','+999600000004','synthetic_seed','2026-08-20T00:00:00Z','2099-01-01T00:00:00Z'),
 ('60000000-0000-4000-8000-000000000005','+999600000005','synthetic_seed','2026-08-20T00:00:00Z','2099-01-01T00:00:00Z'),
 ('60000000-0000-4000-8000-000000000006','+999600000006','synthetic_seed','2026-08-20T00:00:00Z','2099-01-01T00:00:00Z'),
 ('60000000-0000-4000-8000-000000000007','+999600000007','synthetic_seed','2026-08-20T00:00:00Z','2099-01-01T00:00:00Z'),
 ('60000000-0000-4000-8000-000000000008','+999600000008','synthetic_seed','2026-08-20T00:00:00Z','2099-01-01T00:00:00Z'),
 ('60000000-0000-4000-8000-000000000009','+999600000009','synthetic_seed','2026-08-20T00:00:00Z','2099-01-01T00:00:00Z')
ON CONFLICT(person_id) DO UPDATE SET
  phone_e164=EXCLUDED.phone_e164,source_code=EXCLUDED.source_code,
  verified_at=EXCLUDED.verified_at,valid_until=EXCLUDED.valid_until,revoked_at=NULL,
  version=identity.callback_contact_verifications.version+1,updated_at=statement_timestamp();
ALTER TABLE identity.callback_contact_verifications FORCE ROW LEVEL SECURITY;
INSERT INTO identity.patients(id,person_id,medical_record_number,blood_group) VALUES
 ('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','SYN-SOS-006-001','O+'),
 ('61000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000006','SYN-SOS-006-002',NULL)
ON CONFLICT(id) DO UPDATE SET blood_group=EXCLUDED.blood_group;
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id) VALUES
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','self','active','2026-01-01T00:00:00Z','60000000-0000-4000-8000-000000000001'),
 ('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000006','self','active','2026-01-01T00:00:00Z','60000000-0000-4000-8000-000000000006')
ON CONFLICT(id) DO NOTHING;

INSERT INTO identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status,released_at) VALUES
 ('62000000-0000-4000-8000-000000000010','guardianship-evidence','synthetic/sos-006/guardian/released','60000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001',repeat('6',64),'application/pdf',1024,'released','2026-08-20T00:00:00Z')
ON CONFLICT(id) DO NOTHING;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000002',true);
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,purpose_code,created_by_person_id,evidence_object_id) VALUES
 ('62000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','guardianship','pending','2026-08-20T00:00:00Z','emergency_care','60000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000010')
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) VALUES
 ('62000000-0000-4000-8000-000000000003','sos.activate','60000000-0000-4000-8000-000000000002'),
 ('62000000-0000-4000-8000-000000000003','sos.share','60000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;
SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000006',true);
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','guardianship_review',true);
UPDATE identity.care_relationships SET status='active',valid_until='2099-01-01T00:00:00Z',
  reviewed_by_person_id='40000000-0000-4000-8000-000000000006',reviewed_at=statement_timestamp(),decision_reason_code='synthetic.sos_006.approved'
WHERE id='62000000-0000-4000-8000-000000000003' AND status='pending';

-- Create and accept three independent delegations through the existing guarded lifecycle.
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000001',true);
SELECT set_config('shifaa.actor_role','PAT',true);
SELECT set_config('shifaa.aal','1',true);
SELECT set_config('shifaa.purposes','emergency_care',true);
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,valid_until,purpose_code,created_by_person_id,invite_token_digest,invite_key_version,invite_expires_at) VALUES
 ('62000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','delegation','pending',statement_timestamp(),'2099-01-01T00:00:00Z','emergency_care','60000000-0000-4000-8000-000000000001',decode(repeat('63',32),'hex'),1,statement_timestamp()+interval '1 day'),
 ('62000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000004','delegation','pending',statement_timestamp(),'2099-01-01T00:00:00Z','emergency_care','60000000-0000-4000-8000-000000000001',decode(repeat('64',32),'hex'),1,statement_timestamp()+interval '1 day'),
 ('62000000-0000-4000-8000-000000000006','61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000005','delegation','pending',statement_timestamp(),'2099-01-01T00:00:00Z','emergency_care','60000000-0000-4000-8000-000000000001',decode(repeat('65',32),'hex'),1,statement_timestamp()+interval '1 day')
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) VALUES
 ('62000000-0000-4000-8000-000000000004','sos.activate','60000000-0000-4000-8000-000000000001'),
 ('62000000-0000-4000-8000-000000000005','sos.share','60000000-0000-4000-8000-000000000001'),
 ('62000000-0000-4000-8000-000000000006','record.view','60000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000003',true);
UPDATE identity.care_relationships SET status='active',invite_token_digest=NULL,invite_expires_at=NULL,invite_consumed_at=statement_timestamp() WHERE id='62000000-0000-4000-8000-000000000004' AND status='pending';
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000004',true);
UPDATE identity.care_relationships SET status='active',invite_token_digest=NULL,invite_expires_at=NULL,invite_consumed_at=statement_timestamp() WHERE id='62000000-0000-4000-8000-000000000005' AND status='pending';
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000005',true);
UPDATE identity.care_relationships SET status='active',invite_token_digest=NULL,invite_expires_at=NULL,invite_consumed_at=statement_timestamp() WHERE id='62000000-0000-4000-8000-000000000006' AND status='pending';

-- Seed one confirmed Emergency Contact via the existing separate-consent lifecycle.
SELECT set_config('shifaa.person_id','60000000-0000-4000-8000-000000000001',true);
INSERT INTO identity.emergency_contacts(
  id,subject_patient_id,created_by_person_id,display_name_ciphertext,display_name_nonce,display_name_authentication_tag,display_name_key_version,
  phone_ciphertext,phone_nonce,phone_authentication_tag,phone_key_version,masked_phone,phone_blind_index,preferred_locale,location_precision,
  status,invite_token_digest,invite_key_version,invite_expires_at
) VALUES(
  '66000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
  decode('0601','hex'),decode(repeat('61',12),'hex'),decode(repeat('62',16),'hex'),1,
  decode('0602','hex'),decode(repeat('63',12),'hex'),decode(repeat('64',16),'hex'),1,
  '+999••••0601',decode(repeat('66',32),'hex'),'ar-EG','coarse','pending',decode(repeat('67',32),'hex'),1,statement_timestamp()+interval '1 day'
) ON CONFLICT(id) DO NOTHING;
SELECT * FROM platform.respond_emergency_contact_invite(decode(repeat('67',32),'hex'),'confirmed');

-- Discoverable facility/license/capacity fixtures are transaction-scoped in the 006
-- SQL/E2E harness so the exact-count 003 governance regressions remain unchanged.
SELECT set_config('shifaa.person_id','',true); SELECT set_config('shifaa.actor_role','',true); SELECT set_config('shifaa.aal','',true); SELECT set_config('shifaa.purposes','',true); SELECT set_config('shifaa.patient_context','',true);

INSERT INTO platform.feature_flags(code,environment,enabled,constraints,approved_by_person_id) VALUES
 ('discovery.ui','local',true,'{"synthetic_only":true,"default_radius_m":25000,"maximum_radius_m":100000}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('sos.activation','local',true,'{"synthetic_only":true,"match_radius_m":25000,"allowed_capacity_source":"synthetic_seed"}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('sos.prearrival','local',true,'{"synthetic_only":true}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('sos.share','local',true,'{"synthetic_only":true,"maximum_expiry_minutes":30,"access_limit":1}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('sos.contact_delivery','local',true,'{"synthetic_only":true,"adapter":"local-synthetic"}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('discovery.ui','ci',true,'{"synthetic_only":true,"default_radius_m":25000,"maximum_radius_m":100000}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('sos.activation','ci',true,'{"synthetic_only":true,"match_radius_m":25000,"allowed_capacity_source":"synthetic_seed"}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('sos.prearrival','ci',true,'{"synthetic_only":true}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('sos.share','ci',true,'{"synthetic_only":true,"maximum_expiry_minutes":30,"access_limit":1}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('sos.contact_delivery','ci',true,'{"synthetic_only":true,"adapter":"local-synthetic"}'::jsonb,'50000000-0000-4000-8000-000000000010'),
 ('discovery.ui','production',false,'{"reason":"OPEN gates remain unresolved"}'::jsonb,NULL),
 ('sos.activation','production',false,'{"reason":"OPEN gates remain unresolved"}'::jsonb,NULL),
 ('sos.prearrival','production',false,'{"reason":"OPEN gates remain unresolved"}'::jsonb,NULL),
 ('sos.share','production',false,'{"reason":"OPEN gates remain unresolved"}'::jsonb,NULL),
 ('sos.contact_delivery','production',false,'{"reason":"OPEN-VENDOR-002"}'::jsonb,NULL)
ON CONFLICT(code,environment) DO UPDATE SET enabled=EXCLUDED.enabled,constraints=EXCLUDED.constraints,approved_by_person_id=EXCLUDED.approved_by_person_id,version=platform.feature_flags.version+1,updated_at=statement_timestamp();

INSERT INTO consent.processing_inventory(process_code,owner_name,controller_name,purposes,data_categories,systems,recipients,countries,retention_class,lawful_basis,approval_digest,status) VALUES
 ('discovery-geospatial-synthetic','SHIFAA Product Owner','SHIFAA synthetic environment',ARRAY['facility_discovery'],ARRAY['transient_query_coordinate','verified_facility_projection'],ARRAY['local-api','local-postgis'],ARRAY['public-minimum-projection'],ARRAY['EG'],'TRANSIENT_TECHNICAL','synthetic-engineering-only',repeat('6',64),'active'),
 ('sos-life-safety-synthetic','SHIFAA Product Owner','SHIFAA synthetic environment',ARRAY['sos_activation','emergency_contact_notification','emergency_share'],ARRAY['SOS_LOCATION','minimum-emergency-fields'],ARRAY['local-api','local-worker','local-postgis'],ARRAY['subject','matched-hospital','confirmed-emergency-contact','one-use-share-holder'],ARRAY['EG'],'SOS_LOCATION','synthetic-engineering-only',repeat('7',64),'active')
ON CONFLICT(process_code) DO UPDATE SET status='active',updated_at=statement_timestamp();

-- Publish one paired synthetic-only life-safety template through the existing independent workflow.
ALTER TABLE platform.notification_template_releases NO FORCE ROW LEVEL SECURITY;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000008',true);
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT set_config('shifaa.aal','1',true);
SELECT set_config('shifaa.purposes','notification.template.manage',true);
INSERT INTO platform.notification_template_releases(
 id,template_code,release_version,channel,arabic_body,english_body,allowed_recipient_types,
 allowed_field_schema,placeholder_names,content_digest,status,created_by_person_id
) VALUES(
 '64000000-0000-4000-8000-000000000001','SOS_LIFE_SAFETY',1,'sms',
 '{{patient_display_name}} يحتاج إلى مساعدة عاجلة. الوقت {{incident_time}}. رقم التواصل {{callback_number}}. {{location}} {{location_precision}}',
 '{{patient_display_name}} needs urgent help. Time {{incident_time}}. Callback {{callback_number}}. {{location}} {{location_precision}}',
 ARRAY['emergency_contact'],
 '{"type":"object","additionalProperties":false,"properties":{"patient_display_name":{"type":"string"},"incident_time":{"type":"string"},"callback_number":{"type":"string"},"location":{"type":"string"},"location_precision":{"type":"string"}},"required":["patient_display_name","incident_time","callback_number"]}'::jsonb,
 ARRAY['patient_display_name','incident_time','callback_number','location','location_precision'],
 encode(digest('SOS_LIFE_SAFETY-v1-seeded-synthetic','sha256'),'hex'),'draft','50000000-0000-4000-8000-000000000008'
) ON CONFLICT(id) DO NOTHING;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000009',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','notification.template.publish',true);
UPDATE platform.notification_template_releases
SET status='published',published_by_person_id='50000000-0000-4000-8000-000000000009',effective_at=statement_timestamp()
WHERE id='64000000-0000-4000-8000-000000000001' AND status='draft';
ALTER TABLE platform.notification_template_releases FORCE ROW LEVEL SECURITY;

SELECT set_config('shifaa.person_id','',true); SELECT set_config('shifaa.actor_role','',true); SELECT set_config('shifaa.aal','',true); SELECT set_config('shifaa.purposes','',true); SELECT set_config('shifaa.patient_context','',true); SELECT set_config('shifaa.environment','',true);

ANALYZE identity.facilities;
ANALYZE identity.facility_licenses;
ANALYZE identity.callback_contact_verifications;
ANALYZE hospital.capacity_projections;
ANALYZE platform.sos_incidents;
ANALYZE platform.emergency_share_links;
ANALYZE platform.synthetic_message_receipts;

COMMIT;
