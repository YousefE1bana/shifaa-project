-- F012 A-DB rank zero and producer generations. This migration provisions no
-- deployment, scope, source row or online operation. T013 wires actual writers.
BEGIN;

-- Inspect only the singleton admission tuple and the calling backend's actual
-- heavyweight transaction IDs. The application receives no extension grant.
CREATE EXTENSION pgrowlocks WITH SCHEMA platform VERSION '1.2';
REVOKE ALL ON FUNCTION platform.pgrowlocks(text) FROM PUBLIC, shifaa_api;

CREATE TABLE platform.f012_source_admission (
  deployment_id uuid PRIMARY KEY,
  admission_epoch uuid NOT NULL,
  UNIQUE (deployment_id, admission_epoch)
);

-- One database serves one isolated deployment; a second ID never aliases it.
CREATE UNIQUE INDEX f012_source_admission_single_deployment
  ON platform.f012_source_admission ((true));

CREATE TABLE clinical.safety_source_generations (
  deployment_id uuid NOT NULL,
  admission_epoch uuid NOT NULL,
  producer_key text NOT NULL,
  scope_key text NOT NULL,
  contract_version text NOT NULL CHECK (contract_version = '1'),
  generation bigint NOT NULL CHECK (generation > 0),
  PRIMARY KEY (deployment_id, admission_epoch, producer_key, scope_key, contract_version),
  FOREIGN KEY (deployment_id, admission_epoch)
    REFERENCES platform.f012_source_admission (deployment_id, admission_epoch),
  CHECK (
    (producer_key IN ('f011_content_status', 'f012_reviewer_roster', 'f012_projection_policy')
      AND scope_key = 'deployment')
    OR (producer_key IN ('f011_allergy', 'f012_prescribed_statements', 'f012_subject_projection')
      AND scope_key ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
  )
);

ALTER TABLE platform.f012_source_admission ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.f012_source_admission FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.safety_source_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.safety_source_generations FORCE ROW LEVEL SECURITY;

-- A narrow implementation principal, distinct from the F011 and NAC-1
-- executors. The API role has neither membership nor direct table access.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'shifaa_f012_fence_executor') THEN
    CREATE ROLE shifaa_f012_fence_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = 'shifaa_f012_fence_executor'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit
        OR rolreplication OR rolbypassrls)
  ) OR EXISTS (
    SELECT FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.roleid OR r.oid = m.member
    WHERE r.rolname = 'shifaa_f012_fence_executor'
  ) THEN
    RAISE EXCEPTION 'Ineligible F012 fence executor';
  END IF;
END
$$;

REVOKE ALL ON platform.f012_source_admission, clinical.safety_source_generations
  FROM PUBLIC, shifaa_api;
DO $$
DECLARE
  client_role name;
BEGIN
  FOR client_role IN SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON platform.f012_source_admission, clinical.safety_source_generations FROM %I',
      client_role
    );
  END LOOP;
END
$$;
GRANT USAGE ON SCHEMA platform, clinical TO shifaa_f012_fence_executor;
GRANT EXECUTE ON FUNCTION platform.pgrowlocks(text) TO shifaa_f012_fence_executor;
GRANT SELECT ON platform.f012_source_admission, clinical.safety_source_generations
  TO shifaa_f012_fence_executor;
-- Postgres requires UPDATE privilege for row locking. The policy prevents
-- changing the admission identity through the runtime principal.
GRANT UPDATE (admission_epoch) ON platform.f012_source_admission TO shifaa_f012_fence_executor;
GRANT UPDATE (generation) ON clinical.safety_source_generations TO shifaa_f012_fence_executor;

CREATE POLICY f012_admission_executor_read ON platform.f012_source_admission
  FOR SELECT TO shifaa_f012_fence_executor USING (true);
CREATE POLICY f012_admission_executor_lock_only ON platform.f012_source_admission
  FOR UPDATE TO shifaa_f012_fence_executor USING (true) WITH CHECK (false);
