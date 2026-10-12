import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runtimes, sql, runtimeManifest, digest } from './run-feature-011-postgres-test.mjs';
import {
  currentPhysicalSourceDigests,
  verifyFeature011Contracts,
} from './verify-feature-011-contracts.mjs';
import { withOperationalContent, initial } from './feature-011-ops-fixtures.mjs';
export async function runObservability() {
  const parity = await verifyFeature011Contracts();
  assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
  const pins = currentPhysicalSourceDigests(),
    results = [];
  const directory =
    'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23';
  const prerequisitePaths = ['performance-proof.json', 'restore-proof.json'].map(
    (name) => directory + '/' + name,
  );
  const prerequisites = Object.fromEntries(prerequisitePaths.map((path) => [path, digest(path)]));
  for (const path of prerequisitePaths) {
    const proof = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(proof.sourceDigests, pins, 'Stale prerequisite pins');
    for (const [source, hash] of Object.entries(proof.inputs))
      assert.equal(digest(source), hash, 'Stale prerequisite source');
    assert(proof.result.startsWith('PASS_'), 'Local prerequisite did not pass');
    if (proof.task === 'T085') assert.equal(proof.allLocalThresholdsMet, true);
  }
  const inputs = Object.fromEntries(
    [
      'tools/run-feature-011-observability.mjs',
      'tools/feature-011-ops-fixtures.mjs',
      'services/api/src/modules/feature-011/observability.ts',
      'services/api/src/app.ts',
    ].map((path) => [path, digest(path)]),
  );
  for (const runtime of runtimes) {
    const records = [];
    const result = await withOperationalContent(
      runtime,
      async (h) => {
        const state = () =>
          h.owner(
            "SELECT json_build_object('domain',(SELECT count(*) FROM clinical.content_releases),'signatures',(SELECT count(*) FROM audit.signature_evidence WHERE resource_type='clinical.content_release'),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'completed',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed'));",
          );
        const key = randomUUID(),
          before = state();
        const first = await h.content(initial, { key });
        assert.equal(first.statusCode, 201);
        const completed = state();
        for (const field of ['domain', 'audit', 'outbox', 'receipts', 'completed'])
          assert.equal(completed[field] - before[field], 1);
        const encryptionCount = h.control.prepared.length;
        const replay = await h.content(initial, { key });
        assert.equal(replay.body, first.body);
        assert.deepEqual(state(), completed);
        assert.equal(h.control.prepared.length, encryptionCount);
        h.control.mode = 'unavailable';
        const unavailable = await h.content();
        assert([403, 422, 503].includes(unavailable.statusCode));
        assert.deepEqual(state(), completed);
        h.control.mode = null;
        h.config.feature011KillSwitch = true;
        const killed = await h.content();
        assert.equal(killed.statusCode, 503);
        assert.deepEqual(state(), completed);
        h.config.feature011KillSwitch = false;
        const worker = sql(
          runtime,
          h.database,
          "SELECT clinical.publish_clinical_content_release_api_v1('00000000-0000-4000-8000-000000000000'::uuid,1,'{}'::jsonb);",
          { user: 'shifaa_worker', allowFailure: true },
        );
        assert.notEqual(worker.exitCode, 0);
        assert.match(worker.stderr, /42501/);
        assert.deepEqual(state(), completed);
        assert(records.length >= 3);
        assert.equal(new Set(records.map((r) => r.correlation)).size, records.length);
        for (const record of records) {
          assert.deepEqual(Object.keys(record).sort(), [
            'correlation',
            'durationMs',
            'operation',
            'outcome',
          ]);
          assert.equal(record.operation, 'createClinicalContentRelease');
          assert(Object.isFrozen(record));
        }
        const serialized = JSON.stringify(records);
        for (const forbidden of [
          'keyRef',
          'artifactReview',
          'credential',
          'signingEvidenceRef',
          'Authorization',
          'synthetic.k15',
          initial.source.display,
          ...Object.values(h.actors).map((a) => a.token),
        ])
          assert(!serialized.includes(forbidden));
        assert.equal(h.counters().externalUnderLocks, 0);
        return {
          runtime: runtime.name,
          identity: runtimeManifest(runtime),
          checks: [
            'closed-low-cardinality-operation-outcome',
            'server-generated-correlation-not-caller',
            'no-identity-source-body-key-token-sinks',
            'one-durable-outbox-on-first-effect',
            'replay-no-duplicate-effect-event-signature-encryption',
            'unavailable-material-fails-closed',
            'kill-switch-zero-queued-mutation',
            'worker-retry-cannot-publish',
            'no-external-under-lock',
          ],
          durableDelta: Object.fromEntries(
            Object.entries(completed).map(([k, n]) => [k, n - before[k]]),
          ),
          telemetry: records,
          workerDeniedSqlstate: '42501',
          newNotificationsTemplatesVendorsOrF012Consumers: false,
        };
      },
      records,
    );
    results.push(result);
  }
  assert.deepEqual(currentPhysicalSourceDigests(), pins);
  for (const [path, hash] of Object.entries({ ...inputs, ...prerequisites }))
    assert.equal(digest(path), hash);
  const proof = {
    checkpoint: 'K23',
    task: 'T087',
    result: 'PASS',
    capturedAt: new Date().toISOString(),
    sourceDigests: pins,
    inputs,
    prerequisites,
    runtimes: results,
    retainedGates: 'UNCHANGED_OPEN',
    syntheticEngineeringOnly: true,
  };
  mkdirSync(directory, { recursive: true });
  writeFileSync(directory + '/observability-proof.json', JSON.stringify(proof, null, 2) + '\n');
  console.log('Both-runtime telemetry/dedup/kill/dependency PASS');
  return proof;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await runObservability();
