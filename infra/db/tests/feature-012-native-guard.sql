\set ON_ERROR_STOP on

-- Native fixture schema baseline. Run after starting pinned GoTrue in the
-- admitted disposable T002 topology. No credential or identity rows are output.
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;

SELECT c.oid::regclass AS relation, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
       count(p.oid) AS policies
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.oid IN ('auth.users'::regclass, 'auth.sessions'::regclass)
GROUP BY c.oid
ORDER BY c.oid::regclass::text;

SELECT 'probe_nobypass_nonowner', NOT r.rolsuper AND NOT r.rolbypassrls
       AND NOT pg_has_role(r.oid, c.relowner, 'MEMBER')
FROM pg_roles r
CROSS JOIN pg_class c
WHERE r.rolname = 'f012_probe' AND c.oid = 'auth.sessions'::regclass;

SELECT 'probe_has_native_table_access', EXISTS (
  SELECT FROM pg_class c
  WHERE c.oid IN ('auth.users'::regclass, 'auth.sessions'::regclass)
    AND (
      has_any_column_privilege('f012_probe', c.oid, 'SELECT,INSERT,UPDATE')
      OR has_table_privilege('f012_probe', c.oid, 'DELETE,TRUNCATE')
    )
);
ROLLBACK;