CREATE POLICY f012_generation_executor_read ON clinical.safety_source_generations
  FOR SELECT TO shifaa_f012_fence_executor USING (true);
CREATE POLICY f012_generation_executor_increment ON clinical.safety_source_generations
  FOR UPDATE TO shifaa_f012_fence_executor USING (true) WITH CHECK (true);

-- The owner provisions exact deployment/epoch and approved initialized scopes
-- while exposure is disabled. Owner INSERT is independent of runtime grants.
DO $$
BEGIN
  EXECUTE pg_catalog.format(
    'CREATE POLICY f012_offline_provision ON platform.f012_source_admission FOR INSERT TO %I WITH CHECK (true)',
    current_user
  );
  EXECUTE pg_catalog.format(
    'CREATE POLICY f012_offline_provision ON clinical.safety_source_generations FOR INSERT TO %I WITH CHECK (true)',
    current_user
  );
END
$$;

CREATE FUNCTION platform.f012_holds_admission_v1(
  p_deployment uuid, p_epoch uuid, p_write boolean
) RETURNS boolean LANGUAGE sql SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT
    FROM platform.f012_source_admission admission
    JOIN platform.pgrowlocks('platform.f012_source_admission') locks
      ON locks.locked_row = admission.ctid
    CROSS JOIN LATERAL unnest(locks.xids, locks.modes) holder(xid, mode)
    JOIN pg_catalog.pg_locks backend
      ON backend.locktype = 'transactionid' AND backend.transactionid = holder.xid
      AND backend.pid = pg_catalog.pg_backend_pid()
      AND backend.granted AND backend.mode = 'ExclusiveLock'
    WHERE admission.deployment_id = p_deployment AND admission.admission_epoch = p_epoch
      AND (holder.mode = 'For Update' OR (NOT p_write AND holder.mode = 'For Share'))
  );
$$;

