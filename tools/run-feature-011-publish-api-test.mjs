// K17 actual native publication, exact historical/current SQL basis and independent locks.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { withSigning } from './run-feature-011-sign-api-test.mjs';
import { request as initial } from './run-feature-011-content-api-test.mjs';
import { Feature011Publication } from '../services/api/src/modules/feature-011/publish-release.ts';
import { governedOfflineProof } from './feature-011-offline-proof.mjs';
import { runtimes, root, sql, digest, runtimeManifest } from './run-feature-011-postgres-test.mjs';
import { session, marker } from './run-feature-011-concurrency-test.mjs';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
} from './verify-feature-011-contracts.mjs';
const f = 'specs/011-allergies-clinical-content-governance',
  q = (v) => "'" + String(v).replaceAll("'", "''") + "'",
  person = (n) => 'f0110000-0000-4000-8000-' + String(n).padStart(12, '0'),
  now = () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
const paths = [
  'services/api/src/modules/feature-011/publish-release.ts',
  'services/api/src/modules/feature-011/publish-release.test.ts',
  'services/api/src/modules/feature-011/content-eligibility.ts',
  'services/api/src/modules/feature-011/create-release.ts',
  'services/api/src/modules/feature-011/material-evidence.ts',
  'services/api/src/adapters/postgres/feature-011-content.ts',
  'services/api/src/routes/feature-011-content.ts',
  'services/api/src/app.ts',
  'tools/run-feature-011-publish-api-test.mjs',
  'tools/run-feature-011-sign-api-test.mjs',
  'tools/run-feature-011-content-api-test.mjs',
];
const sessions = new Set();
function state(h) {
  return h.owner(
    `SELECT json_build_object('published',(SELECT count(*) FROM clinical.content_releases WHERE status='published'),'signatures',(SELECT count(*) FROM audit.signature_evidence WHERE resource_type='clinical.content_release'),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'obligations',(SELECT count(*) FROM clinical.mutation_commit_obligations),'completed',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed'));`,
  );
}
function row(h, id) {
  return h.owner(
    `SELECT json_build_object('releaseId',r.id,'artifactVersion',r.artifact_version,'artifactDigest',encode(r.artifact_digest,'hex'),'workflowVersion',r.workflow_version,'status',r.status,'effectiveAt',r.effective_at,'contentType',s.content_type,'governedContentKey',s.governed_content_key,'effectiveScopeKey',s.effective_scope_key) FROM clinical.content_releases r JOIN clinical.content_series s ON s.id=r.series_id WHERE r.id=${q(id)}::uuid;`,
  );
}
function eligible(h, id) {
  return h.owner(`SELECT to_json(clinical.f011_release_current_eligibility_v1(${q(id)}::uuid));`);
}
function history(h, id) {
  return h.owner(
    `SELECT json_build_object('artifact',json_build_object('id',r.id,'version',r.artifact_version,'digest',encode(r.artifact_digest,'hex'),'ciphertext',encode(r.body_ciphertext,'hex'),'nonce',encode(r.body_nonce,'hex')),'signatures',(SELECT json_agg(to_jsonb(s) ORDER BY s.id) FROM audit.signature_evidence s WHERE s.resource_id=r.id),'bindings',(SELECT json_agg(to_jsonb(b) ORDER BY b.signature_evidence_id) FROM clinical.content_signature_bindings b JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=r.id)) FROM clinical.content_releases r WHERE r.id=${q(id)}::uuid;`,
  );
}
async function hold(h, statement) {
  const c = session(
    h.runtime,
    h.database,
    h.database.replace('k08', 'k07') + '_holder',
    h.runtime.user,
  );
  sessions.add(c);
  c.send(`BEGIN;SET LOCAL idle_in_transaction_session_timeout='60s';${statement};SELECT 'HELD';`);
  await marker(c, 'HELD');
  return c;
}
async function finish(c) {
  c.send("COMMIT;SELECT 'DONE';");
  await marker(c, 'DONE');
  c.send('\\q');
  await c.closed;
  sessions.delete(c);
}
async function wait(h, user = 'shifaa_api', count = 1) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const locks = h.owner(
      `SELECT coalesce(json_agg(json_build_object('pid',pid,'user',usename,'blocking',pg_blocking_pids(pid),'waiting',(SELECT count(*) FROM pg_locks l WHERE l.pid=a.pid AND NOT granted))),'[]'::json) FROM pg_stat_activity a WHERE datname=${q(h.database)} AND wait_event_type='Lock';`,
    );
    const matched = locks.filter((r) => r.user === user && r.blocking.length && r.waiting);
    if (matched.length >= count) return matched;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error('K17 required independent pg_locks barrier missing');
}
const beforePins = currentPhysicalSourceDigests(root),
  inputs = Object.fromEntries(paths.map((p) => [p, digest(p)]));
