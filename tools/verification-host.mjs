import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { requiredIds } from './verification-plan.mjs';

// Coverage/admission table, NOT a shell dispatcher. Appearing in plan.json
// never authorizes a legacy resource command on the developer machine.
const resourceRoutes = new Map([
  ['legacy-15', 'guarded-sql'],
  ['legacy-16', 'guarded-sql'],
  ['legacy-17', 'guarded-sql'],
  ['legacy-18', 'unported-postgres'],
  ['legacy-19', 'unported-postgres'],
  ['legacy-20', 'guarded-discovery-sos'],
  ['legacy-21', 'unported-performance'],
  ['legacy-22', 'unported-postgres'],
  ['legacy-23', 'unported-native-supabase'],
  ['legacy-27', 'unported-postgres'],
  ['legacy-28', 'unported-postgres'],
  ['legacy-31', 'unported-performance'],
  ['legacy-32', 'unported-restore'],
  ['legacy-35', 'unported-postgres'],
  ['legacy-36', 'unported-postgres'],
  ['legacy-37', 'unported-performance'],
  ['legacy-38', 'unported-restore'],
  ['legacy-41', 'unported-two-runtime'],
  ['legacy-42', 'unported-two-runtime'],
  ['guarded-family', 'guarded-family'],
  ['guarded-privacy', 'guarded-privacy'],
]);

export function verificationRoutes(plan) {
  const ids = requiredIds(plan);
  assert.equal(ids.length, 44);
  assert.equal(new Set(ids).size, 44);
  for (const id of resourceRoutes.keys()) assert.ok(ids.includes(id));
  return ids.map((id) => ({ id, route: resourceRoutes.get(id) ?? 'local-check' }));
}

// Concrete unsafe call-chain evidence. A changed source requires a reviewed
// reclassification; disappearance of a marker is not a silent safety waiver.
export const unsafeEntrypoints = Object.freeze([
  {
    path: 'package.json',
    needles: ['docker compose down -v', 'supabase db reset --local'],
    impact: 'Shared Compose teardown and fixed-project Supabase reset',
  },
  {
    path: 'tools/run-identity-continuity-supabase-test.mjs',
    needles: ['supabase:stop', 'resetFeature011NativeSupabase'],
    impact: 'F007 requires isolated native Auth/Storage, not only PostgreSQL',
  },
  {
    path: 'tools/run-audit-admin-postgres-test.mjs',
    needles: ['127.0.0.1', '5432', 'DROP DATABASE', 'WITH (FORCE)'],
    impact: 'F008 fixed databases and shared-engine administration',
  },
  {
    path: 'tools/run-clinic-scheduling-postgres-test.mjs',
    needles: ['compose', 'DROP DATABASE', 'WITH (FORCE)'],
    impact: 'F009 fixed Compose execution and database replacement',
  },
  {
    path: 'tools/run-clinic-scheduling-restore-test.mjs',
    needles: ['compose', 'DROP DATABASE'],
    impact: 'F009 restore uses the development Compose engine',
  },
  {
    path: 'tools/run-feature-011-postgres-test.mjs',
    needles: ['shifaa-local-postgres-postgres-1', 'supabase_db_shifaa-local-supabase'],
    impact: 'F011 composition requires both physical runtimes and private outputs',
  },
]);

export function inspectUnsafeEntrypoints(root) {
  return unsafeEntrypoints.map((entry) => {
    const text = fs.readFileSync(path.join(root, entry.path), 'utf8');
    for (const needle of entry.needles)
      assert.ok(text.includes(needle), `Resource call-chain changed: ${entry.path}`);
    return {
      path: entry.path,
      impact: entry.impact,
      lines: entry.needles.map((needle) => text.slice(0, text.indexOf(needle)).split('\n').length),
    };
  });
}

export function localVerificationHost(root) {
  return {
    preflight(plan) {
      const blocked = verificationRoutes(plan).filter(({ route }) => route.startsWith('unported-'));
      const evidence = inspectUnsafeEntrypoints(root);
      if (blocked.length)
        return {
          status: 'BLOCKED',
          code: 'ISOLATED_LEGACY_RUNNERS_INCOMPLETE',
          reason:
            'Native Supabase and legacy physical/restore/performance runners lack verified run-owned execution adapters. No test, database or Docker command was started.',
          blocked,
          evidence,
        };
      // Never fall back to shared targets or arbitrary shell command dispatch.
      return {
        status: 'BLOCKED',
        code: 'COMPLETE_ISOLATED_EXECUTOR_REQUIRED',
        reason: 'The complete isolated execution graph has not been implemented.',
      };
    },
    execute() {
      throw new Error('No legacy command may bypass complete aggregate admission');
    },
  };
}
