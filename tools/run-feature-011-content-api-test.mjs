// K15/K16: native Auth, real application AES, non-owner SQL, synthetic materials.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withAllergyApi } from './run-feature-011-allergy-api-test.mjs';
import { runtimes, sql, digest, root, runtimeManifest } from './run-feature-011-postgres-test.mjs';
import { session, marker } from './run-feature-011-concurrency-test.mjs';
import { Feature011Content } from '../services/api/src/modules/feature-011/create-release.ts';
import { PostgresFeature011Content } from '../services/api/src/adapters/postgres/feature-011-content.ts';
import { registerFeature011ContentRoutes } from '../services/api/src/routes/feature-011-content.ts';
import {
  releaseAad,
  protectRelease,
} from '../services/api/src/modules/feature-011/release-protection.ts';
import { prepareCapability } from '../services/api/src/modules/feature-011/protection.ts';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
} from './verify-feature-011-contracts.mjs';
import { governedOfflineProof } from './feature-011-offline-proof.mjs';
import { publishedPredecessor } from './feature-011-content-fixtures.mjs';
const f = 'specs/011-allergies-clinical-content-governance';
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const json = (v) => q(JSON.stringify(v)) + '::jsonb';
const person = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const vector = JSON.parse(readFileSync(f + '/contracts/artifact-canonicalization-v1-vectors.json'))
  .positive[0];
