import { testRuntime } from './verification-database.mjs';
// Real local application AES composition over isolated approved SQL. Neutral
// synthetic authority/material only; no production KMS/evidence authenticity.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  root,
  runtimes,
  withDatabase,
  prepare,
  smoke,
  sql,
  readMigration,
  digest,
} from './run-feature-011-postgres-test.mjs';
import {
  checkpointMigrations,
  storageSlugs,
  consumerSlugs,
  baselineRows,
} from './run-feature-011-storage-test.mjs';
import { verifyFeature011Contracts } from './verify-feature-011-contracts.mjs';
import { protectionComponents } from './feature-011-protection-fixtures.mjs';
import { PostgresFeature011Receipts } from '../services/api/src/adapters/postgres/feature-011-receipts.ts';
import { executeReceipt } from '../services/api/src/modules/feature-011/mutation-receipts.ts';
import {
  protectRelease,
  releaseAad,
} from '../services/api/src/modules/feature-011/release-protection.ts';
import {
  protectAllergy,
  reconstructAllergy,
  creationFacts,
  correctedFacts,
} from '../services/api/src/modules/feature-011/allergy-protection.ts';
import {
  composeAllergy,
  composeGovernance,
} from '../services/api/src/modules/feature-011/response-composition.ts';
import { prepareCapability } from '../services/api/src/modules/feature-011/protection.ts';
const req = createRequire(resolve(root, 'services/api/package.json')),
  postgres = req('postgres');
process.chdir(root);
const f = 'specs/011-allergies-clinical-content-governance',
  e = `${f}/evidence/fresh-implementation/K08`;
const fixed = JSON.parse(readFileSync(`${f}/contracts/artifact-canonicalization-v1-vectors.json`))
  .positive[0];
const material = Object.fromEntries(
  Object.entries(fixed.materialBytesHex).map(([k, v]) => [k, Buffer.from(v, 'hex')]),
);
const review = {
  content: material.content.toString(),
  code: material.code.toString(),
  testVectors: material.testVectors.toString(),
};
const patient = 'f0110000-0000-4000-8100-000000000001';
const person = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
const json = (v) => `${quote(JSON.stringify(v))}::jsonb`;
const ownerJson = (runtime, db, query) => JSON.parse(sql(runtime, db, query).stdout.trim());
const sourcePaths = [
  'tools/run-feature-011-protection-test.mjs',
  'tools/feature-011-protection-fixtures.mjs',
  ...[
    'protection',
    'release-protection',
    'allergy-protection',
    'mutation-receipts',
    'response-composition',
  ].map((n) => `services/api/src/modules/feature-011/${n}.ts`),
  'services/api/src/adapters/postgres/feature-011-receipts.ts',
];
const sourceDigests = () => Object.fromEntries(sourcePaths.map((p) => [p, digest(p)]));

