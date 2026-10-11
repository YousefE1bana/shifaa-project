// K11: real native Auth and real application AES over the two isolated databases.
// Control-plane account provisioning is synthetic, narrowly owned and cleaned.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
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
import {
  supabaseStatus,
  authClient,
  currentTotp,
} from '../services/api/test/identity-continuity-mfa-harness.ts';
import { SupabaseAuthIssuer } from '../services/api/src/adapters/supabase-auth.ts';
import { Feature011Allergies } from '../services/api/src/modules/feature-011/allergies.ts';
import { PostgresFeature011Allergies } from '../services/api/src/adapters/postgres/feature-011-allergies.ts';
import { registerFeature011AllergyRoutes } from '../services/api/src/routes/feature-011-allergies.ts';
import { installIdentityErrorHandler } from '../services/api/src/routes/identity-onboarding.ts';
import { installFeature011ExposureGuard } from '../services/api/src/feature-011-exposure.ts';
import { loadConfig } from '../services/api/src/config.ts';
import {
  creationFacts,
  protectAllergy,
} from '../services/api/src/modules/feature-011/allergy-protection.ts';
import { prepareSupport } from '../services/api/src/modules/feature-011/allergy-evidence.ts';
import { executeReceipt } from '../services/api/src/modules/feature-011/mutation-receipts.ts';
import { composeAllergy } from '../services/api/src/modules/feature-011/response-composition.ts';
const require = createRequire(resolve(root, 'services/api/package.json'));
const postgres = require('postgres'),
  Fastify = require('fastify'),
  { createClient } = require('@supabase/supabase-js');
process.chdir(root);
export const patient = 'f0110000-0000-4000-8100-000000000001';
const person = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const facility = 'f0110000-0000-4000-8200-000000000001',
  encounter = 'f0110000-0000-4000-8400-000000000001';
export const report = {
  substance: { identity: 'synthetic-neutral', display: 'K11 neutral test — مادة اختبار' },
  source: { display: 'Synthetic self report / بلاغ تجريبي' },
};
const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
const f = 'specs/011-allergies-clinical-content-governance',
  e = `${f}/evidence/fresh-implementation/K11`;