const gate = await verifyFeature011Contracts();
assert.equal(gate.result, 'PASS', gate.failures.join('\n'));
const results = [];
for (const runtime of runtimes) {
  console.log(runtime.name + ': K17 native publication/current eligibility');
  const result = await withSigning(
    runtime,
    async (h) => {
      const checks = [],
        races = [],
        eligibility = [];
      const check = (id, ok = true) => {
        assert(ok, id);
        checks.push({ id, result: 'PASS' });
        console.log(runtime.name + ': ' + id);
      };
      const offline = await governedOfflineProof(
        runtime,
        h.database,
        (identity) => ({ mode: 'isolated-synthetic', sourceIdentity: identity, now }),
        () => {},
      );
      const publish = (id, options = {}) => {
        const r = row(h, id);
        return h.request(
          'POST',
          {
            artifactVersion: r.artifactVersion,
            artifactDigest: r.artifactDigest,
            confirmPublication: true,
            ...options.body,
          },
          {
            actor: 'publisher',
            url: `/v1/admin/clinical-content/releases/${id}/publish`,
            headers: { 'if-match': '"' + (options.version ?? r.workflowVersion) + '"' },
            ...options,
          },
        );
      };
      const create = async (request) => {
        const response = await h.content(request ?? initial);
        assert.equal(response.statusCode, 201, response.body);
        return response.json().releaseId;
      };
      const admit = async (id) => {
        const r = row(h, id),
          approval = randomUUID();
        sql(
          runtime,
          h.database,
          `INSERT INTO clinical.content_admissibility_evidence(id,release_id,artifact_version,artifact_digest,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,synthetic,status,valid_from,version) VALUES(${q(approval)}::uuid,${q(id)}::uuid,${r.artifactVersion},decode(${q(r.artifactDigest)},'hex'),${q(r.contentType)},${q(r.governedContentKey)},${q(r.effectiveScopeKey)},${q(randomUUID())}::uuid,'synthetic-policy-v1',decode(repeat('b',64),'hex'),${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,'synthetic.exact-admission',${q(randomUUID())},true,'active','2020-01-01',1);`,
        );
        await offline.admission(approval);
        return approval;
      };
      const sign = async (id) => {
        for (const n of [2, 3]) {
          const r = await h.sign(id, h.issue(id, n));
          assert.equal(r.statusCode, 200, r.body);
        }
      };
      const ready = async (request) => {
        const id = await create(request),
          approval = await admit(id);
        await sign(id);
        assert(eligible(h, id));
        return { id, approval };
      };
      const negative = async (id, label, options = {}) => {
        const before = state(h),
          hist = history(h, id),
          res = await publish(id, options);
        assert(
          [403, 409, 422].includes(res.statusCode),
          label + ': ' + res.statusCode + ' ' + res.body,
        );
        assert.deepEqual(state(h), before);
        assert.deepEqual(history(h, id), hist);
        check(label);
        return res;
      };
      const currentStatus = (at) => {
        const input = {
          projection: 'status',
          governedContentKey: initial.governedContentKey,
          effectiveScopeKey: initial.effectiveScopeKey,
        };
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
        const ctx = Object.entries(settings)
          .map(([k, v]) => `SELECT set_config(${q('shifaa.' + k)},${q(v)},true);`)
          .join('');
        const out = sql(
          runtime,
          h.database,
          `BEGIN;${ctx}SELECT clinical.list_clinical_content_api_v1('synthetic',${q(JSON.stringify(input))}::jsonb);COMMIT;`,
          { user: 'shifaa_api' },
        );
        return JSON.parse(out.stdout.split(/\r?\n/).find((l) => l.startsWith('[')));
      };
      try {
        const noAdmission = await create();
        await sign(noAdmission);
        await negative(noAdmission, 'HISTORICAL_SIGNATURES_WITHOUT_EXACT_ADMISSION');
        check('HISTORY_IS_NOT_ELIGIBILITY', !eligible(h, noAdmission));
        const noSign = await create();
        await admit(noSign);
        await negative(noSign, 'EXACT_ADMISSION_WITHOUT_TWO_APPROVALS');
        for (const [kind, table, idcolumn] of [
          ['credential', 'identity.professional_licenses', 'credential_id'],
          ['designation', 'clinical.content_reviewer_designations', 'designation_id'],
          ['grant', 'clinical.content_governance_authorities', 'signing_authority_id'],
        ]) {
          for (const defect of ['expiry', 'revoke', 'version', 'replacement']) {
            const { id } = await ready(),
              hist = history(h, id);
            const basis = h.owner(
              `SELECT row_to_json(t) FROM ${table} t JOIN clinical.content_signature_bindings b ON b.${idcolumn}=t.id JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=${q(id)}::uuid AND s.signer_role='physician';`,
            );
            let changes, restore;
            if (defect === 'expiry') {
              const col = kind === 'credential' ? 'expires_on' : 'valid_until';
              changes = `${col}=${q(kind === 'credential' ? '2000-01-01' : '2020-01-02')}`;
              restore = `${col}=${basis[col] === null ? 'NULL' : q(basis[col])}`;
            } else if (defect === 'revoke' || defect === 'replacement') {
              changes = `status=${q(kind === 'credential' ? 'rejected' : 'revoked')}`;
              restore = `status=${q(basis.status)}`;
            } else {
              changes = 'version=version+1';
              restore = 'version=version+1';
            }
            sql(
              runtime,
              h.database,
              `UPDATE ${table} SET ${changes}${changes.startsWith('version=') ? '' : ',version=version+1'} WHERE id=${q(basis.id)}::uuid;`,
            );
            let replacement;
            if (defect === 'replacement' && kind === 'grant') {
              replacement = randomUUID();
              sql(
                runtime,
                h.database,
                `INSERT INTO clinical.content_governance_authorities SELECT (jsonb_populate_record(NULL::clinical.content_governance_authorities,to_jsonb(a)||jsonb_build_object('id',${q(replacement)}::uuid,'status','active','version',1,'evidence_ref',${q(randomUUID())}::uuid,'source_evidence_identity',${q(randomUUID())}))).* FROM clinical.content_governance_authorities a WHERE id=${q(basis.id)}::uuid;`,
              );
            }
            try {
              check(kind + '_' + defect + '_UNAVAILABLE', !eligible(h, id));
              await negative(id, kind + '_' + defect + '_LOCKED_DENIAL');
              eligibility.push({
                id: kind + '_' + defect,
                eligible: false,
                historicalRowsPreserved: true,
                result: 'PASS',
              });
            } finally {
              sql(
                runtime,
                h.database,
                `${replacement ? `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${q(replacement)}::uuid;` : ''}UPDATE ${table} SET ${restore}${restore.startsWith('version=') ? '' : ',version=version+1'} WHERE id=${q(basis.id)}::uuid;`,
              );
            }
            check(kind + '_' + defect + '_RESTORE_DOES_NOT_REHABILITATE', !eligible(h, id));
            assert.deepEqual(history(h, id), hist);
          }
        }
        const admission = await ready();
        sql(
          runtime,
          h.database,
          `UPDATE clinical.content_admissibility_evidence SET version=version+1 WHERE id=${q(admission.approval)}::uuid;`,
        );
        await negative(admission.id, 'ADMISSION_VERSION_ADVANCEMENT');
        check('ADMISSION_BASIS_UNAVAILABLE', !eligible(h, admission.id));
        const authority = await ready();
        for (const actor of ['medical', 'clinician', 'pharmacist', 'patient'])
          await negative(authority.id, 'PUBLISHER_SEPARATION_' + actor, { actor });
        const revoke = await ready(),
          grant = h.owner(
            `SELECT to_json(signing_authority_id) FROM clinical.content_signature_bindings b JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=${q(revoke.id)}::uuid AND s.signer_role='physician';`,
          );
        const writer = await hold(
          h,
          `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${q(grant)}::uuid`,
        );
        const before = state(h),
          pending = publish(revoke.id);
        const locks = await wait(h);
        await finish(writer);
        const denied = await pending;
        assert.equal(denied.statusCode, 403, denied.body);
        assert.deepEqual(state(h), before);
        races.push({ id: 'SIGNER_REVOKE_FIRST', result: 'PASS', status: 403, pgLocks: locks });
        sql(
          runtime,
          h.database,
          `UPDATE clinical.content_governance_authorities SET status='active',version=version+1 WHERE id=${q(grant)}::uuid;`,
        );
        const lost = await ready(),
          aw = await hold(
            h,
            `UPDATE clinical.content_admissibility_evidence SET status='revoked',version=version+1 WHERE id=${q(lost.approval)}::uuid`,
          ),
          aBefore = state(h),
          ap = publish(lost.id),
          al = await wait(h);
        await finish(aw);
        const ar = await ap;
        assert.equal(ar.statusCode, 403, ar.body);
        assert.deepEqual(state(h), aBefore);
        races.push({ id: 'ADMISSION_LOSS_FIRST', result: 'PASS', pgLocks: al, status: 403 });
        const roots = [await ready(), await ready()];
        const barrier = await hold(
          h,
          `SELECT pg_advisory_xact_lock(hashtextextended(${q(['synthetic', initial.governedContentKey, initial.effectiveScopeKey].join('\x1f'))},0))`,
        );
        const rootBefore = state(h),
          rootPromises = roots.map((r) => publish(r.id));
        const rootLocks = await wait(h, 'shifaa_api', 2);
        await finish(barrier);
        const rootResults = await Promise.all(rootPromises);
        assert.deepEqual(rootResults.map((r) => r.statusCode).sort(), [200, 422]);
        const root = roots[rootResults.findIndex((r) => r.statusCode === 200)].id;
        const rootResponse = rootResults.find((r) => r.statusCode === 200);
        check(
          'ROOT_EXACT_ORIGINAL_REVIEW',
          rootResponse.json().artifactReview.content ===
            Buffer.from(
              JSON.parse(readFileSync(f + '/contracts/artifact-canonicalization-v1-vectors.json'))
                .positive[0].materialBytesHex.content,
              'hex',
            ).toString(),
        );
        const rootAfter = state(h);
        for (const field of [
          'published',
          'audit',
          'outbox',
          'receipts',
          'obligations',
          'completed',
        ])
          assert.equal(rootAfter[field], rootBefore[field] + 1);
        races.push({
          id: 'COMPETING_ROOTS',
          result: 'PASS',
          statuses: [200, 422],
          pgLocks: rootLocks,
          durable: rootAfter,
        });
        let applicableParent = root;
        await negative(root, 'ALREADY_PUBLISHED_FRESH_KEY');
        // A rollback is a separately reviewed/signed successor, never a historical overwrite.
        const successor = (parent, effectiveAt) => {
          const request = {
            ...initial,
            artifact: { ...initial.artifact },
            predecessor: { initial: false, supersedesReleaseId: parent },
            effectiveAt,
          };
          delete request.artifact.declaredDigest;
          return request;
        };
        const rollback = await ready(successor(root, '2026-10-07T10:00:00.000000Z'));
        const faultKey = randomUUID(),
          faultBefore = state(h);
        h.setFault('before');
        const failedBefore = await publish(rollback.id, { key: faultKey });
        h.setFault(undefined);
        assert.equal(failedBefore.statusCode, 500);
        assert.deepEqual(state(h), faultBefore);
        check('RECEIPT_BEFORE_COMMIT_ROLLS_BACK_ALL_FIVE');
        let reached, releaseCommit;
        const held = new Promise((r) => {
            reached = r;
          }),
          resume = new Promise((r) => {
            releaseCommit = r;
          });
        h.setAfter(async () => {
          reached();
          await resume;
        });
        const action = publish(rollback.id, { key: faultKey });
        await held;
        const actionGrant = h.owner(
          `SELECT to_json(signing_authority_id) FROM clinical.content_signature_bindings b JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=${q(rollback.id)}::uuid AND s.signer_role='physician';`,
        );
        const actionWriter = session(
          runtime,
          h.database,
          h.database.replace('k08', 'k07') + '_contender',
          runtime.user,
        );
        sessions.add(actionWriter);
        actionWriter.send(
          `BEGIN;UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${q(actionGrant)}::uuid;SELECT 'HELD';`,
        );
        const actionLocks = await wait(h, runtime.user);
        h.setAfter(null);
        releaseCommit();
        const actionResponse = await action;
        assert.equal(actionResponse.statusCode, 200, actionResponse.body);
        await marker(actionWriter, 'HELD');
        await finish(actionWriter);
        races.push({
          id: 'PUBLICATION_ACTION_FIRST_SIGNER_REVOKE',
          result: 'PASS',
          pgLocks: actionLocks,
          status: 200,
        });
        check(
          'ROLLBACK_FRESH_REVIEWED_SIGNED_SUCCESSOR',
          row(h, rollback.id).status === 'published' && !eligible(h, rollback.id),
        );
        sql(
          runtime,
          h.database,
          `UPDATE clinical.content_governance_authorities SET status='active',version=version+1 WHERE id=${q(actionGrant)}::uuid;`,
        );
        applicableParent = rollback.id;
        for (const [fault, time] of [
          ['after', '2026-10-08T01:00:00.000000Z'],
          ['unknown', '2026-10-08T02:00:00.000000Z'],
        ]) {
          const candidate = await ready(successor(applicableParent, time)),
            key = randomUUID(),
            before = state(h);
          h.setFault(fault);
          const failed = await publish(candidate.id, { key });
          h.setFault(undefined);
          assert.equal(failed.statusCode, 500);
          const committed = state(h);
          for (const field of [
            'published',
            'audit',
            'outbox',
            'receipts',
            'obligations',
            'completed',
          ])
            assert.equal(committed[field], before[field] + 1);
          const preparations = h.counters().keyPreparations;
          const replay = await publish(candidate.id, { key, version: 3 });
          assert.equal(replay.statusCode, 200, replay.body);
          assert.deepEqual(state(h), committed);
          assert.equal(h.counters().keyPreparations - preparations, 1);
          check('COMMIT_' + fault + '_SETTLED_ORIGINAL_NO_SECOND_EFFECT');
          const replayAgain = await publish(candidate.id, { key, version: 3 });
          assert.equal(replayAgain.body, replay.body);
          assert.equal(replayAgain.headers.etag, replay.headers.etag);
          check('ORIGINAL_PUBLICATION_RECEIPT_' + fault);
          const unavailable = state(h);
          h.control.mode = 'unavailable';
          const noReplay = await publish(candidate.id, { key, version: 3 });
          h.control.mode = null;
          assert.equal(noReplay.statusCode, 422, noReplay.body);
          assert.deepEqual(state(h), unavailable);
          check('REPLAY_REQUIRES_CURRENT_ORIGINAL_MATERIAL_' + fault);
          applicableParent = candidate.id;
        }
        const successorRequest = {
          ...initial,
          artifact: { ...initial.artifact },
          predecessor: { initial: false, supersedesReleaseId: applicableParent },
          effectiveAt: '2098-01-01T00:00:00.000000Z',
        };
        delete successorRequest.artifact.declaredDigest;
        const successors = [await ready(successorRequest), await ready(successorRequest)];
        const sb = await hold(
            h,
            `SELECT pg_advisory_xact_lock(hashtextextended(${q(['synthetic', initial.governedContentKey, initial.effectiveScopeKey].join('\x1f'))},0))`,
          ),
          sp = successors.map((r) => publish(r.id)),
          sl = await wait(h, 'shifaa_api', 2);
        await finish(sb);
        const sr = await Promise.all(sp);
        assert.deepEqual(sr.map((r) => r.statusCode).sort(), [200, 409]);
        const future = successors[sr.findIndex((r) => r.statusCode === 200)].id;
        races.push({
          id: 'COMPETING_FUTURE_SUCCESSORS',
          result: 'PASS',
          statuses: sr.map((r) => r.statusCode),
          pgLocks: sl,
        });
        const beforeInstant = '2097-12-31T23:59:59.999999Z',
          atInstant = '2098-01-01T00:00:00.000000Z';
        const immediatelyBefore = currentStatus(beforeInstant),
          exactlyAt = currentStatus(atInstant);
        assert.equal(immediatelyBefore[0]?.releaseId, applicableParent);
        assert.equal(exactlyAt[0]?.releaseId, future);
        eligibility.push({
          id: 'EFFECTIVE_MICROSECOND_BOUNDARY',
          before: immediatelyBefore,
          at: exactlyAt,
          result: 'PASS',
        });
        check(
          'FUTURE_PUBLICATION_RESERVES_SUCCESSOR_NOT_EARLY_CURRENT',
          sr.find((r) => r.statusCode === 200).json().eligibility === 'future',
        );
        const reserved = await ready({
          ...successorRequest,
          effectiveAt: '2098-02-01T00:00:00.000000Z',
        });
        await negative(reserved.id, 'PUBLISHED_FUTURE_SUCCESSOR_RESERVATION');
        const futureBasis = h.owner(
          `SELECT to_json(signing_authority_id) FROM clinical.content_signature_bindings b JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=${q(future)}::uuid AND s.signer_role='physician';`,
        );
        const futureHistory = history(h, future);
        sql(
          runtime,
          h.database,
          `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${q(futureBasis)}::uuid;`,
        );
        assert.deepEqual(currentStatus(atInstant), []);
        check('INELIGIBLE_SUCCESSOR_NO_ANCESTOR_FALLBACK');
        assert.deepEqual(history(h, future), futureHistory);
        sql(
          runtime,
          h.database,
          `UPDATE clinical.content_governance_authorities SET status='active',version=version+1 WHERE id=${q(futureBasis)}::uuid;`,
        );
        assert.deepEqual(currentStatus(atInstant), []);
        check('UNRELATED_REACTIVATION_NOT_CURRENT_ELIGIBILITY');
        const r = await create({ ...successorRequest, effectiveAt: '2098-03-01T00:00:00.000000Z' });
        await admit(r);
        await sign(r);
        await negative(r, 'ROLLBACK_REQUIRES_FRESH_CURRENT_PREDECESSOR');
        const counters = h.counters();
        check('ZERO_EXTERNAL_UNDER_LOCKS', counters.externalUnderLocks === 0);
        check('SQL_SINK_GUARD_ACTIVE', counters.sqlSinkChecks > 0);
        check(
          'PREDECESSOR_PRESERVED',
          JSON.stringify(h.predecessor.before) === JSON.stringify(h.predecessor.after),
        );
        return {
          result: 'PASS',
          runtime: runtime.name,
          runtimeIdentity: runtimeManifest(runtime),
          serverVersion: h.health.manifest.serverVersion,
          health: h.health,
          predecessor: h.predecessor,
          migrations: h.migrations,
          checks,
          count: checks.length,
          races,
          eligibility,
          counters,
          offline: offline.results,
          syntheticEngineeringOnly: true,
        };
      } finally {
        await offline.finish();
        for (const c of sessions) {
          if (!c.ended) {
            c.send('ROLLBACK;\n\\q');
            await c.closed;
          }
        }
        sessions.clear();
      }
    },
    {
      additionalActors: [['publisher', 6]],
      configure: async (args) => ({
        publication: new Feature011Publication({
          ...args.deps,
          context: {
            select: async (_actor, id) => {
              const owner = (query) =>
                JSON.parse(sql(args.runtime, args.database, query).stdout.trim());
              return row({ owner }, id);
            },
          },
        }),
      }),
    },
  );
  results.push(result);
}
assert.deepEqual(currentPhysicalSourceDigests(root), beforePins);
for (const [p, hash] of Object.entries(inputs)) assert.equal(digest(p), hash);
const e =
  f +
  '/evidence/fresh-implementation/' +
  (process.argv.includes('--k18-revalidation') ? 'K18/k17-revalidation' : 'K17');
mkdirSync(e, { recursive: true });
const proof = {
  checkpoint: 'K17',
  tasks: ['T064', 'T065', 'T066'],
  result: 'PASS',
  capturedAt: new Date().toISOString(),
  inputs,
  physicalSourceDigests: beforePins,
  runtimes: results,
  realClinicalAcceptance: false,
  retainedGates: 'UNCHANGED_OPEN',
  acceptance: 'PENDING_PRODUCT_OWNER',
};
for (const name of ['publish-api', 'publish-races', 'eligibility-proof'])
  writeFileSync(e + '/' + name + '.json', JSON.stringify(proof, null, 2) + '\n');
console.log(
  JSON.stringify({
    result: 'PASS',
    runtimes: results.map((r) => ({
      runtime: r.runtime,
      count: r.count,
      races: r.races.length,
      eligibility: r.eligibility.length,
    })),
  }),
);