async function prove(runtime, database) {
  prepare(runtime, database);
  const health = smoke(runtime, database),
    predecessors = baselineRows(runtime, database);
  const migrations = checkpointMigrations([...storageSlugs, ...consumerSlugs]);
  migrations.forEach((p) => sql(runtime, database, readMigration(p)));
  const after = baselineRows(runtime, database);
  for (const [table, expected] of Object.entries(predecessors))
    assert.equal(after[table], expected, `Populated predecessor ${table} preserved`);
  sql(runtime, database, readFileSync('infra/db/fixtures/feature-011-k06.sql', 'utf8'));
  const pool = postgres({
    host: '127.0.0.1',
    port: testRuntime(runtime.name === 'shifaa-local-postgres' ? 'postgres' : 'supabase').port,
    database,
    username: 'shifaa_api',
    password: 'synthetic_api_only',
    max: 2,
    prepare: false,
    onnotice: () => {},
    connect_timeout: 10,
    idle_timeout: 2,
  });
  let phase = 'outside',
    externalUnderLocks = 0,
    keyPreparations = 0,
    keyReleases = 0;
  const key = randomBytes(32),
    keyRef = 'synthetic-kms/k08/versions/1';
  let activeFault,
    sqlArgumentChecks = 0,
    activeTransactions = 0;
  const provider = {
    async prepare(_purpose, exact) {
      keyPreparations++;
      if (phase === 'locked' || activeTransactions) {
        externalUnderLocks++;
        throw Error('EXTERNAL_UNDER_LOCKS');
      }
      assert.ok(exact === undefined || exact === keyRef);
      return {
        key: Buffer.from(key),
        keyRef,
        immutable: true,
        release() {
          keyReleases++;
          assert.equal(activeTransactions, 0);
          assert.notEqual(phase, 'locked');
        },
      };
    },
  };
  const guardedPool = new Proxy(pool, {
    get(target, property) {
      if (property !== 'begin') return Reflect.get(target, property);
      return async (callback) =>
        target.begin(async (tx) => {
          activeTransactions++;
          let finalized = false;
          const checkArgs = (query, args) => {
            sqlArgumentChecks++;
            if (query.includes('f011_finalize_receipt_v1')) finalized = true;
            const rendered = JSON.stringify(args);
            for (const forbidden of [
              'K08-NEUTRAL-FACT',
              'K08-NEUTRAL-REASON',
              review.content,
              key.toString('hex'),
              key.toString('base64'),
            ])
              assert.ok(
                !rendered.includes(forbidden),
                'SQL arguments contain no protected plaintext/key',
              );
          };
          const guardedTx = new Proxy(tx, {
            apply(fn, thisArg, args) {
              checkArgs(args[0].join(''), args.slice(1));
              return Reflect.apply(fn, thisArg, args);
            },
            get(fn, p) {
              if (p !== 'unsafe') return Reflect.get(fn, p);
              return (query, args) => {
                checkArgs(query, args);
                return fn.unsafe(query, args);
              };
            },
          });
          try {
            const returned = await callback(guardedTx);
            if (activeFault === 'before-commit' && finalized)
              throw Error('K08_BEFORE_COMMIT_FAULT');
            return returned;
          } finally {
            activeTransactions--;
          }
        });
    },
  });
  const store = new PostgresFeature011Receipts(guardedPool),
    preparedAllergies = new Map(),
    preparedReviews = new Map(),
    responses = new Map(),
    records = [];
  const snapshot = () =>
    ownerJson(
      runtime,
      database,
      `SELECT json_build_object('allergies',(SELECT count(*) FROM clinical.allergies),'releases',(SELECT count(*) FROM clinical.content_releases),'signatures',(SELECT count(*) FROM audit.signature_evidence),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'obligations',(SELECT count(*) FROM clinical.mutation_commit_obligations),'idempotency',(SELECT count(*) FROM platform.idempotency_records));`,
    );
  const context = (sample) => ({
    environment: 'local',
    person_id: person(sample.n),
    actor_role: sample.role,
    aal: '2',
    purposes: 'synthetic.feature011',
    facility_id: sample.role === 'PAT' ? '' : 'f0110000-0000-4000-8200-000000000001',
    encounter_id: sample.role === 'CLN' ? 'f0110000-0000-4000-8400-000000000001' : '',
    request_id: sample.input.responseRequestId,
    idempotency_key: sample.key,
    request_hash: 'a'.repeat(64),
  });
  const scopeFor = (sample) => {
    const match = sample.expression.match(/api_v1\('([^']+)'(?:::uuid)?,(?:(\d+),)?/);
    assert.ok(match, 'Exact fixture operation args');
    return {
      operationId: sample.action,
      targetId:
        sample.action === 'createClinicalContentRelease'
          ? (fixed.facts?.releaseId ?? '11111111-1111-4111-8111-111111111111')
          : match[1],
      contentType: 'synthetic',
      expectedVersion: Number(match[2] ?? 1),
      patientId: patient,
      input: sample.input,
      context: context(sample),
    };
  };
  const prepareMutation = async (sample, scope) => {
    assert.equal(phase, 'outside');
    const input = structuredClone(sample.input);
    // Failed fresh attempts allocate fresh IDs as well as fresh nonces. The
    // committed fixture uses its pinned IDs solely for later lineage assertions.
    if (scope.context.idempotency_key !== sample.key) {
      if (sample.action === 'createAllergy') {
        input.preparation.allergyId = randomUUID();
        input.preparation.revisionId = randomUUID();
      }
      if (sample.action === 'verifyAllergy') {
        input.preparation.protectedRevision.revisionId = randomUUID();
        input.preparation.verifiedEvidence.revisionId =
          input.preparation.protectedRevision.revisionId;
        input.preparation.verifiedEvidence.bindingId = randomUUID();
      }
      if (sample.action === 'createClinicalContentRelease') {
        input.handoff.allocation.releaseId = randomUUID();
        for (const binding of Object.values(input.materialBindings)) {
          binding.releaseId = input.handoff.allocation.releaseId;
          binding.bindingId = randomUUID();
        }
      }
    }
    let composed;
    if (sample.action.includes('Allergy')) {
      const revision =
        sample.action === 'createAllergy' ? input.preparation : input.preparation.protectedRevision;
      let facts,
        reason = null;
      if (sample.action === 'createAllergy')
        facts = await creationFacts(
          {
            substance: { identity: 'synthetic:neutral', display: 'K08-NEUTRAL-FACT-اختبار' },
            source: { display: 'K08-NEUTRAL-SOURCE' },
          },
          async () => {
            throw Error('K09 unavailable');
          },
        );
      else {
        const old = preparedAllergies.get(revision.previousRevisionId);
        assert.ok(old);
        const restored = await reconstructAllergy(
          provider,
          {
            allergyId: old.allergyId,
            revisionId: old.revisionId,
            revisionVersion: old.revisionVersion,
          },
          old,
          async () => {
            assert.equal(sample.role, 'CLN');
          },
        );
        facts = await correctedFacts(restored.facts, {}, async () => {
          throw Error('K09 unavailable');
        });
        reason = {
          contractId: 'SHIFAA-F011-ALLERGY-REASON/1',
          reason: 'K08-NEUTRAL-REASON-اختبار',
        };
      }
      const encrypted = await protectAllergy(
        provider,
        {
          allergyId: revision.allergyId,
          revisionId: revision.revisionId,
          revisionVersion: revision.revisionVersion,
        },
        facts,
        reason,
      );
      Object.assign(revision, encrypted);
      const prepared = { ...revision, patientId: patient, facts, reason };
      preparedAllergies.set(revision.revisionId, prepared);
      composed = (meta, projection) => composeAllergy(prepared, meta, projection);
    } else if (sample.action === 'createClinicalContentRelease') {
      const h = input.handoff;
      h.protectedBody = await protectRelease(
        provider,
        { resourceId: h.allocation.releaseId, artifactVersion: h.allocation.artifactVersion },
        material.content,
        material.content,
      );
      const cap = await prepareCapability(provider, 'body', 'decrypt', keyRef);
      try {
        const plain = cap.decrypt(
          h.protectedBody,
          releaseAad({
            resourceId: h.allocation.releaseId,
            artifactVersion: h.allocation.artifactVersion,
            keyRef,
          }),
        );
        assert.ok(plain.equals(material.content));
        plain.fill(0);
      } finally {
        cap.dispose();
      }
      const bindings = Object.fromEntries(
        ['content', 'code', 'testVectors'].map((k) => [
          k,
          {
            reference: h.trustedEvidence[k].reference,
            verifiedSha256: h.trustedEvidence[k].verifiedSha256,
          },
        ]),
      );
      const prepared = {
        releaseId: h.allocation.releaseId,
        artifactVersion: h.allocation.artifactVersion,
        artifactDigest: h.declaredDigest,
        protectedBody: h.protectedBody,
        artifactReview: review,
        bindings,
      };
      preparedReviews.set(prepared.releaseId, prepared);
      composed = (meta, projection) => composeGovernance(prepared, meta, projection);
    } else if (sample.action === 'publishClinicalContentRelease') {
      const prepared = preparedReviews.get(scope.targetId);
      assert.ok(prepared);
      composed = (meta, projection) => composeGovernance(prepared, meta, projection);
    } else composed = (_meta, projection) => projection;
    return { input, compose: composed, dispose() {} };
  };
  const dependencies = (sample, scope, fault) => ({
    provider,
    authorize: async () => {
      assert.equal(phase, 'outside');
      assert.equal(scope.context.person_id, person(sample.n));
    },
    authorizeDisclosure: async () => {
      assert.equal(phase, 'outside');
    },
    prepare: async () => prepareMutation(sample, scope),
    store: {
      probe: (s) => store.probe(s),
      replay: (s, work) => store.replay(s, work),
      mutate: async (s, input, work) => {
        phase = 'locked';
        activeFault = fault;
        try {
          const committed = await store.mutate(s, input, (meta, projection) => {
            if (fault === 'compose') throw Error('K08_COMPOSE_FAULT');
            const result = work(meta, projection);
            if (fault === 'encrypt') throw Error('K08_ENCRYPT_FAULT');
            if (fault === 'finalizer') result.envelope = { ...result.envelope, authTag: '00' };
            records.push({ operation: sample.action, meta, nonce: result.envelope.nonce });
            return result;
          });
          if (fault === 'commit-unknown') throw Error('K08_COMMIT_ACK_LOST');
          return committed;
        } finally {
          phase = 'outside';
          activeFault = undefined;
        }
      },
    },
  });
  let faultCases = 0,
    replayCases = 0,
    commitUnknownCases = 0,
    unknownLookupCases = 0,
    replayCryptoNegatives = 0;
  try {
    const components = await protectionComponents(runtime, database, async (sample) => {
      const scope = scopeFor(sample),
        before = snapshot();
      // Four application faults after the domain phase per fresh mutation.
      if (!responses.has(sample.key))
        for (const fault of ['compose', 'encrypt', 'finalizer', 'before-commit']) {
          const failedScope = {
            ...scope,
            context: { ...scope.context, idempotency_key: randomUUID() },
          };
          await assert.rejects(
            executeReceipt(failedScope, dependencies(sample, failedScope, fault)),
            (error) =>
              fault === 'finalizer'
                ? error.code === '22023' &&
                  /envelope|protection|authTag|byte|shape/i.test(error.message)
                : error.message === `K08_${fault.toUpperCase().replaceAll('-', '_')}_FAULT`,
          );
          assert.deepEqual(snapshot(), before, `${fault} entire mutation rollback`);
          faultCases++;
        }
      if (!responses.has(sample.key)) {
        const deps = dependencies(sample, scope),
          preparations = keyPreparations;
        await assert.rejects(
          executeReceipt(scope, {
            ...deps,
            store: {
              ...deps.store,
              probe: async () => {
                throw Error('K08_LOOKUP_OUTAGE_UNKNOWN');
              },
            },
          }),
          /K08_LOOKUP_OUTAGE_UNKNOWN/,
        );
        assert.equal(keyPreparations, preparations);
        assert.deepEqual(snapshot(), before);
        unknownLookupCases++;
        await assert.rejects(
          executeReceipt(scope, dependencies(sample, scope, 'commit-unknown')),
          /K08_COMMIT_ACK_LOST/,
        );
        commitUnknownCases++;
      }
      const result = await executeReceipt(scope, {
        ...dependencies(sample, scope),
        prepare: async () => {
          throw Error('UNKNOWN_COMMIT_MUST_SETTLE_BEFORE_PROTECTION');
        },
      });
      const parsed = JSON.parse(result.body.toString());
      const previous = responses.get(sample.key);
      if (previous) {
        assert.deepEqual(result, previous);
        assert.deepEqual(snapshot(), before);
        replayCases++;
      } else responses.set(sample.key, { ...result, body: Buffer.from(result.body) });
      const meta = await store.probe(scope);
      assert.ok(meta);
      const committedState = snapshot();
      for (const negative of ['tamper', 'wrong-key', 'version', 'context', 'disclosure-denied']) {
        const deps = dependencies(sample, scope);
        const corrupt = (record) => {
          const copy = structuredClone(record);
          if (negative === 'tamper') {
            const tag = copy.receiptEnvelope.authTag;
            copy.receiptEnvelope.authTag = (tag.startsWith('ff') ? '00' : 'ff') + tag.slice(2);
          }
          if (negative === 'version') {
            copy.responseResourceVersion = Number(copy.responseResourceVersion) + 1;
            copy.responseETag = `"${copy.responseResourceVersion}"`;
          }
          if (negative === 'context') copy.responseRequestId = randomUUID();
          return copy;
        };
        const beforeKeys = keyPreparations;
        const negativeDeps = {
          ...deps,
          store: {
            ...deps.store,
            probe: async (s) => corrupt(await store.probe(s)),
            replay: (s, work) => store.replay(s, (record) => work(corrupt(record))),
          },
        };
        if (negative === 'wrong-key')
          negativeDeps.provider = {
            async prepare() {
              assert.equal(activeTransactions, 0);
              return { key: randomBytes(32), keyRef, immutable: true, release() {} };
            },
          };
        if (negative === 'disclosure-denied')
          negativeDeps.authorizeDisclosure = async () => {
            throw Error('K08_EXACT_DISCLOSURE_DENIED');
          };
        await assert.rejects(
          executeReceipt(scope, negativeDeps),
          negative === 'disclosure-denied'
            ? /K08_EXACT_DISCLOSURE_DENIED/
            : /Feature 011 protection denied/,
        );
        if (negative === 'disclosure-denied') assert.equal(keyPreparations, beforeKeys);
        assert.deepEqual(snapshot(), committedState);
        replayCryptoNegatives++;
      }
      // Original receipt replay after a known commit, with no fresh producer.
      const preparations = keyPreparations,
        replayed = await executeReceipt(scope, {
          ...dependencies(sample, scope),
          prepare: async () => {
            throw Error('REPLAY_ENCRYPTION_FORBIDDEN');
          },
        });
      assert.deepEqual(replayed, result);
      assert.equal(keyPreparations, preparations + 1);
      replayCases++;
      return {
        domain: {
          receiptId: meta.receiptId,
          resourceId: meta.targetResourceId,
          resourceVersion: Number(meta.responseResourceVersion),
          responseLanguage: meta.responseLanguage,
          responseRequestId: meta.responseRequestId,
          replay: Boolean(previous),
        },
        finalizer: { featureReceiptId: meta.receiptId },
        publicResponse: parsed,
      };
    });
    const state = snapshot();
    assert.equal(state.receipts, state.obligations);
    assert.equal(
      new Set(records.map((record) => record.nonce)).size,
      records.length,
      'Fresh receipt nonces across failed and committed attempts',
    );
    assert.deepEqual(
      [...new Set(records.map((record) => record.operation))].sort(),
      [
        'createAllergy',
        'verifyAllergy',
        'createClinicalContentRelease',
        'signClinicalContentRelease',
        'publishClinicalContentRelease',
      ].sort(),
    );
    assert.equal(externalUnderLocks, 0);
    assert.equal(keyPreparations, keyReleases);
    const sinks = sql(
      runtime,
      database,
      `SELECT json_build_object('audit',(SELECT json_agg(to_jsonb(t)) FROM audit.events t),'outbox',(SELECT json_agg(to_jsonb(t)) FROM platform.outbox_events t),'idempotency',(SELECT json_agg(to_jsonb(t)) FROM platform.idempotency_records t));`,
    ).stdout;
    for (const forbidden of [
      'K08-NEUTRAL-FACT',
      'K08-NEUTRAL-REASON',
      review.content,
      key.toString('hex'),
      key.toString('base64'),
      keyRef,
    ])
      assert.ok(!sinks.includes(forbidden), 'Forbidden sink material absent');
    return {
      result: 'PASS',
      runtime: runtime.name,
      serverVersion: health.manifest.serverVersion,
      actualOnlineRole: 'shifaa_api',
      migrations: Object.fromEntries(migrations.map((p) => [p, digest(p)])),
      sourceDigests: sourceDigests(),
      components: components.results,
      realMutationOperations: [...new Set(records.map((r) => r.operation))],
      faultCases,
      replayCases,
      commitUnknownCases,
      unknownLookupCases,
      replayCryptoNegatives,
      sqlArgumentChecks,
      durableCounts: state,
      keyPreparations,
      keyReleases,
      externalNetworkKmsUnderLocks: externalUnderLocks,
      roundtrip:
        'Exact intended frozen neutral BODY and closed allergy plaintext; every complete response authenticated in actual SQL receipt',
      syntheticAuthorityAndEvidenceOnly: true,
      productionKmsAccepted: false,
    };
  } finally {
    key.fill(0);
    responses.forEach((r) => r.body.fill(0));
    await pool.end({ timeout: 5 });
  }
}
const gate = await verifyFeature011Contracts();
assert.equal(gate.result, 'PASS', gate.failures.join('\n'));
const frozenSources = sourceDigests();
mkdirSync(`${e}/runtime`, { recursive: true });
const results = [];
for (const runtime of runtimes) {
  const captured = await withDatabase(runtime, (database) => prove(runtime, database), 'K08');
  results.push(captured);
  assert.deepEqual(
    sourceDigests(),
    frozenSources,
    'No implementation/test drift during either runtime proof',
  );
  writeFileSync(
    `${e}/runtime/${runtime.name}-protection.json`,
    JSON.stringify(captured, null, 2) + '\n',
  );
  console.log(`${runtime.name}: real producer composition PASS`);
}
writeFileSync(
  `${e}/protection-proof.json`,
  JSON.stringify(
    {
      checkpoint: 'K08',
      tasks: ['T030', 'T031', 'T032', 'T033', 'T034'],
      result: 'PASS',
      sourceDigests: sourceDigests(),
      results,
      retainedGates:
        'All OPEN gates retained; no production KMS, source authenticity or clinical approval',
    },
    null,
    2,
  ) + '\n',
);
