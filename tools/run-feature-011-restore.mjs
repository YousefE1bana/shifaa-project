import { testDockerSync, testRuntime } from './verification-database.mjs';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  root,
  runtimes,
  runtimeManifest,
  withDatabase,
  assertOwnedDatabase,
  sql,
  digest,
} from './run-feature-011-postgres-test.mjs';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
} from './verify-feature-011-contracts.mjs';
import {
  withOperationalContent,
  patient,
  report,
  initial,
  successor,
  quote,
  person,
} from './feature-011-ops-fixtures.mjs';
import { PostgresFeature011Allergies } from '../services/api/src/adapters/postgres/feature-011-allergies.ts';
import { Feature011Allergies } from '../services/api/src/modules/feature-011/allergies.ts';
import { PostgresFeature011Content } from '../services/api/src/adapters/postgres/feature-011-content.ts';
import { Feature011Content } from '../services/api/src/modules/feature-011/create-release.ts';
import { Feature011Publication } from '../services/api/src/modules/feature-011/publish-release.ts';
const postgres = createRequire(resolve(root, 'services/api/package.json'))('postgres');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function restoreSnapshot(runtime, database) {
  const owner = (statement) => JSON.parse(sql(runtime, database, statement).stdout.trim());
  const names = owner(
    "SELECT coalesce(json_agg(quote_ident(n.nspname)||'.'||quote_ident(c.relname) ORDER BY n.nspname,c.relname),'[]'::json) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('identity','clinical','audit','platform','consent','hospital','trust','facilities','care','privacy','pharmacy');",
  );
  const tables = names.map((name) => {
    const entries = owner(
      `SELECT coalesce(json_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::json) FROM ${name} t;`,
    );
    return { table: name, count: entries.length, sha256: sha(JSON.stringify(entries)) };
  });
  const security = owner(
    "SELECT json_build_object('tables',(SELECT json_agg(json_build_object('name',n.nspname||'.'||c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',(SELECT json_agg(json_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a)) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('identity','clinical','audit','platform','consent','hospital','trust','facilities','care','privacy','pharmacy')),'functions',(SELECT json_agg(pg_get_functiondef(p.oid) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('identity','clinical','audit','platform','consent','hospital','trust','facilities','care','privacy','pharmacy')),'functionGrants',(SELECT json_agg(json_build_object('name',n.nspname||'.'||p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',(SELECT json_agg(json_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('identity','clinical','audit','platform','consent','hospital','trust','facilities','care','privacy','pharmacy')),'triggers',(SELECT json_agg(json_build_object('table',c.oid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) ORDER BY n.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('identity','clinical','audit','platform','consent','hospital','trust','facilities','care','privacy','pharmacy')),'policies',(SELECT json_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname IN ('identity','clinical','audit','platform','consent','hospital','trust','facilities','care','privacy','pharmacy')),'constraints',(SELECT json_agg(json_build_object('name',c.conname,'table',c.conrelid::regclass::text,'domain',c.contypid::regtype::text,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY n.nspname,c.conrelid::regclass::text,c.contypid::regtype::text,c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('identity','clinical','audit','platform','consent','hospital','trust','facilities','care','privacy','pharmacy')),'roles',(SELECT json_agg(json_build_object('name',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls,'login',rolcanlogin) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('shifaa_api','shifaa_worker','shifaa_f011_executor')));",
  );
  assert(security.roles.every((r) => r.superuser === false && r.bypassRls === false));
  const f011 = security.tables.filter(
    (t) => t.name.startsWith('clinical.') && /allerg|content_|mutation_/.test(t.name),
  );
  assert(f011.length >= 14 && f011.every((t) => t.rls && t.force));
  return {
    tables,
    dataSha256: sha(JSON.stringify(tables)),
    securitySha256: sha(JSON.stringify(security)),
    securityParts: Object.fromEntries(
      Object.entries(security).map(([part, entries]) => [part, sha(JSON.stringify(entries))]),
    ),
    constraintIdentities: security.constraints,
    roleFlags: security.roles,
    forcedTables: f011.map((t) => t.name),
  };
}
function backup(runtime, database) {
  assertOwnedDatabase(runtime, database);
  const captured = testDockerSync(
    ['exec', runtime.container, 'pg_dump', '-Fc', '-U', runtime.user, '-d', database],
    { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 60000 },
  );
  assert.equal(captured.status, 0, 'pg_dump failed; raw dump is never logged');
  assert(captured.stdout?.length > 0);
  return captured.stdout;
}
function restore(runtime, database, dump) {
  assertOwnedDatabase(runtime, database);
  const captured = testDockerSync(
    [
      'exec',
      '-i',
      runtime.container,
      'pg_restore',
      '--exit-on-error',
      '-U',
      runtime.user,
      '-d',
      database,
    ],
    { input: dump, windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout: 60000 },
  );
  assert.equal(captured.status, 0, 'pg_restore failed: ' + captured.stderr?.toString());
}
function currentStatus(runtime, database, at) {
  const settings = {
    environment: 'local',
    person_id: person(2),
    actor_role: 'CLN',
    action: 'listClinicalContent',
    aal: '2',
    purposes: 'synthetic.feature011',
    facility_id: 'f0110000-0000-4000-8200-000000000001',
    test_now: at,
  };
  const context = Object.entries(settings)
    .map(([key, value]) => `SELECT set_config(${quote('shifaa.' + key)},${quote(value)},true);`)
    .join('');
  const query = {
    projection: 'status',
    governedContentKey: initial.governedContentKey,
    effectiveScopeKey: initial.effectiveScopeKey,
  };
  const execution = sql(
    runtime,
    database,
    `BEGIN;${context}SELECT clinical.list_clinical_content_api_v1('synthetic',${quote(JSON.stringify(query))}::jsonb);COMMIT;`,
    { user: 'shifaa_api' },
  );
  return JSON.parse(execution.stdout.split(/\r?\n/).find((line) => line.startsWith('[')));
}
export async function runRestore() {
  const pins = currentPhysicalSourceDigests();
  const inputs = Object.fromEntries(
    [
      'tools/run-feature-011-restore.mjs',
      'tools/feature-011-ops-fixtures.mjs',
      'services/api/src/modules/feature-011/allergies.ts',
      'services/api/src/modules/feature-011/create-release.ts',
      'services/api/src/modules/feature-011/publish-release.ts',
      'services/api/src/modules/feature-011/mutation-receipts.ts',
    ].map((path) => [path, digest(path)]),
  );
  const parity = await verifyFeature011Contracts();
  assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
  const results = [];
  for (const runtime of runtimes) {
    console.log(runtime.name + ': real populated dump/restore');
    const result = await withOperationalContent(runtime, async (h) => {
      const originalKey = randomUUID();
      const created = await h.request('POST', report, { key: originalKey });
      assert.equal(created.statusCode, 201);
      await h.advance(created.json());
      const contentKey = randomUUID();
      const contentOriginal = await h.content(initial, { key: contentKey });
      assert.equal(contentOriginal.statusCode, 201);
      // A separate fully reviewed/signed root and fresh successor evidence the rollback path.
      const rootRelease = await h.ready();
      const published = await h.publish(rootRelease.id);
      assert.equal(published.statusCode, 200, published.body);
      const rolled = await h.ready({ request: successor(rootRelease.id, 1) });
      const rollbackKey = randomUUID();
      const rollbackOriginal = await h.publish(rolled.id, { key: rollbackKey });
      assert.equal(rollbackOriginal.statusCode, 200, rollbackOriginal.body);
      const futureRequest = successor(rolled.id, 2);
      futureRequest.effectiveAt = '2098-01-01T00:00:00.000000Z';
      const future = await h.ready({ request: futureRequest });
      assert.equal((await h.publish(future.id)).statusCode, 200);
      const now = '2026-10-09T00:00:00.000000Z';
      const sourceStatus = currentStatus(runtime, h.database, now);
      assert(
        sourceStatus.length > 0 && !JSON.stringify(sourceStatus).includes(future.id),
        'Future eligibility not early',
      );
      const source = restoreSnapshot(runtime, h.database);
      for (const name of [
        'clinical.allergy_heads',
        'clinical.allergies',
        'clinical.allergy_verification_support',
        'clinical.allergy_verification_bindings',
        'clinical.content_releases',
        'clinical.content_material_bindings',
        'clinical.content_signature_bindings',
        'clinical.content_artifact_admissibility_bindings',
        'clinical.mutation_receipts',
        'clinical.mutation_commit_obligations',
        'audit.signature_evidence',
        'platform.outbox_events',
        'platform.idempotency_records',
      ])
        assert(source.tables.find((t) => t.table === name)?.count > 0, name + ' must be populated');
      const dump = backup(runtime, h.database);
      const backupSha256 = sha(dump);
      let restored;
      try {
        restored = await withDatabase(
          runtime,
          async (database) => {
            const start = performance.now();
            restore(runtime, database, dump);
            const restoreMs = performance.now() - start;
            const snapshot = restoreSnapshot(runtime, database);
            assert.deepEqual(snapshot, source, 'Restore changed history or security');
            assert.deepEqual(currentStatus(runtime, database, now), sourceStatus);
            const pool = postgres({
              host: '127.0.0.1',
              port: testRuntime(runtime.name === 'shifaa-local-postgres' ? 'postgres' : 'supabase')
                .port,
              database,
              username: 'shifaa_api',
              password: 'synthetic_api_only',
              max: 2,
              prepare: false,
              onnotice() {},
            });
            try {
              const allergyRepo = new PostgresFeature011Allergies(pool, randomBytes(32));
              const allergyService = new Feature011Allergies({
                repository: allergyRepo,
                provider: h.provider,
              });
              const actor = {
                ...(await h.native(h.actors.patient.token)),
                requestId: randomUUID(),
                locale: 'en-EG',
                purposes: ['synthetic.feature011'],
              };
              const replay = await allergyService.createAllergy(
                actor,
                patient,
                report,
                originalKey,
              );
              assert(
                Buffer.from(replay.body).equals(Buffer.from(created.body)),
                'Original response restored after revision advancement',
              );
              const read = await allergyService.listAllergies(actor, patient, {});
              assert(JSON.stringify(read).includes(created.json().allergyId));
              const contentRepo = new PostgresFeature011Content(pool);
              const deps = {
                repository: contentRepo,
                provider: h.provider,
                evidence: {
                  mode: 'isolated-synthetic',
                  sourceIdentity: 'synthetic.k15',
                  now: () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z'),
                },
                material: {
                  resolve: async (kind, reference) => {
                    const vectors = JSON.parse(
                      (await import('node:fs')).readFileSync(
                        'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1-vectors.json',
                      ),
                    );
                    const vector = vectors.positive[0];
                    assert.equal(reference, vector.facts.evidence[kind].ref);
                    return {
                      kind,
                      reference,
                      sourceIdentity: 'synthetic.k15',
                      sourceEvidenceIdentity: reference,
                      bytes: Buffer.from(vector.materialBytesHex[kind], 'hex'),
                    };
                  },
                },
              };
              const creator = {
                ...(await h.native(h.actors.medical.token)),
                requestId: randomUUID(),
                locale: 'en-EG',
                purposes: ['synthetic.feature011'],
              };
              const releaseReplay = await new Feature011Content(deps).createClinicalContentRelease(
                creator,
                'synthetic',
                initial,
                contentKey,
              );
              assert(
                Buffer.from(releaseReplay.body).equals(Buffer.from(contentOriginal.body)),
                'Restored create receipt differs',
              );
              const publisher = {
                ...(await h.native(h.actors.publisher.token)),
                requestId: randomUUID(),
                locale: 'en-EG',
                purposes: ['synthetic.feature011'],
              };
              const record = h.owner(
                `SELECT json_build_object('version',artifact_version,'digest',encode(artifact_digest,'hex')) FROM clinical.content_releases WHERE id=${quote(rolled.id)}::uuid;`,
              );
              const publication = new Feature011Publication({
                ...deps,
                context: { select: async () => ({ contentType: 'synthetic' }) },
              });
              const publishReplay = await publication.publishClinicalContentRelease(
                publisher,
                rolled.id,
                {
                  artifactVersion: record.version,
                  artifactDigest: record.digest,
                  confirmPublication: true,
                },
                { key: rollbackKey, expectedVersion: 3 },
              );
              assert(
                Buffer.from(publishReplay.body).equals(Buffer.from(rollbackOriginal.body)),
                'Restored publish receipt differs',
              );
              assert.deepEqual(
                restoreSnapshot(runtime, database),
                source,
                'Read/replay must not change restored data',
              );
              return {
                database,
                restoreMs,
                snapshot,
                checks: [
                  'all-table-digests-counts',
                  'owners-function-policy-constraint-grants',
                  'FORCE-RLS-role-flags',
                  'allergy-real-AES-history-reconstruction',
                  'original-allergy-receipt-after-head-advance',
                  'original-create-exact-review-receipt',
                  'original-publish-receipt',
                  'future-not-early',
                  'fresh-independently-signed-successor-rollback',
                  'predecessor-history-preserved',
                  'replay-zero-new-domain-audit-outbox-receipt',
                ],
              };
            } finally {
              await pool.end({ timeout: 5 });
            }
          },
          'K08',
        );
      } finally {
        dump.fill(0);
      }
      assert.equal(h.counters().externalUnderLocks, 0);
      return {
        runtime: runtime.name,
        identity: runtimeManifest(runtime),
        sourceDatabase: h.database,
        source,
        restored,
        predecessor: h.predecessor,
        backup: {
          format: 'pg_dump custom; memory only; discarded after restore',
          bytes: dump.length,
          sha256: backupSha256,
        },
        realAes: true,
        productionKms: false,
      };
    });
    results.push(result);
  }
  assert.deepEqual(currentPhysicalSourceDigests(), pins);
  for (const [path, hash] of Object.entries(inputs)) assert.equal(digest(path), hash);
  const proof = {
    checkpoint: 'K23',
    task: 'T086',
    result: 'PASS_ENGINEERING_RESTORE',
    capturedAt: new Date().toISOString(),
    sourceDigests: pins,
    inputs,
    runtimes: results,
    destructiveSharedReset: false,
    productionRpoRto: 'BLOCKED_REQUIRES_OWNER_PROFILE',
    productionWormRetention: 'GATED_EXISTING_LEGAL_BACKUP_CONTROLS',
    syntheticEngineeringOnly: true,
    retainedGates: 'UNCHANGED_OPEN',
  };
  const directory =
    'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23';
  mkdirSync(directory, { recursive: true });
  writeFileSync(directory + '/restore-proof.json', JSON.stringify(proof, null, 2) + '\n');
  console.log('Both-runtime restore/replay/history/security PASS');
  return proof;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await runRestore();
