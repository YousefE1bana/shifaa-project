// K16: real native/application/SQL composition; only evidence sources are synthetic.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withContent, request as draft } from './run-feature-011-content-api-test.mjs';
import {
  signingBasis,
  signingBasisQuery,
  decodeSigningBasis,
} from './feature-011-content-fixtures.mjs';
import { runtimes, sql, root, digest, runtimeManifest } from './run-feature-011-postgres-test.mjs';
import { session, marker } from './run-feature-011-concurrency-test.mjs';
import { Feature011Signing } from '../services/api/src/modules/feature-011/sign-release.ts';
import { common, same } from '../services/api/src/modules/feature-011/evidence-validation.ts';
import { deny } from '../services/api/src/modules/feature-011/protection.ts';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
} from './verify-feature-011-contracts.mjs';
const f = 'specs/011-allergies-clinical-content-governance';
const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
const person = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
const pause = () => new Promise((r) => setTimeout(r, 25));
const sessions = new Set();
function trackedSession(h, suffix) {
  const c = session(
    h.runtime,
    h.database,
    h.database.replace('k08', 'k07') + '_' + suffix,
    h.runtime.user,
  );
  sessions.add(c);
  return c;
}
function releaseRowQuery(id) {
  return `SELECT json_build_object('contentType',s.content_type,'artifactVersion',r.artifact_version,'artifactDigest',encode(r.artifact_digest,'hex'),'creatorPersonId',r.created_by_person_id,'workflowVersion',r.workflow_version,'signerPersonIds',coalesce((SELECT json_agg(signer_person_id) FROM audit.signature_evidence WHERE resource_id=r.id),'[]'::json)) FROM clinical.content_releases r JOIN clinical.content_series s ON s.id=r.series_id WHERE r.id=${quote(id)}::uuid`;
}
function row(h, id) {
  return h.owner(releaseRowQuery(id));
}
function counts(h) {
  return h.owner(
    `SELECT json_build_object('signatures',(SELECT count(*) FROM audit.signature_evidence WHERE resource_type='clinical.content_release'),'sidecars',(SELECT count(*) FROM clinical.content_signature_bindings),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'obligations',(SELECT count(*) FROM clinical.mutation_commit_obligations),'completed',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed'));`,
  );
}
async function wait(h, predicate) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const locks = h.owner(
      `SELECT coalesce(json_agg(json_build_object('pid',pid,'user',usename,'blocking',pg_blocking_pids(pid),'ungranted',(SELECT count(*) FROM pg_locks l WHERE l.pid=a.pid AND NOT granted))),'[]'::json) FROM pg_stat_activity a WHERE datname=${quote(h.database)} AND wait_event_type='Lock';`,
    );
    if (predicate(locks)) return locks;
    await pause();
  }
  throw Error('Required K16 independent lock barrier missing');
}
async function holder(h, command, suffix) {
  const c = trackedSession(h, suffix);
  c.send(`BEGIN;SET LOCAL idle_in_transaction_session_timeout='60s';${command};SELECT 'HELD';`);
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
export async function withSigning(runtime, work, options = {}) {
  const registry = new Map();
  let harness,
    mode = null,
    after = null;
  const prepared = [];
  const setup = async (args) => {
    const owner = (query) => JSON.parse(sql(args.runtime, args.database, query).stdout.trim());
    const current = (actor, id, capacity) => {
      const n = Number(actor.personId.slice(-12));
      if (![2, 3].includes(n)) deny();
      // Fresh private-source snapshot on every invocation; no cached authority.
      // Consolidate process startup, not any product authorization or SQL lock.
      const raw = owner(
        `SELECT json_build_object('basis',(${signingBasisQuery(n, capacity)}),'selected',(${releaseRowQuery(id)}),'administrative',EXISTS(SELECT 1 FROM identity.admin_role_grants WHERE person_id=${quote(actor.personId)}::uuid AND status='active'))`,
      );
      const basis = decodeSigningBasis(raw.basis);
      if (basis.designationBasis.capacity !== capacity) deny();
      const selected = raw.selected;
      if (!selected) deny();
      const administrative = raw.administrative;
      return { ...selected, basis, administrative };
    };
    const source = {
      async verify(request, basis) {
        if (mode === 'unavailable') throw Error('Synthetic verifier unavailable');
        const stored = registry.get(request.evidenceRef);
        if (!stored) deny();
        const expected = {
          releaseId: stored.releaseId,
          artifactVersion: stored.artifactVersion,
          artifactDigest: stored.artifactDigest,
          signerPersonId: stored.signerPersonId,
          capacity: stored.capacity,
          decision: stored.decision,
          evidenceRef: stored.evidenceRef,
        };
        if (
          !same(expected, request) ||
          !same(
            {
              credentialBasis: stored.credentialBasis,
              designationBasis: stored.designationBasis,
              authorityBasis: stored.authorityBasis,
            },
            basis,
          )
        )
          deny();
        const result = structuredClone(stored);
        if (mode === 'wrong-source') result.sourceIdentity = 'synthetic.unapproved';
        if (mode === 'wrong-tuple') result.artifactDigest = '0'.repeat(64);
        return {
          selector: stored.evidenceRef,
          sourceEvidenceIdentity: stored.sourceEvidenceIdentity,
          result,
        };
      },
    };
    return new Feature011Signing({
      store: {
        probe: (s) => args.receipts.probe(s),
        replay: (s, w) => args.receipts.replay(s, w),
        mutate: (s, i, w) => {
          prepared.push(structuredClone(i));
          return args.receipts.mutate(s, i, w);
        },
      },
      provider: args.provider,
      context: { select: async (...a) => current(...a) },
      source,
      evidence: { mode: 'isolated-synthetic', sourceIdentity: 'synthetic.signing', now },
    });
  };
  setup.additionalActors = options.additionalActors;
  setup.configure = options.configure;
  setup.afterFinalization = async () => {
    await after?.();
  };
  return withContent(
    runtime,
    async (h) => {
      harness = h;
      const issue = (
        id,
        n = 2,
        decision = 'approved',
        capacity = n === 2 ? 'physician' : 'pharmacist',
      ) => {
        const r = row(h, id),
          basis = signingBasis(h.owner, n, capacity),
          ref = randomUUID();
        const stored = {
          ...common('f011.signing_port', now()),
          profile: 'signing',
          releaseId: id,
          artifactVersion: r.artifactVersion,
          artifactDigest: r.artifactDigest,
          signerPersonId: person(n),
          capacity,
          decision,
          evidenceRef: ref,
          sourceIdentity: 'synthetic.signing',
          sourceEvidenceIdentity: randomUUID(),
          sourceEvidenceVersion: null,
          sourceEvidenceSha256: null,
          ...basis,
        };
        registry.set(ref, structuredClone(stored));
        return {
          capacity: stored.capacity,
          decision,
          artifactVersion: r.artifactVersion,
          artifactDigest: r.artifactDigest,
          signingEvidenceRef: ref,
          reason: 'Restricted synthetic reason — never SQL or response',
        };
      };
      const sign = (id, body, options = {}) =>
        h.request('POST', body, {
          actor: body.capacity === 'physician' ? 'clinician' : 'pharmacist',
          url: `/v1/admin/clinical-content/releases/${id}/signatures`,
          headers: { 'if-match': '"' + (options.version ?? row(h, id).workflowVersion) + '"' },
          ...options,
        });
      try {
        return await work({
          ...h,
          issue,
          sign,
          prepared,
          setMode: (v) => {
            mode = v;
          },
          setAfter: (v) => {
            after = v;
          },
          registry,
        });
      } finally {
        for (const c of sessions) {
          c.send('ROLLBACK;\n\\q');
          await c.closed;
        }
        sessions.clear();
      }
    },
    setup,
  );
}
async function prove(h) {
  const serverVersion = h.health.manifest.serverVersion;
  assert(serverVersion.startsWith(h.runtime.name === 'shifaa-local-postgres' ? '17.11' : '17.6'));
  const checks = [],
    races = [];
  const check = (id, condition = true) => {
    assert(condition, id);
    checks.push({ id, result: 'PASS' });
  };
  const create = async () => {
    const r = await h.content(draft);
    assert.equal(r.statusCode, 201, r.body);
    return r.json().releaseId;
  };
  const id = await create(),
    p = h.issue(id, 2),
    a = h.issue(id, 3),
    original = row(h, id);
  const locked = await holder(
    h,
    `SELECT pg_advisory_xact_lock(hashtextextended(${quote(['synthetic', draft.governedContentKey, draft.effectiveScopeKey].join('\x1f'))},0))`,
    'holder',
  );
  const keys = [randomUUID(), randomUUID()];
  const one = h.sign(id, p, { version: 1, key: keys[0] });
  await Promise.race([
    wait(h, (rs) => rs.some((r) => r.user === 'shifaa_api' && r.blocking.length)),
    one.then((r) => {
      throw Error('Signing request settled before series barrier: ' + r.statusCode + ' ' + r.body);
    }),
  ]);
  const two = h.sign(id, a, { version: 1, key: keys[1] });
  const barriers = await wait(
    h,
    (rs) => rs.filter((r) => r.user === 'shifaa_api' && r.blocking.length).length === 2,
  );
  await finish(locked);
  const responses = await Promise.all([one, two]);
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
  const loser = responses[0].statusCode === 409 ? p : a,
    winner = responses[0].statusCode === 200 ? responses[0] : responses[1];
  const retry = await h.sign(id, loser, { version: 2 });
  assert.equal(retry.statusCode, 200, retry.body);
  check(
    'CAPACITY_CAS_RELOAD_SAME_ARTIFACT',
    row(h, id).artifactDigest === original.artifactDigest &&
      row(h, id).artifactVersion === original.artifactVersion &&
      row(h, id).workflowVersion === 3,
  );
  races.push({
    id: 'TWO_CAPACITIES_SAME_ETAG',
    statuses: responses.map((r) => r.statusCode),
    retry: retry.statusCode,
    pgLocks: barriers,
    result: 'PASS',
  });
  check('DISTINCT_ACTUAL_SIGNERS', new Set(row(h, id).signerPersonIds).size === 2);
  const winnerIndex = responses[0].statusCode === 200 ? 0 : 1,
    winningBody = winnerIndex === 0 ? p : a,
    saved = counts(h),
    keysBefore = h.counters().keyPreparations;
  const replayOriginal = await h.sign(id, winningBody, { version: 1, key: keys[winnerIndex] });
  assert.equal(replayOriginal.statusCode, 200, replayOriginal.body);
  assert.equal(replayOriginal.body, winner.body);
  assert.equal(h.counters().keyPreparations - keysBefore, 1);
  assert.deepEqual(counts(h), saved);
  check('EXACT_ORIGINAL_REPLAY_AFTER_WORKFLOW_ADVANCEMENT');
  const changedBinding = await h.sign(
    id,
    { ...winningBody, reason: 'Changed private request binding' },
    { version: 1, key: keys[winnerIndex] },
  );
  assert.equal(changedBinding.statusCode, 409, changedBinding.body);
  assert.deepEqual(counts(h), saved);
  check('CHANGED_KEY_BINDING_DENIED');
  for (const fault of ['before', 'after', 'unknown']) {
    const target = await create(),
      body = h.issue(target),
      key = randomUUID(),
      before = counts(h);
    h.setFault(fault);
    const failure = await h.sign(target, body, { key, version: 1 });
    assert.equal(failure.statusCode, 500);
    h.setFault(undefined);
    const settled = await h.sign(target, body, { key, version: 1 });
    assert.equal(settled.statusCode, 200, settled.body);
    const end = counts(h);
    for (const name of [
      'signatures',
      'sidecars',
      'audit',
      'outbox',
      'receipts',
      'obligations',
      'completed',
    ])
      assert.equal(end[name] - before[name], 1);
    check('SIGN_RECEIPT_FAULT_SETTLEMENT_' + fault);
  }
  for (const body of [p, a]) {
    const before = counts(h),
      denied = await h.sign(id, {
        ...body,
        signingEvidenceRef: h.issue(id, body.capacity === 'physician' ? 2 : 3).signingEvidenceRef,
      });
    assert.equal(denied.statusCode, 403, denied.body);
    assert.deepEqual(counts(h), before);
    check('ONE_FINAL_DECISION_' + body.capacity);
  }
  const fresh = await create(),
    body = h.issue(fresh),
    before = counts(h);
  for (const mode of ['wrong-source', 'wrong-tuple', 'unavailable']) {
    h.setMode(mode);
    const denied = await h.sign(fresh, body);
    // Unavailability is an intentionally injected verifier fault. Wrong source
    // or tuple must produce the protection denial, never a setup/server failure.
    assert.equal(denied.statusCode, mode === 'unavailable' ? 500 : 403, denied.body);
    assert.deepEqual(counts(h), before);
    check('VERIFIER_' + mode);
  }
  h.setMode(null);
  for (const changed of [
    { ...body, signingEvidenceRef: randomUUID() },
    { ...body, artifactDigest: '0'.repeat(64) },
    { ...body, artifactVersion: 2 },
  ]) {
    const denied = await h.sign(fresh, changed);
    assert.equal(denied.statusCode, 403, denied.body);
    assert.deepEqual(counts(h), before);
    check('SELECTOR_OR_TUPLE_SUBSTITUTION');
  }
  for (const actor of ['patient', 'medical']) {
    const denied = await h.sign(fresh, body, { actor });
    assert.equal(denied.statusCode, 403, denied.body);
    assert.deepEqual(counts(h), before);
    check('INELIGIBLE_ACTOR_' + actor);
  }
  const signatureHistory = () =>
    h.owner(
      `SELECT json_agg(to_jsonb(b) ORDER BY b.signature_evidence_id) FROM clinical.content_signature_bindings b JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=${quote(id)}::uuid;`,
    );
  const snapshot = signatureHistory();
  check(
    'PUBLIC_PRIVATE_SEPARATION',
    !/(credential|designation|authorityBasis|sourceIdentity|reason|keyRef|private)/.test(
      winner.body,
    ) && Object.keys(winner.json()).sort().join(',') === 'releaseId,signature,workflowVersion',
  );
  const rejected = await create(),
    reject = h.issue(rejected, 2, 'rejected'),
    rejection = await h.sign(rejected, reject);
  assert.equal(rejection.statusCode, 200, rejection.body);
  check(
    'REJECTED_SAME_EXACT_BASIS',
    rejection.json().signature.artifactDigest === reject.artifactDigest &&
      rejection.json().signature.evidenceRef === reject.signingEvidenceRef,
  );
  const forbidden = await h.sign(rejected, h.issue(rejected, 2, 'approved'));
  assert.equal(forbidden.statusCode, 403, forbidden.body);
  const replacement = await create(),
    approved = await h.sign(replacement, h.issue(replacement));
  assert.equal(approved.statusCode, 200, approved.body);
  check(
    'REJECTION_REQUIRES_FRESH_REVIEWED_DRAFT',
    row(h, rejected).artifactVersion === row(h, replacement).artifactVersion &&
      rejected !== replacement,
  );
  // Exact immutable sources remain bound to historical basis across current changes.
  for (const [kind, table, basisKey] of [
    ['credential', 'identity.professional_licenses', 'credentialBasis'],
    ['designation', 'clinical.content_reviewer_designations', 'designationBasis'],
    ['authority', 'clinical.content_governance_authorities', 'authorityBasis'],
  ]) {
    const b = signingBasis(h.owner, 2)[basisKey],
      column = kind === 'credential' ? 'expires_on' : 'valid_until';
    for (const defect of ['expiry', 'revocation', 'version', 'replacement']) {
      const target = await create(),
        selected = h.issue(target),
        s = counts(h);
      let restore;
      if (defect === 'expiry') {
        sql(
          h.runtime,
          h.database,
          `UPDATE ${table} SET ${column}=${kind === 'credential' ? "'2000-01-01'" : "'2020-01-02T00:00:00Z'"},version=version+1 WHERE id=${quote(b.id)}::uuid;`,
        );
        restore = `${column}=${kind === 'credential' ? quote(b.expiresOn) : b.validUntil === null ? 'NULL' : quote(b.validUntil)}`;
      } else if (defect === 'revocation') {
        sql(
          h.runtime,
          h.database,
          `UPDATE ${table} SET status='${kind === 'credential' ? 'rejected' : 'revoked'}',version=version+1 WHERE id=${quote(b.id)}::uuid;`,
        );
        restore = `status='${kind === 'credential' ? 'verified' : 'active'}'`;
      } else {
        sql(
          h.runtime,
          h.database,
          `UPDATE ${table} SET version=version+1 WHERE id=${quote(b.id)}::uuid;`,
        );
        restore = 'version=version+1';
        if (defect === 'replacement') {
          const stored = h.registry.get(selected.signingEvidenceRef);
          stored[basisKey] = { ...stored[basisKey], id: randomUUID() };
        }
      }
      try {
        const denied = await h.sign(target, selected);
        assert.equal(denied.statusCode, 403, denied.body);
        assert.deepEqual(counts(h), s);
        check(kind + '_' + defect + '_EXACT_BASIS_DENIAL');
      } finally {
        sql(
          h.runtime,
          h.database,
          `UPDATE ${table} SET ${restore}${restore.startsWith('version=') ? '' : ',version=version+1'} WHERE id=${quote(b.id)}::uuid;`,
        );
      }
    }
  }
  assert.deepEqual(signatureHistory(), snapshot);
  check('IMMUTABLE_HISTORICAL_50_COLUMN_SIDECARS');
  // Action-first: pause only the harness after finalization, before COMMIT.
  const action = await create(),
    actionBody = h.issue(action),
    grant = signingBasis(h.owner, 2).authorityBasis.id;
  let ready, continueCommit;
  const readyPromise = new Promise((r) => {
      ready = r;
    }),
    commitBarrier = new Promise((r) => {
      continueCommit = r;
    });
  h.setAfter(async () => {
    ready();
    await commitBarrier;
  });
  const actionRequest = h.sign(action, actionBody);
  await readyPromise;
  const writer = trackedSession(h, 'contender');
  writer.send(
    `BEGIN;UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${quote(grant)}::uuid;SELECT 'HELD';`,
  );
  const authorityLocks = await wait(h, (rs) =>
    rs.some((r) => r.user === h.runtime.user && r.blocking.length),
  );
  const tupleLocks = h.owner(
    `SELECT coalesce(json_agg(json_build_object('mode',mode,'granted',granted)),'[]'::json) FROM pg_locks WHERE relation='clinical.content_governance_authorities'::regclass;`,
  );
  assert(tupleLocks.some((l) => l.mode === 'RowShareLock' && l.granted));
  h.setAfter(null);
  continueCommit();
  const actionResponse = await actionRequest;
  assert.equal(actionResponse.statusCode, 200, actionResponse.body);
  await marker(writer, 'HELD');
  await finish(writer);
  check('ACTION_FIRST_SHARE_LOCKS');
  races.push({
    id: 'SIGN_ACTION_FIRST_AUTHORITY_REVOKE',
    status: 200,
    pgLocks: authorityLocks,
    relationLocks: tupleLocks,
    result: 'PASS',
  });
  const replay = await h.sign(action, actionBody);
  assert.equal(replay.statusCode, 403, replay.body);
  sql(
    h.runtime,
    h.database,
    `UPDATE clinical.content_governance_authorities SET status='active',version=version+1 WHERE id=${quote(grant)}::uuid;`,
  );
  const target = await create(),
    revoked = h.issue(target),
    s = counts(h);
  h.control.before = async (scope) => {
    if (scope.operationId === 'signClinicalContentRelease') {
      sql(
        h.runtime,
        h.database,
        `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${quote(grant)}::uuid;`,
      );
    }
  };
  const denial = await h.sign(target, revoked);
  h.control.before = null;
  assert.equal(denial.statusCode, 403, denial.body);
  assert.deepEqual(counts(h), s);
  check('REVOKE_AFTER_PREPARATION_SQL_RECHECK');
  sql(
    h.runtime,
    h.database,
    `UPDATE clinical.content_governance_authorities SET status='active',version=version+1 WHERE id=${quote(grant)}::uuid;`,
  );
  // Signing confers no create/read authority and does not leak material/private basis.
  const noAdmin = await h.content(draft, { actor: 'pharmacist' });
  assert.equal(noAdmin.statusCode, 403, noAdmin.body);
  check('SIGNING_NO_ADMIN_PRIVILEGE');
  const adminId = randomUUID();
  sql(
    h.runtime,
    h.database,
    `BEGIN;SELECT set_config('shifaa.person_id',${quote(person(7))},true);INSERT INTO identity.admin_role_grants(id,person_id,role_code,status,valid_from,proposed_by,decision_reason) VALUES(${quote(adminId)}::uuid,${quote(person(2))}::uuid,'medical_reviewer','pending','2020-01-01T00:00:00Z',${quote(person(7))}::uuid,'Synthetic K16 independence fixture');SELECT set_config('shifaa.person_id',${quote(person(8))},true);UPDATE identity.admin_role_grants SET status='active',decided_by=${quote(person(8))}::uuid,version=version+1 WHERE id=${quote(adminId)}::uuid;COMMIT;`,
  );
  const own = await h.content(draft, { actor: 'clinician' });
  assert.equal(own.statusCode, 201, own.body);
  const adminAttempt = await h.sign(own.json().releaseId, h.issue(own.json().releaseId));
  assert.equal(adminAttempt.statusCode, 403, adminAttempt.body);
  check('ELIGIBLE_SIGNER_ADMIN_DENIED');
  sql(
    h.runtime,
    h.database,
    `BEGIN;SELECT set_config('shifaa.person_id',${quote(person(7))},true);INSERT INTO identity.admin_role_revocation_requests(id,grant_id,status,reason,proposed_by) VALUES(${quote(randomUUID())}::uuid,${quote(adminId)}::uuid,'pending','Synthetic creator independence fixture',${quote(person(7))}::uuid);SELECT set_config('shifaa.person_id',${quote(person(8))},true);UPDATE identity.admin_role_revocation_requests SET status='approved',decided_by=${quote(person(8))}::uuid,version=version+1 WHERE grant_id=${quote(adminId)}::uuid;UPDATE identity.admin_role_grants SET status='revoked',version=version+1 WHERE id=${quote(adminId)}::uuid;COMMIT;`,
  );
  const creatorAttempt = await h.sign(own.json().releaseId, h.issue(own.json().releaseId));
  assert.equal(creatorAttempt.statusCode, 403, creatorAttempt.body);
  check('ACTUAL_CREATOR_SELF_SIGN_DENIED');
  const licenseId = randomUUID(),
    designationId = randomUUID(),
    authorityId = randomUUID();
  sql(
    h.runtime,
    h.database,
    `INSERT INTO identity.professional_licenses SELECT (jsonb_populate_record(NULL::identity.professional_licenses,to_jsonb(c)||jsonb_build_object('id',${quote(licenseId)},'person_id',${quote(person(2))},'number_hash',${quote('\\x' + 'c'.repeat(64))},'masked_license_number','synthetic-dual-capacity'))).* FROM identity.professional_licenses c WHERE person_id=${quote(person(3))}::uuid;INSERT INTO clinical.content_reviewer_designations SELECT (jsonb_populate_record(NULL::clinical.content_reviewer_designations,to_jsonb(d)||jsonb_build_object('id',${quote(designationId)},'person_id',${quote(person(2))},'professional_license_id',${quote(licenseId)},'evidence_ref',${quote(randomUUID())},'source_evidence_identity',${quote(randomUUID())}))).* FROM clinical.content_reviewer_designations d WHERE person_id=${quote(person(3))}::uuid;INSERT INTO clinical.content_governance_authorities SELECT (jsonb_populate_record(NULL::clinical.content_governance_authorities,to_jsonb(a)||jsonb_build_object('id',${quote(authorityId)},'person_id',${quote(person(2))},'evidence_ref',${quote(randomUUID())},'source_evidence_identity',${quote(randomUUID())}))).* FROM clinical.content_governance_authorities a WHERE person_id=${quote(person(3))}::uuid AND action='signClinicalContentRelease';`,
  );
  const dualAttempt = await h.sign(id, h.issue(id, 2, 'approved', 'pharmacist'), {
    actor: 'clinician',
  });
  assert.equal(dualAttempt.statusCode, 403, dualAttempt.body);
  check('ACTUAL_DUAL_CREDENTIAL_SAME_PERSON_DENIED');
  // A distinct active grant does not rehabilitate the earlier accepted signature.
  const historicalGrant = signingBasis(h.owner, 2).authorityBasis.id,
    replacementGrant = randomUUID();
  sql(
    h.runtime,
    h.database,
    `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${quote(historicalGrant)}::uuid;INSERT INTO clinical.content_governance_authorities SELECT (jsonb_populate_record(NULL::clinical.content_governance_authorities,to_jsonb(a)||jsonb_build_object('id',${quote(replacementGrant)},'status','active','version',1,'evidence_ref',${quote(randomUUID())},'source_evidence_identity',${quote(randomUUID())}))).* FROM clinical.content_governance_authorities a WHERE id=${quote(historicalGrant)}::uuid;`,
  );
  const originalPhysician = await h.sign(id, p, { version: 1, key: keys[0] });
  assert.equal(originalPhysician.statusCode, 403, originalPhysician.body);
  assert.deepEqual(signatureHistory(), snapshot);
  check('ACTUAL_UNRELATED_REPLACEMENT_NO_REHABILITATION');
  check('ZERO_EXTERNAL_KEYS_UNDER_LOCKS', h.counters().externalUnderLocks === 0);
  const durable = counts(h);
  assert.equal(durable.signatures, durable.sidecars);
  assert.equal(durable.receipts, durable.obligations);
  assert.equal(durable.receipts, durable.completed);
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
    durable,
    counters: h.counters(),
    syntheticSourcesOnly: true,
    cleanup: 'OWNED_TEMP_DATABASE_AND_NATIVE_ACCOUNTS',
  };
}
const paths = [
  'services/api/src/modules/feature-011/sign-release.ts',
  'services/api/src/modules/feature-011/sign-release.test.ts',
  'services/api/src/modules/feature-011/create-release.ts',
  'services/api/src/routes/feature-011-content.ts',
  'services/api/src/adapters/postgres/feature-011-content.ts',
  'services/api/src/app.ts',
  'tools/run-feature-011-sign-api-test.mjs',
  'tools/run-feature-011-content-api-test.mjs',
  'tools/feature-011-content-fixtures.mjs',
  'tools/run-feature-011-allergy-api-test.mjs',
];
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const gate = await verifyFeature011Contracts();
  assert.equal(gate.result, 'PASS', gate.failures.join('\n'));
  const physical = currentPhysicalSourceDigests(root),
    inputs = Object.fromEntries(paths.map((p) => [p, digest(p)])),
    results = [];
  for (const runtime of runtimes) {
    console.log(runtime.name + ': K16 native signing contention proof');
    const result = await withSigning(runtime, prove);
    assert.equal(result.result, 'PASS');
    assert(result.count > 0 && result.races.length >= 2);
    results.push(result);
  }
  assert.deepEqual(currentPhysicalSourceDigests(root), physical);
  for (const [p, h] of Object.entries(inputs)) assert.equal(digest(p), h);
  const e = f + '/evidence/fresh-implementation/K16';
  mkdirSync(e, { recursive: true });
  const proof = {
    checkpoint: 'K16',
    capturedAt: new Date().toISOString(),
    tasks: ['T061', 'T062'],
    result: 'PASS',
    inputs,
    physicalSourceDigests: physical,
    runtimes: results,
    syntheticEngineeringOnly: true,
    realQualificationOrClinicalAcceptance: false,
    retainedGates: 'UNCHANGED_OPEN',
    acceptance: 'PENDING_PRODUCT_OWNER',
  };
  for (const name of ['sign-api', 'sign-api-proof'])
    writeFileSync(e + '/' + name + '.json', JSON.stringify(proof, null, 2) + '\n');
  console.log(
    JSON.stringify({
      result: 'PASS',
      runtimes: results.map((r) => ({ runtime: r.runtime, count: r.count, races: r.races.length })),
    }),
  );
}