const materials = Object.fromEntries(
  Object.entries(vector.materialBytesHex).map(([k, v]) => [k, Buffer.from(v, 'hex')]),
);
export const request = {
  governedContentKey: vector.facts.series.governedContentKey,
  effectiveScopeKey: vector.facts.series.effectiveScopeKey,
  source:
    vector.facts.source.reference === null
      ? { display: vector.facts.source.display }
      : vector.facts.source,
  effectiveAt: vector.facts.effectiveAt,
  predecessor: vector.facts.predecessor,
  artifact: {
    contentEvidenceRef: vector.facts.evidence.content.ref,
    codeEvidenceRef: vector.facts.evidence.code.ref,
    testVectorEvidenceRef: vector.facts.evidence.testVectors.ref,
    declaredDigest: vector.sha256,
  },
};
const now = () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
const delay = () => new Promise((r) => setTimeout(r, 25));
const paths = [
  'services/api/src/modules/feature-011/create-release.ts',
  'services/api/src/modules/feature-011/create-release.test.ts',
  'services/api/src/adapters/postgres/feature-011-content.ts',
  'services/api/src/routes/feature-011-content.ts',
  'services/api/src/app.ts',
  'packages/core/src/index.ts',
  'tools/run-feature-011-allergy-api-test.mjs',
  'tools/run-feature-011-content-api-test.mjs',
  'tools/feature-011-content-fixtures.mjs',
  'tools/feature-011-offline-proof.mjs',
];
async function waitLocks(h, count = 1) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const rows = h.owner(
      `SELECT coalesce(json_agg(json_build_object('pid',pid,'user',usename,'blocking',pg_blocking_pids(pid),'locks',(SELECT count(*) FROM pg_locks l WHERE l.pid=a.pid AND NOT granted))),'[]'::json) FROM pg_stat_activity a WHERE datname=${q(h.database)} AND wait_event_type='Lock';`,
    );
    if (
      rows.length >= count &&
      rows.every((r) => r.user === 'shifaa_api' && r.blocking.length && r.locks)
    )
      return rows;
    await delay();
  }
  throw Error('Required independent pg_locks barrier missing');
}
async function holdSeries(h) {
  const c = session(
    h.runtime,
    h.database,
    h.database.replace('k08', 'k07') + '_holder',
    h.runtime.user,
  );
  c.send(
    `BEGIN;SET LOCAL idle_in_transaction_session_timeout='60s';SELECT pg_advisory_xact_lock(hashtextextended(${q(['synthetic', request.governedContentKey, request.effectiveScopeKey].join('\x1f'))},0));SELECT 'HELD';`,
  );
  await marker(c, 'HELD');
  return c;
}
async function release(c) {
  c.send("COMMIT;SELECT 'COMMITTED';");
  await marker(c, 'COMMITTED');
  c.send('\\q');
  await c.closed;
}
function state(h) {
  return h.owner(
    `SELECT json_build_object('releases',(SELECT count(*) FROM clinical.content_releases),'bindings',(SELECT count(*) FROM clinical.content_material_bindings),'signatures',(SELECT count(*) FROM audit.signature_evidence WHERE resource_type='clinical.content_release'),'admissions',(SELECT count(*) FROM clinical.content_artifact_admissibility_bindings),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'obligations',(SELECT count(*) FROM clinical.mutation_commit_obligations),'idempotency',(SELECT count(*) FROM platform.idempotency_records));`,
  );
}
export async function withContent(runtime, work, signingSetup) {
  const control = { mode: null, before: null, prepared: [], materials: 0 };
  let service, provider, repository;
  return withAllergyApi(
    runtime,
    async (h) =>
      work({
        ...h,
        service,
        provider,
        repository,
        control,
        content: (body = request, options = {}) =>
          h.request('POST', body, {
            actor: 'medical',
            url: '/v1/admin/clinical-content/synthetic/releases',
            ...options,
          }),
      }).catch((e) => {
        console.error('K15 behavior failure:', e);
        throw e;
      }),
    {
      additionalActors: [
        ['medical', 5],
        ['pharmacist', 3],
        ...(signingSetup?.additionalActors ?? []),
      ],
      forbiddenValues: Object.values(materials).map((b) => b.toString()),
      configureApp: async (args) => {
        provider = args.provider;
        repository = new PostgresFeature011Content(args.pool);
        const source = {
          async resolve(kind, reference) {
            control.materials++;
            if (control.mode === 'unavailable') throw Error('Unavailable synthetic material');
            const expected = vector.facts.evidence[kind].ref;
            return {
              kind,
              reference: control.mode === 'substitution' ? randomUUID() : reference,
              sourceIdentity: 'synthetic.k15',
              sourceEvidenceIdentity: reference,
              bytes:
                control.mode === 'malformed'
                  ? Buffer.from([0xff])
                  : Buffer.from(
                      reference === expected
                        ? materials[kind]
                        : Buffer.from('wrong neutral source'),
                    ),
            };
          },
        };
        const deps = {
          repository: { read: (...a) => repository.read(...a), receipts: args.receipts },
          provider,
          evidence: { mode: 'isolated-synthetic', sourceIdentity: 'synthetic.k15', now },
          material: source,
        };
        service = new Feature011Content(deps);
        const signing = await signingSetup?.({ ...args, repository });
        const additional = await signingSetup?.configure?.({ ...args, deps, repository });
        await registerFeature011ContentRoutes(args.app, {
          config: args.config,
          service,
          ...(signing ? { signing } : {}),
          ...additional,
          resolveNativePatient: args.native,
        });
      },
      beforeMutation: async (scope, input) => {
        if (scope.operationId === 'createClinicalContentRelease') {
          for (const material of Object.values(materials))
            assert(
              !JSON.stringify(input).includes(material.toString()),
              'Raw material absent from SQL input',
            );
          control.prepared.push(structuredClone(input));
        }
        await control.before?.(scope, input);
      },
      afterFinalization: async () => {
        await signingSetup?.afterFinalization?.();
      },
    },
  );
}
async function proveCreate(h) {
  const serverVersion = h.health.manifest.serverVersion;
  assert(serverVersion.startsWith(h.runtime.name === 'shifaa-local-postgres' ? '17.11' : '17.6'));
  const checks = [],
    races = [];
  const check = (id, condition = true) => {
    assert(condition, id);
    checks.push({ id, result: 'PASS' });
  };
  const before = state(h),
    created = await h.content();
  assert.equal(created.statusCode, 201, created.body);
  const row = created.json();
  check(
    'EXACT_INITIAL_TUPLE',
    row.artifactVersion === 1 && row.workflowVersion === 1 && row.initial === true,
  );
  check('FROZEN_SQL_DIGEST', row.artifactDigest === vector.sha256);
  for (const kind of ['content', 'code', 'testVectors'])
    check('LOSSLESS_UTF8_' + kind, Buffer.from(row.artifactReview[kind]).equals(materials[kind]));
  check(
    'CREATE_NEVER_ADMITS',
    state(h).admissions === before.admissions &&
      state(h).signatures === before.signatures &&
      row.eligibility === 'unavailable',
  );
  const after = state(h);
  for (const [key, n] of Object.entries({
    releases: 1,
    bindings: 3,
    audit: 1,
    outbox: 1,
    receipts: 1,
    obligations: 1,
    idempotency: 1,
  }))
    check('ALL_FIVE_' + key, after[key] - before[key] === n);
  const prepared = h.control.prepared.at(-1).handoff,
    cap = await prepareCapability(h.provider, 'body', 'decrypt', prepared.protectedBody.keyRef);
  try {
    check(
      'INTENDED_BODY_AND_AAD',
      cap
        .decrypt(
          prepared.protectedBody,
          releaseAad({ resourceId: row.releaseId, artifactVersion: 1, keyRef: cap.keyRef }),
        )
        .equals(materials.content),
    );
  } finally {
    cap.dispose();
  }
  check(
    'PUBLIC_PRIVATE_SNAPSHOT_SEPARATION',
    !/(protectedBody|keyRef|privateReviewSources|qualification|sourceEvidenceIdentity)/.test(
      created.body,
    ),
  );
  for (const [id, body, mode] of [
    [
      'DIGEST_MISMATCH',
      { ...request, artifact: { ...request.artifact, declaredDigest: '0'.repeat(64) } },
      null,
    ],
    ['EVIDENCE_SUBSTITUTION', request, 'substitution'],
    ['UNAVAILABLE_SOURCE', request, 'unavailable'],
    ['INVALID_UTF8', request, 'malformed'],
  ]) {
    const s = state(h);
    h.control.mode = mode;
    const denied = await h.content(body);
    assert.equal(denied.statusCode, 422, denied.body);
    assert.deepEqual(state(h), s);
    check(id);
    h.control.mode = null;
  }
  for (const actor of ['patient', 'clinician', 'pharmacist']) {
    const s = state(h);
    const denied = await h.content(request, { actor });
    assert.equal(denied.statusCode, 403, denied.body);
    assert.deepEqual(state(h), s);
    check('NOT_ADMIN_' + actor);
  }
  const wrong = Buffer.from('different intended material');
  await assert.rejects(
    protectRelease(
      h.provider,
      { resourceId: randomUUID(), artifactVersion: 1 },
      materials.content,
      wrong,
    ),
  );
  check('PROTECTED_INTENDED_MATERIAL_MISMATCH');
  const key = randomUUID(),
    original = await h.content(request, { key });
  assert.equal(original.statusCode, 201, original.body);
  const saved = state(h),
    counter = h.counters().keyPreparations;
  const replay = await h.content(request, { key });
  assert.equal(replay.body, original.body);
  assert.equal(replay.headers.etag, original.headers.etag);
  assert.equal(h.counters().keyPreparations - counter, 1);
  assert.deepEqual(state(h), saved);
  check('ORIGINAL_REPLAY_NO_DOMAIN_CRYPTO');
  const binding = await h.content({ ...request, source: { display: 'Changed request' } }, { key });
  assert.equal(binding.statusCode, 409, binding.body);
  assert.deepEqual(state(h), saved);
  check('CHANGED_KEY_BINDING');
  h.control.mode = 'unavailable';
  const unavailableReplay = await h.content(request, { key });
  assert.equal(unavailableReplay.statusCode, 422, unavailableReplay.body);
  assert.deepEqual(state(h), saved);
  check('REPLAY_CURRENT_EVIDENCE_DENIED');
  h.control.mode = null;
  for (const fault of ['before', 'after', 'unknown']) {
    const s = state(h),
      k = randomUUID();
    h.setFault(fault);
    const failed = await h.content(request, { key: k });
    assert.equal(failed.statusCode, 500);
    h.setFault(undefined);
    const retry = await h.content(request, { key: k });
    assert.equal(retry.statusCode, 201, retry.body);
    const end = state(h);
    for (const [name, n] of Object.entries({
      releases: 1,
      bindings: 3,
      audit: 1,
      outbox: 1,
      receipts: 1,
      idempotency: 1,
    }))
      assert.equal(end[name] - s[name], n);
    check('FAULT_SETTLEMENT_' + fault);
  }
  // Actual two native requests, separate shifaa_api transactions. Holder is control-only.
  for (const sameKey of [false, true]) {
    const holder = await holdSeries(h);
    const s = state(h),
      ka = randomUUID(),
      kb = sameKey ? ka : randomUUID();
    const p1 = h.content(request, { key: ka });
    await waitLocks(h);
    const p2 = h.content(request, { key: kb });
    const locks = await waitLocks(h, 2);
    await release(holder);
    const responses = await Promise.all([p1, p2]);
    responses.forEach((r) => assert.equal(r.statusCode, 201, r.body));
    if (sameKey) assert.equal(responses[0].body, responses[1].body);
    else {
      assert.notEqual(responses[0].json().releaseId, responses[1].json().releaseId);
      assert.equal(responses[0].json().artifactVersion, responses[1].json().artifactVersion);
    }
    const n = sameKey ? 1 : 2,
      end = state(h);
    for (const [name, count] of Object.entries({
      releases: n,
      bindings: 3 * n,
      audit: n,
      outbox: n,
      receipts: n,
      idempotency: n,
    }))
      assert.equal(end[name] - s[name], count);
    races.push({
      id: sameKey ? 'SAME_KEY' : 'SAME_VERSION_COMPETING_DRAFTS',
      statuses: responses.map((r) => r.statusCode),
      effects: n,
      pgLocks: locks,
      result: 'PASS',
    });
  }
  let first;
  h.control.before = async (_scope, input) => {
    first = input.handoff;
    const e = Error('Synthetic preflight lost');
    e.code = '40001';
    throw e;
  };
  const s = state(h),
    retryKey = randomUUID(),
    lost = await h.content(request, { key: retryKey });
  assert.equal(lost.statusCode, 409, lost.body);
  assert.deepEqual(state(h), s);
  h.control.before = null;
  const retried = await h.content(request, { key: retryKey });
  assert.equal(retried.statusCode, 201, retried.body);
  const fresh = h.control.prepared.at(-1).handoff;
  check(
    'TRUE_RETRY_FRESH_ID_NONCE_ENVELOPE',
    first.allocation.releaseId !== fresh.allocation.releaseId &&
      first.protectedBody.nonce !== fresh.protectedBody.nonce &&
      first.protectedBody.ciphertext !== fresh.protectedBody.ciphertext,
  );
  // Owner fixture represents already-published lineage; no public publish route executed.
  let ready, continueMutation;
  const preparedBarrier = new Promise((resolve) => {
    ready = resolve;
  });
  const writerBarrier = new Promise((resolve) => {
    continueMutation = resolve;
  });
  h.control.before = async () => {
    ready();
    await writerBarrier;
  };
  const pendingInitial = h.content();
  await preparedBarrier;
  const rootRow = created.json();
  try {
    await publishedPredecessor(h, rootRow, request);
  } finally {
    h.control.before = null;
    continueMutation();
  }
  const staleRace = await pendingInitial;
  assert.equal(staleRace.statusCode, 409, staleRace.body);
  races.push({
    id: 'PUBLISHED_ROOT_AFTER_CREATE_PREFLIGHT',
    statuses: [staleRace.statusCode],
    effects: 0,
    independentSessions: true,
    barrier: 'PREPARED_BEFORE_PUBLISH_COMMIT',
    result: 'PASS',
  });
  const old = state(h),
    stale = await h.content();
  assert.equal(stale.statusCode, 409, stale.body);
  assert.deepEqual(state(h), old);
  check('STALE_INITIAL_LINEAGE');
  const successorRequest = {
    ...request,
    predecessor: { initial: false, supersedesReleaseId: rootRow.releaseId },
    artifact: { ...request.artifact },
  };
  delete successorRequest.artifact.declaredDigest;
  const successor = await h.content(successorRequest);
  assert.equal(successor.statusCode, 201, successor.body);
  check(
    'EXACT_SUCCESSOR_ALLOCATION',
    successor.json().artifactVersion === 2 &&
      successor.json().supersedesReleaseId === rootRow.releaseId,
  );
  const replayAfter = await h.content(request, { key });
  assert.equal(replayAfter.body, original.body);
  check('ORIGINAL_REPLAY_AFTER_LINEAGE_ADVANCEMENT');
  const approval = randomUUID(),
    candidate = successor.json();
  sql(
    h.runtime,
    h.database,
    `INSERT INTO clinical.content_admissibility_evidence(id,release_id,artifact_version,artifact_digest,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,source_evidence_version,source_evidence_sha256,synthetic,status,valid_from,valid_until,version) VALUES(${q(approval)}::uuid,${q(candidate.releaseId)}::uuid,2,decode(${q(candidate.artifactDigest)},'hex'),'synthetic',${q(request.governedContentKey)},${q(request.effectiveScopeKey)},${q(randomUUID())}::uuid,'synthetic-policy-v1',decode(repeat('b',64),'hex'),${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,'synthetic.exact-admission',${q(randomUUID())},NULL,NULL,true,'active','2020-01-01T00:00:00Z',NULL,1);`,
  );
  const offline = await governedOfflineProof(
    h.runtime,
    h.database,
    (identity) => ({ mode: 'isolated-synthetic', sourceIdentity: identity, now }),
    () => {},
  );
  try {
    await offline.admission(approval);
    check('EXACT_NEUTRAL_ADMISSION_ONLY_AFTER_DRAFT');
    checks.push(...offline.results);
  } finally {
    await offline.finish();
  }
  check('ZERO_EXTERNAL_KEY_WORK_UNDER_LOCKS', h.counters().externalUnderLocks === 0);
  return {
    runtime: h.runtime.name,
    serverVersion,
    runtimeIdentity: runtimeManifest(h.runtime),
    health: h.health,
    predecessor: h.predecessor,
    migrations: Object.fromEntries(h.migrations.map((path) => [path, digest(path)])),
    result: 'PASS',
    checks,
    count: checks.length,
    races,
    counters: h.counters(),
    cleanup: 'OWNED_DATABASE_AND_NATIVE_ACCOUNTS',
    syntheticOnly: true,
  };
}
export async function runK15() {
  const gate = await verifyFeature011Contracts();
  assert.equal(gate.result, 'PASS', gate.failures.join('\n'));
  const inputs = Object.fromEntries(paths.map((p) => [p, digest(p)])),
    physical = currentPhysicalSourceDigests(root);
  const results = [];
  for (const runtime of runtimes) {
    console.log(runtime.name + ': K15 clean native create proof');
    results.push(await withContent(runtime, proveCreate));
  }
  for (const [p, h] of Object.entries(inputs)) assert.equal(digest(p), h);
  assert.deepEqual(currentPhysicalSourceDigests(root), physical);
  const proof = {
    checkpoint: 'K15',
    tasks: ['T058', 'T059'],
    result: 'PASS',
    capturedAt: new Date().toISOString(),
    inputs,
    physicalSourceDigests: physical,
    runtimes: results,
    syntheticEngineeringOnly: true,
    realClinicalAdmission: false,
    productionKms: false,
    retainedGates: 'UNCHANGED_OPEN',
    acceptance: 'PENDING_PRODUCT_OWNER',
  };
  const e = f + '/evidence/fresh-implementation/K15';
  mkdirSync(e, { recursive: true });
  for (const n of ['draft-api', 'draft-api-proof'])
    writeFileSync(e + '/' + n + '.json', JSON.stringify(proof, null, 2) + '\n');
  console.log(
    JSON.stringify({
      result: 'PASS',
      runtimes: results.map((r) => ({ runtime: r.runtime, count: r.count, races: r.races.length })),
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await runK15();