CREATE FUNCTION platform.f012_lock_admission_v1(p_deployment uuid, p_epoch uuid, p_write boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF session_user <> 'shifaa_api' OR p_write IS NULL
    OR platform.f012_holds_admission_v1(p_deployment, p_epoch, false) THEN
    RAISE EXCEPTION 'F012 source admission denied' USING ERRCODE = '42501';
  END IF;
  IF p_write THEN
    PERFORM 1 FROM platform.f012_source_admission
      WHERE deployment_id = p_deployment AND admission_epoch = p_epoch FOR UPDATE;
  ELSE
    PERFORM 1 FROM platform.f012_source_admission
      WHERE deployment_id = p_deployment AND admission_epoch = p_epoch FOR SHARE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'F012 source admission denied' USING ERRCODE = '42501';
  END IF;
END
$$;

CREATE FUNCTION platform.f012_require_retained_admission_v1(
  p_deployment uuid, p_epoch uuid, p_write boolean
) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT platform.f012_holds_admission_v1(p_deployment, p_epoch, p_write) THEN
    RAISE EXCEPTION 'F012 source admission was not retained in the required mode'
      USING ERRCODE = '42501';
  END IF;
END
$$;

-- Rank zero precedes this operation. Callers take generation rows in sorted
-- producer/scope order before any source or lower rank rows.
CREATE FUNCTION clinical.f012_read_generation_v1(
  p_deployment uuid, p_epoch uuid, p_producer text, p_scope text, p_version text, p_write boolean
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  observed bigint;
BEGIN
  IF session_user <> 'shifaa_api' OR p_write IS NULL THEN
    RAISE EXCEPTION 'F012 generation scope denied' USING ERRCODE = '42501';
  END IF;
  PERFORM platform.f012_require_retained_admission_v1(p_deployment, p_epoch, p_write);
  IF p_write THEN
    SELECT generation INTO observed FROM clinical.safety_source_generations
      WHERE (deployment_id, admission_epoch, producer_key, scope_key, contract_version)
        = (p_deployment, p_epoch, p_producer, p_scope, p_version) FOR UPDATE;
  ELSE
    SELECT generation INTO observed FROM clinical.safety_source_generations
      WHERE (deployment_id, admission_epoch, producer_key, scope_key, contract_version)
        = (p_deployment, p_epoch, p_producer, p_scope, p_version);
  END IF;
  IF observed IS NULL THEN
    RAISE EXCEPTION 'F012 generation scope denied' USING ERRCODE = '42501';
  END IF;
  RETURN observed;
END
$$;

-- Only the already-captured generation can advance. SQL bigint overflow
-- aborts the owning transaction, including the caller's source changes.
CREATE FUNCTION clinical.f012_advance_generation_v1(
  p_deployment uuid, p_epoch uuid, p_producer text, p_scope text, p_version text, p_expected bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  next_generation bigint;
BEGIN
  IF session_user <> 'shifaa_api' THEN
    RAISE EXCEPTION 'F012 generation scope denied' USING ERRCODE = '42501';
  END IF;
  PERFORM platform.f012_require_retained_admission_v1(p_deployment, p_epoch, true);
  UPDATE clinical.safety_source_generations SET generation = generation + 1
    WHERE (deployment_id, admission_epoch, producer_key, scope_key, contract_version, generation)
      = (p_deployment, p_epoch, p_producer, p_scope, p_version, p_expected)
    RETURNING generation INTO next_generation;
  IF next_generation IS NULL THEN
    RAISE EXCEPTION 'F012 generation scope is missing or no longer current' USING ERRCODE = '40001';
  END IF;
  RETURN next_generation;
END
$$;

REVOKE ALL ON FUNCTION
  platform.f012_holds_admission_v1(uuid, uuid, boolean),
  platform.f012_lock_admission_v1(uuid, uuid, boolean),
  platform.f012_require_retained_admission_v1(uuid, uuid, boolean),
  clinical.f012_read_generation_v1(uuid, uuid, text, text, text, boolean),
  clinical.f012_advance_generation_v1(uuid, uuid, text, text, text, bigint)
  FROM PUBLIC, shifaa_api;
DO $$
DECLARE
  client_role name;
BEGIN
  FOR client_role IN SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION platform.pgrowlocks(text), '
      'platform.f012_holds_admission_v1(uuid, uuid, boolean), '
      'platform.f012_lock_admission_v1(uuid, uuid, boolean), '
      'platform.f012_require_retained_admission_v1(uuid, uuid, boolean), '
      'clinical.f012_read_generation_v1(uuid, uuid, text, text, text, boolean), '
      'clinical.f012_advance_generation_v1(uuid, uuid, text, text, text, bigint) FROM %I',
      client_role
    );
  END LOOP;
END
$$;
-- Temporarily grant CREATE as required by ALTER OWNER. Remove it after the
-- ownership transfer so the executor has no persistent schema CREATE grant.
GRANT CREATE ON SCHEMA platform, clinical TO shifaa_f012_fence_executor;
ALTER FUNCTION platform.f012_lock_admission_v1(uuid, uuid, boolean) OWNER TO shifaa_f012_fence_executor;
ALTER FUNCTION platform.f012_holds_admission_v1(uuid, uuid, boolean)
  OWNER TO shifaa_f012_fence_executor;
ALTER FUNCTION platform.f012_require_retained_admission_v1(uuid, uuid, boolean)
  OWNER TO shifaa_f012_fence_executor;
ALTER FUNCTION clinical.f012_read_generation_v1(uuid, uuid, text, text, text, boolean)
  OWNER TO shifaa_f012_fence_executor;
ALTER FUNCTION clinical.f012_advance_generation_v1(uuid, uuid, text, text, text, bigint)
  OWNER TO shifaa_f012_fence_executor;
REVOKE CREATE ON SCHEMA platform, clinical FROM shifaa_f012_fence_executor;
GRANT EXECUTE ON FUNCTION
  platform.f012_lock_admission_v1(uuid, uuid, boolean),
  clinical.f012_read_generation_v1(uuid, uuid, text, text, text, boolean),
  clinical.f012_advance_generation_v1(uuid, uuid, text, text, text, bigint)
  TO shifaa_api;

COMMIT;