export const k11Paths = [
  'services/api/src/modules/feature-011/allergies.ts',
  'services/api/src/adapters/postgres/feature-011-allergies.ts',
  'services/api/src/routes/feature-011-allergies.ts',
  'services/api/src/app.ts',
  'services/api/src/modules/feature-011/allergies.test.ts',
  'services/api/src/routes/feature-011-allergies.contract.test.ts',
  'tools/run-feature-011-allergy-api-test.mjs',
];
export async function withAllergyApi(runtime, work, options = {}) {
  return withDatabase(
    runtime,
    async (database) => {
      prepare(runtime, database);
      const health = smoke(runtime, database),
        predecessor = baselineRows(runtime, database);
      const migrations = checkpointMigrations([...storageSlugs, ...consumerSlugs]);
      migrations.forEach((p) => sql(runtime, database, readMigration(p)));
      const after = baselineRows(runtime, database);
      for (const [table, value] of Object.entries(predecessor))
        assert.equal(after[table], value, `Populated predecessor ${table} preserved`);
      sql(runtime, database, readFileSync('infra/db/fixtures/feature-011-k06.sql', 'utf8'));
      const status = supabaseStatus(); // Secrets remain in memory, never evidence/logs.
      const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const ownedUsers = [],
        actors = {};
      const pool = postgres({
        host: '127.0.0.1',
        port: runtime.name === 'shifaa-local-postgres' ? 5432 : 54322,
        database,
        username: 'shifaa_api',
        password: 'synthetic_api_only',
        max: 3,
        prepare: false,
        onnotice() {},
      });
      const nativeUrl = new URL(status.DB_URL);
      nativeUrl.username = 'shifaa_api';
      nativeUrl.password = 'synthetic_api_only';
      const authPool = postgres(nativeUrl.toString(), { max: 1, prepare: false, onnotice() {} });
      let transactions = 0,
        keyPreparations = 0,
        externalUnderLocks = 0,
        sqlSinkChecks = 0,
        fault;
      const transactionContext = new AsyncLocalStorage();
      const key = randomBytes(32),
        keyRef = 'synthetic-local/k11/versions/1';
      const provider = {
        async prepare(_purpose, exact) {
          keyPreparations++;
          if (transactionContext.getStore()?.locked) {
            externalUnderLocks++;
            throw Error('EXTERNAL_KEY_WORK_UNDER_LOCK');
          }
          assert.ok(exact === undefined || exact === keyRef);
          return {
            key: Buffer.from(key),
            keyRef,
            immutable: true,
            release() {
              assert.ok(!transactionContext.getStore()?.locked);
            },
          };
        },
      };
      const guarded = new Proxy(pool, {
        get(target, prop) {
          if (prop !== 'begin') return Reflect.get(target, prop);
          return (callback) =>
            target.begin(async (tx) =>
              transactionContext.run({ locked: true }, async () => {
                transactions++;
                let finalized = false;
                const proxy = new Proxy(tx, {
                  apply(fn, thisArg, args) {
                    const query = args[0].join('');
                    finalized ||= query.includes('f011_finalize_receipt_v1');
                    sqlSinkChecks++;
                    const rendered = JSON.stringify(args.slice(1));
                    for (const forbidden of [
                      report.substance.display,
                      report.source.display,
                      key.toString('hex'),
                      key.toString('base64'),
                      ...(options.forbiddenValues ?? []),
                    ])
                      assert.ok(
                        !rendered.includes(forbidden),
                        'No protected plaintext/key in SQL arguments',
                      );
                    return Reflect.apply(fn, thisArg, args);
                  },
                });
                try {
                  const result = await callback(proxy);
                  if (finalized) await options.afterFinalization?.();
                  if (fault === 'before' && finalized) throw Error('K11_CRASH_BEFORE_COMMIT');
                  return result;
                } finally {
                  transactions--;
                }
              }),
            );
        },
      });
      const repository = new PostgresFeature011Allergies(
        guarded,
        randomBytes(32),
        async (actor, selected) =>
          actor.personId === person(2) && selected === patient
            ? { facilityId: facility, encounterId: encounter }
            : undefined,
      );
      const realStore = repository.receipts;
      const faultStore = {
        probe: (s) => realStore.probe(s),
        replay: (s, w) => realStore.replay(s, w),
        async mutate(s, i, w) {
          await options.beforeMutation?.(s, i);
          const result = await realStore.mutate(s, i, w);
          if (fault === 'after' || fault === 'unknown') throw Error('K11_COMMIT_ACK_LOST');
          return result;
        },
      };
      // Only the runner injects transport/transaction faults; product SQL is unchanged.
      const service = new Feature011Allergies({
        repository: {
          resolve: (...a) => repository.resolve(...a),
          read: (...a) => repository.read(...a),
          receipts: faultStore,
        },
        provider,
        ...options.dependencies?.({ repository, provider, runtime, database }),
      });
      const config = loadConfig({
        NODE_ENV: 'test',
        SHIFAA_SYNTHETIC_MODE: 'true',
        FEATURE_011_ENABLED: 'true',
        FEATURE_011_ISOLATED_TEST: 'true',
        FEATURE_011_KILL_SWITCH: 'false',
        HOST: '127.0.0.1',
      });
      const issuer = new SupabaseAuthIssuer({
        url: status.API_URL,
        anonKey: status.ANON_KEY,
        jwksUrl: `${status.API_URL}/auth/v1/.well-known/jwks.json`,
        issuer: `${status.API_URL}/auth/v1`,
        audience: 'authenticated',
      });
      const native = async (token) => {
        const verified = await issuer.resolveSession(token);
        if (!verified) return undefined;
        const current = await authPool.begin(async (tx) => {
          await tx`SELECT set_config('shifaa.claimed_aal',${`aal${verified.aal}`},true)`;
          const [r] =
            await tx`SELECT platform.auth_session_is_current(${verified.sessionId}::uuid,${verified.subjectId}::uuid) AS current`;
          return r.current;
        });
        if (!current) return undefined;
        const [mapping] =
          await pool`SELECT platform.resolve_person_id(${verified.subjectId}::uuid)::text AS person_id`;
        if (!mapping.person_id) return undefined;
        return {
          kind: 'PAT',
          subjectId: verified.subjectId,
          personId: mapping.person_id,
          principal: mapping.person_id,
          aal: verified.aal,
        };
      };
      const app = Fastify({ logger: false, genReqId: () => randomUUID() });
      installIdentityErrorHandler(app);
      installFeature011ExposureGuard(app, config);
      const owner = (query) => JSON.parse(sql(runtime, database, query).stdout.trim());
      const snapshot = () =>
        owner(
          `SELECT json_build_object('allergies',(SELECT count(*) FROM clinical.allergy_heads),'revisions',(SELECT count(*) FROM clinical.allergies),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'obligations',(SELECT count(*) FROM clinical.mutation_commit_obligations),'idempotency',(SELECT count(*) FROM platform.idempotency_records));`,
        );
      try {
        await issuer.ready();
        for (const [name, n] of [
          ['patient', 1],
          ['clinician', 2],
          ['delegate', 4],
          ['outsider', 8],
          ...(options.additionalActors ?? []),
        ]) {
          const email = `f011-k11-${randomUUID()}@synthetic.shifaa.test`,
            password = randomBytes(24).toString('base64url') + 'Aa!7';
          const created = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (created.error) throw created.error;
          ownedUsers.push(created.data.user.id);
          sql(
            runtime,
            database,
            `UPDATE identity.people SET user_id=${quote(created.data.user.id)}::uuid WHERE id=${quote(person(n))}::uuid;`,
          );
          const client = authClient(status),
            login = await client.auth.signInWithPassword({ email, password });
          if (login.error) throw login.error;
          const enrollment = await client.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'Synthetic K11 only',
          });
          if (enrollment.error) throw enrollment.error;
          const challenge = await client.auth.mfa.challenge({ factorId: enrollment.data.id });
          if (challenge.error) throw challenge.error;
          const verified = await client.auth.mfa.verify({
            factorId: enrollment.data.id,
            challengeId: challenge.data.id,
            code: currentTotp(enrollment.data.totp.secret),
          });
          if (verified.error) throw verified.error;
          const token = verified.data.access_token,
            claims = await native(token);
          assert.equal(claims?.aal, 2);
          assert.equal(claims?.personId, person(n));
          const low = await authClient(status).auth.signInWithPassword({ email, password });
          if (low.error) throw low.error;
          const aal1 = low.data.session.access_token;
          actors[name] = { token, aal1, client, personId: person(n) };
        }
        await registerFeature011AllergyRoutes(app, {
          config,
          service,
          resolveNativePatient: native,
        });
        await options.configureApp?.({app,config,native,pool:guarded,provider,receipts:faultStore,runtime,database,actors});
        await app.ready();
        const headers = (name = 'patient', extra = {}) => ({
          authorization: `Bearer ${actors[name].token}`,
          'x-purpose': 'synthetic.feature011',
          'accept-language': 'en-EG',
          ...extra,
        });
        const request = async (method, payload, options = {}) =>
          app.inject({
            method,
            url: options.url ?? `/v1/patients/${patient}/allergies`,
            headers: headers(options.actor, {
              ...(method === 'POST' ? { 'idempotency-key': options.key ?? randomUUID() } : {}),
              ...options.headers,
            }),
            ...(payload ? { payload } : {}),
          });
        const advance = async (original) => {
          // Test-only composition of the accepted K06/K09 verification consumer. No route.
          const evidenceRef = randomUUID(),
            revisionId = randomUUID(),
            verifiedAt = '2026-10-06T10:00:00.000000Z';
          sql(
            runtime,
            database,
            `INSERT INTO clinical.allergy_verification_support(id,patient_id,allergy_id,previous_revision_id,previous_version,target_status,attestor_person_id,source_identity,source_evidence_identity,producer_id,recorded_at,synthetic) VALUES(${quote(evidenceRef)}::uuid,${quote(patient)}::uuid,${quote(original.allergyId)}::uuid,${quote(original.revisionId)}::uuid,1,'clinician_confirmed',${quote(person(2))}::uuid,'synthetic.internal_clinician_provenance',${quote(evidenceRef)},'f011.allergy_evidence_boundary',${quote(verifiedAt)}::timestamptz,true);`,
          );
          const binding = {
            contractId: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
            profile: 'allergy_verification',
            bindingId: randomUUID(),
            producerId: 'f011.allergy_evidence_boundary',
            verifiedAt,
            evidenceRef,
            patientId: patient,
            allergyId: original.allergyId,
            previousRevisionId: original.revisionId,
            previousVersion: 1,
            revisionId,
            revisionVersion: 2,
            targetStatus: 'clinician_confirmed',
            attestorPersonId: person(2),
            sourceIdentity: 'synthetic.internal_clinician_provenance',
            sourceEvidenceIdentity: evidenceRef,
            synthetic: true,
          };
          const trusted = await prepareSupport(
            {
              mode: 'isolated-synthetic',
              sourceIdentity: binding.sourceIdentity,
              now: () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z'),
            },
            { lookup: async () => ({ ...binding, consumed: false }) },
            binding,
            async () => {
              await repository.resolve(
                {
                  ...(await native(actors.clinician.token)),
                  requestId: randomUUID(),
                  locale: 'en-EG',
                  purposes: ['synthetic.feature011'],
                },
                patient,
                encounter,
              );
            },
          );
          const facts = await creationFacts(report, async () => {
              throw Error('Unexpected known coding');
            }),
            reason = {
              contractId: 'SHIFAA-F011-ALLERGY-REASON/1',
              reason: 'Synthetic test history only',
            };
          const encrypted = await protectAllergy(
            provider,
            { allergyId: original.allergyId, revisionId, revisionVersion: 2 },
            facts,
            reason,
          );
          const prepared = {
            patientId: patient,
            allergyId: original.allergyId,
            revisionId,
            revisionVersion: 2,
            previousRevisionId: original.revisionId,
            facts,
            reason,
            ...encrypted,
          };
          const input = {
            responseLanguage: 'en-EG',
            responseRequestId: randomUUID(),
            preparation: {
              protectedRevision: {
                allergyId: prepared.allergyId,
                revisionId,
                revisionVersion: 2,
                previousRevisionId: original.revisionId,
                ...encrypted,
              },
              verifiedEvidence: trusted,
            },
          };
          const scope = {
            operationId: 'verifyAllergy',
            targetId: original.allergyId,
            patientId: patient,
            contentType: '',
            expectedVersion: 1,
            input,
            context: {
              environment: 'local',
              person_id: person(2),
              actor_role: 'CLN',
              aal: '2',
              purposes: 'synthetic.feature011',
              facility_id: facility,
              encounter_id: encounter,
              request_id: input.responseRequestId,
              idempotency_key: randomUUID(),
              request_hash: 'a'.repeat(64),
            },
          };
          const result = await executeReceipt(scope, {
            store: realStore,
            provider,
            authorize: async () => {},
            authorizeDisclosure: async () => {},
            prepare: async () => ({
              input,
              compose: (meta, projection) => composeAllergy(prepared, meta, projection),
              dispose() {},
            }),
          });
          assert.equal(JSON.parse(result.body).version, 2);
        };
        const result = await work({
          app,
          config,
          runtime,
          database,
          health,
          predecessor,
          migrations,
          actors,
          request,
          headers,
          snapshot,
          owner,
          repository,
          provider,
          service,
          native,
          advance,
          setFault: (value) => {
            fault = value;
          },
          counters: () => ({ keyPreparations, externalUnderLocks, sqlSinkChecks }),
        });
        return result;
      } finally {
        await app.close();
        await pool.end({ timeout: 5 });
        await authPool.end({ timeout: 5 });
        key.fill(0);
        for (const id of ownedUsers) {
          const removed = await admin.auth.admin.deleteUser(id);
          if (removed.error) throw removed.error;
        }
      }
    },
    'K08',
  ); // Reuse the exact approved temporary namespace, never shared reset.
}
async function prove(h) {
  const results = [],
    check = (id, condition) => {
      assert.ok(condition, id);
      results.push({ id, result: 'PASS' });
    };
  const expected = async (id, status, work, unchanged = true) => {
    const before = h.snapshot();
    const r = await work();
    assert.equal(r.statusCode, status, `${id}: ${r.body}`);
    if (unchanged) assert.deepEqual(h.snapshot(), before);
    results.push({ id, result: 'PASS', status });
    return r;
  };
  const empty = await expected('EMPTY_NATIVE_READ', 200, () => h.request('GET'));
  check('EMPTY_NOT_ALLERGY_FREE', empty.json().data.length === 0);
  const key = randomUUID(),
    original = await expected('PAT_REPORT', 201, () => h.request('POST', report, { key }), false),
    body = original.json();
  check(
    'INITIAL_SELF_REPORTED_UNKNOWN',
    body.status === 'self_reported' &&
      body.coding.knowledge === 'unknown' &&
      body.verification === null,
  );
  check(
    'ORIGINAL_HEADERS',
    original.headers.etag === '"1"' &&
      original.headers['cache-control'] === 'private, no-store' &&
      original.headers['content-language'] === 'en-EG',
  );
  await expected(
    'CLINICIAN_CREATION_SELF_REPORTED',
    201,
    async () => {
      const r = await h.request(
        'POST',
        { ...report, encounterId: encounter },
        { actor: 'clinician' },
      );
      assert.equal(r.json().status, 'self_reported');
      return r;
    },
    false,
  );
  for (const actor of ['patient', 'clinician', 'delegate']) {
    const read = await expected(`AUTHORIZED_${actor}_READ`, 200, () =>
      h.request('GET', undefined, { actor }),
    );
    check(
      `${actor}_SCOPED_PLAINTEXT_ONLY`,
      read.json().data.some((v) => v.substance.display === report.substance.display) &&
        !read.body.includes('keyRef') &&
        !read.body.includes('ciphertext'),
    );
  }
  await expected('DELEGATE_READ_ONLY', 403, () => h.request('POST', report, { actor: 'delegate' }));
  await expected('CROSS_PATIENT_DENIAL', 403, () =>
    h.request('GET', undefined, { actor: 'outsider' }),
  );
  await expected('NATIVE_AAL1_DENIAL_CLIENT_HEADER_CANNOT_ELEVATE', 403, () =>
    h.request('GET', undefined, {
      headers: { authorization: `Bearer ${h.actors.patient.aal1}`, 'x-aal': '2' },
    }),
  );
  await expected('MISSING_PURPOSE', 403, () =>
    h.request('GET', undefined, { headers: { 'x-purpose': '' } }),
  );
  await expected('WRONG_CURRENT_CARE_CONTEXT', 403, () =>
    h.request('POST', { ...report, encounterId: randomUUID() }, { actor: 'clinician' }),
  );
  await expected('KNOWN_WITHOUT_SOURCE', 422, () =>
    h.request('POST', {
      ...report,
      coding: { knowledge: 'known', value: { system: 'synthetic', code: 'X', display: 'Neutral' } },
    }),
  );
  const first = await h.request('GET', undefined, {
    url: `/v1/patients/${patient}/allergies?limit=1`,
  });
  assert.equal(first.statusCode, 200);
  assert.ok(first.json().meta.nextCursor);
  const cursor = encodeURIComponent(first.json().meta.nextCursor);
  const second = await expected('EXACT_OPAQUE_CURSOR', 200, () =>
    h.request('GET', undefined, {
      url: `/v1/patients/${patient}/allergies?limit=1&cursor=${cursor}`,
    }),
  );
  check(
    'CURSOR_NO_DUPLICATE',
    first.json().data[0].revisionId !== second.json().data[0].revisionId,
  );
  await expected('CURSOR_CONTEXT_SUBSTITUTION', 422, () =>
    h.request('GET', undefined, {
      actor: 'delegate',
      url: `/v1/patients/${patient}/allergies?limit=1&cursor=${cursor}`,
    }),
  );
  await expected('CURSOR_TAMPER', 422, () =>
    h.request('GET', undefined, {
      url: `/v1/patients/${patient}/allergies?limit=1&cursor=${cursor}x`,
    }),
  );
  await h.advance(body);
  const current = await h.request('GET');
  check(
    'RESOURCE_ADVANCED',
    current.json().data.some((v) => v.allergyId === body.allergyId && v.version === 2),
  );
  const beforeReplay = h.snapshot(),
    beforeKeys = h.counters().keyPreparations;
  const replay = await h.request('POST', report, { key });
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.body, original.body);
  assert.equal(replay.headers['x-request-id'], original.headers['x-request-id']);
  assert.equal(replay.headers.etag, original.headers.etag);
  check('ORIGINAL_REPLAY_AFTER_ADVANCEMENT', true);
  assert.deepEqual(h.snapshot(), beforeReplay);
  check(
    'NO_SECOND_EFFECT_AUDIT_OUTBOX_RECEIPT_CRYPTO',
    h.counters().keyPreparations - beforeKeys === 1,
  ); // One receipt DECRYPT capability only; zero new encryption.
  const conflict = await expected('CHANGED_BINDING_CONFLICT', 409, () =>
    h.request('POST', { ...report, source: { display: 'Different binding' } }, { key }),
  );
  check('EXACT_IDEMPOTENCY_PROBLEM', conflict.json().code === 'idempotency-key-reused');
  for (const mode of ['before', 'after', 'unknown']) {
    const retryKey = randomUUID(),
      before = h.snapshot();
    h.setFault(mode);
    await expected(
      `CRASH_${mode}`,
      500,
      () => h.request('POST', report, { key: retryKey }),
      mode === 'before',
    );
    h.setFault(undefined);
    const settled = h.snapshot(),
      preparations = h.counters().keyPreparations;
    const retry = await h.request('POST', report, { key: retryKey });
    assert.equal(retry.statusCode, 201, retry.body);
    if (mode === 'before') {
      check('BEFORE_COMMIT_FULL_ROLLBACK', settled.allergies === before.allergies);
      check('BEFORE_COMMIT_RETRY_FRESH_ONCE', h.snapshot().allergies === before.allergies + 1);
    } else {
      assert.deepEqual(h.snapshot(), settled);
      check(
        `${mode}_AUTHORITATIVE_SETTLEMENT_NO_SECOND_CRYPTO`,
        h.counters().keyPreparations - preparations === 1,
      );
    }
  }
  const prior = h.counters().keyPreparations;
  sql(
    h.runtime,
    h.database,
    `UPDATE identity.facility_memberships SET membership_status='suspended' WHERE person_id=${quote(person(2))}::uuid;`,
  );
  await expected('LOST_CURRENT_FACILITY_AUTHORITY', 403, () =>
    h.request('GET', undefined, { actor: 'clinician' }),
  );
  check('LOST_AUTHORITY_NO_DECRYPT', h.counters().keyPreparations === prior);
  sql(
    h.runtime,
    h.database,
    `UPDATE identity.facility_memberships SET membership_status='active' WHERE person_id=${quote(person(2))}::uuid;`,
  );
  await h.actors.patient.client.auth.signOut({ scope: 'local' });
  await expected('NATIVE_REVOKED_DENIAL', 401, () => h.request('POST', report, { key }));
  h.config.feature011KillSwitch = true;
  await expected('KILL_NO_QUEUE', 503, () => h.request('POST', report, { actor: 'clinician' }));
  h.config.feature011KillSwitch = false;
  const roles = h.owner(
    `SELECT json_agg(json_build_object('role',rolname,'super',rolsuper,'bypass',rolbypassrls,'login',rolcanlogin)) FROM pg_roles WHERE rolname IN ('shifaa_api','shifaa_f011_executor');`,
  );
  check(
    'ONLINE_NONOWNER_NO_SUPER_BYPASS',
    roles.length === 2 &&
      roles.every((r) => !r.super && !r.bypass) &&
      roles.find((r) => r.role === 'shifaa_f011_executor').login === false,
  );
  check(
    'NO_EXTERNAL_WORK_UNDER_LOCKS',
    h.counters().externalUnderLocks === 0 && h.counters().sqlSinkChecks > 0,
  );
  const final = h.snapshot();
  check(
    'ALL_FIVE_DURABLE',
    final.receipts === final.obligations &&
      final.receipts === final.idempotency &&
      final.audit === final.receipts &&
      final.outbox === final.receipts,
  );
  return {
    runtime: h.runtime.name,
    health: h.health,
    result: 'PASS',
    tests: results,
    count: results.length,
    roles,
    durable: final,
    counters: h.counters(),
    predecessorPreserved: true,
    nativeAuth: 'Supabase ES256 + native current-session predicate; AAL2 via real TOTP',
    mutations: ['createAllergy'],
    read: 'listAllergies',
    advancement: 'Accepted internal verification consumer, no verification route',
    faultBoundary: 'Injected before actual commit / after actual commit ACK loss',
    syntheticClinical: true,
    productionKms: false,
  };
}
export async function runK11({ evidenceDirectory = e } = {}) {
  const contracts = await verifyFeature011Contracts({ root });
  assert.equal(contracts.result, 'PASS', JSON.stringify(contracts.failures));
  const sources = Object.fromEntries(
    [...k11Paths, ...checkpointMigrations([...storageSlugs, ...consumerSlugs])].map((p) => [
      p,
      digest(p),
    ]),
  );
  const results = [];
  for (const runtime of runtimes) {
    console.log(`${runtime.name}: clean K11 native/application proof`);
    results.push(await withAllergyApi(runtime, prove));
  }
  for (const [p, hash] of Object.entries(sources)) assert.equal(digest(p), hash);
  const evidence = {
    checkpoint: 'K11',
    tasks: ['T045', 'T046', 'T047'],
    result: 'PASS',
    generatedAt: new Date().toISOString(),
    inputs: sources,
    runtimes: results,
    scope:
      'Read/report only; exact seven-operation catalog unchanged; no Feature012; no production/clinical approval',
    retainedGates: 'Unchanged; all retained OPEN gates remain open',
  };
  mkdirSync(evidenceDirectory, { recursive: true });
  for (const name of ['allergy-read-create.json', 'allergy-routes.json', 'allergy-api-proof.json'])
    writeFileSync(`${evidenceDirectory}/${name}`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(
    JSON.stringify({
      result: 'PASS',
      counts: results.map((r) => ({ runtime: r.runtime, tests: r.count })),
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await runK11();
