// K17 supplementary exact active-replacement and elapsed-time locked revalidation.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withPublication, quote as q } from './feature-011-publication-fixtures.mjs';
import { runtimes, root, sql, digest, runtimeManifest } from './run-feature-011-postgres-test.mjs';
import { session, marker } from './run-feature-011-concurrency-test.mjs';
import { currentPhysicalSourceDigests } from './verify-feature-011-contracts.mjs';
const paths = [
  'tools/run-feature-011-publication-boundary-test.mjs',
  'tools/feature-011-publication-fixtures.mjs',
  'services/api/src/modules/feature-011/publish-release.ts',
  'services/api/src/modules/feature-011/create-release.ts',
  'services/api/src/modules/feature-011/material-evidence.ts',
  'services/api/src/adapters/postgres/feature-011-content.ts',
  'services/api/src/routes/feature-011-content.ts',
  'services/api/src/app.ts',
];
const inputs = Object.fromEntries(paths.map((p) => [p, digest(p)])),
  pins = currentPhysicalSourceDigests(root),
  results = [];
function counts(h) {
  return h.owner(
    `SELECT json_build_object('published',(SELECT count(*) FROM clinical.content_releases WHERE status='published'),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'completed',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed'));`,
  );
}
for (const runtime of runtimes) {
  console.log(runtime.name + ': K17 exact replacement + elapsed time');
  results.push(
    await withPublication(runtime, async (h) => {
      const checks = [],
        races = [];
      const eligible = (id) =>
        h.owner(`SELECT to_json(clinical.f011_release_current_eligibility_v1(${q(id)}::uuid));`);
      const historyVisible = async (id) => {
        const native = await h.native(h.actors.medical.token);
        assert(native);
        const rows = await h.repository.read(
          {
            ...native,
            requestId: randomUUID(),
            locale: 'en-EG',
            purposes: ['synthetic.feature011'],
          },
          'synthetic',
          { projection: 'governance', releaseId: id },
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].eligibility, 'unavailable');
        assert.equal(rows[0].signatures.length, 2);
      };
      // Two legitimately provisioned exact approvals are ambiguous, never a
      // broad "at least one" admission predicate. Both bindings remain history.
      const ambiguous = await h.ready(),
        secondApproval = randomUUID();
      sql(
        runtime,
        h.database,
        `INSERT INTO clinical.content_admissibility_evidence SELECT (jsonb_populate_record(NULL::clinical.content_admissibility_evidence,to_jsonb(a)||jsonb_build_object('id',${q(secondApproval)}::uuid,'source_evidence_identity',${q(randomUUID())}))).* FROM clinical.content_admissibility_evidence a WHERE id=${q(ambiguous.approval)}::uuid;`,
      );
      await h.offline.admission(secondApproval);
      assert.equal(eligible(ambiguous.id), false);
      await historyVisible(ambiguous.id);
      const beforeAmbiguous = counts(h),
        ambiguousResponse = await h.publish(ambiguous.id);
      assert.equal(ambiguousResponse.statusCode, 403, 'Ambiguous exact admission must deny');
      assert.deepEqual(counts(h), beforeAmbiguous);
      assert.equal(
        h.owner(
          `SELECT to_json(count(*)) FROM clinical.content_artifact_admissibility_bindings WHERE release_id=${q(ambiguous.id)}::uuid;`,
        ),
        2,
      );
      checks.push({
        id: 'AMBIGUOUS_EXACT_ADMISSION_UNAVAILABLE_AND_PUBLICATION_DENIED',
        result: 'PASS',
        historicalBindings: 2,
      });
      const serverNow = h.owner('SELECT to_json(clock_timestamp());'),
        expiry = new Date(Date.parse(serverNow) + 25000).toISOString(),
        candidate = await h.ready({ validUntil: expiry });
      assert(eligible(candidate.id));
      const c = session(
        runtime,
        h.database,
        h.database.replace('k08', 'k07') + '_holder',
        runtime.user,
      );
      c.send(
        `BEGIN;SET LOCAL idle_in_transaction_session_timeout='60s';SELECT pg_advisory_xact_lock(hashtextextended('synthetic'||chr(31)||'neutral-series'||chr(31)||'synthetic-scope',0));SELECT 'HELD';`,
      );
      await marker(c, 'HELD');
      try {
        const before = counts(h),
          pending = h.publish(candidate.id);
        let locks;
        const end = Date.now() + 15000;
        while (Date.now() < end) {
          locks = h.owner(
            `SELECT coalesce(json_agg(json_build_object('pid',pid,'blocking',pg_blocking_pids(pid),'waiting',(SELECT count(*) FROM pg_locks l WHERE l.pid=a.pid AND NOT granted))),'[]'::json) FROM pg_stat_activity a WHERE datname=${q(h.database)} AND usename='shifaa_api' AND wait_event_type='Lock';`,
          );
          if (locks.some((r) => r.blocking.length && r.waiting)) break;
          await new Promise((r) => setTimeout(r, 25));
        }
        assert(
          locks.some((r) => r.blocking.length && r.waiting),
          'Actual API series wait required',
        );
        const remaining = Date.parse(expiry) - Date.now() + 150;
        assert(remaining < 30000);
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
        c.send("COMMIT;SELECT 'DONE';");
        await marker(c, 'DONE');
        const denied = await pending;
        assert.equal(denied.statusCode, 403, denied.body);
        assert.deepEqual(counts(h), before);
        races.push({
          id: 'ADMISSION_EFFECTIVE_EXPIRY_AFTER_REAL_WAIT',
          result: 'PASS',
          expiry,
          beforeEligible: true,
          afterEligible: eligible(candidate.id),
          pgLocks: locks,
          denial: 403,
        });
      } finally {
        if (!c.ended) {
          c.send('ROLLBACK;\n\\q');
          await c.closed;
        }
      }
      for (const [kind, table, column] of [
        ['credential', 'identity.professional_licenses', 'credential_id'],
        ['designation', 'clinical.content_reviewer_designations', 'designation_id'],
      ]) {
        const { id } = await h.ready(),
          basis = h.owner(
            `SELECT row_to_json(t) FROM ${table} t JOIN clinical.content_signature_bindings b ON b.${column}=t.id JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=${q(id)}::uuid AND s.signer_role='physician';`,
          ),
          replacement = randomUUID();
        sql(
          runtime,
          h.database,
          `UPDATE ${table} SET status=${q(kind === 'credential' ? 'rejected' : 'revoked')},version=version+1 WHERE id=${q(basis.id)}::uuid;INSERT INTO ${table} SELECT (jsonb_populate_record(NULL::${table},to_jsonb(t)||jsonb_build_object('id',${q(replacement)}::uuid,'status',${q(kind === 'credential' ? 'verified' : 'active')},'version',1${kind === 'credential' ? ",'number_hash',decode(repeat('c',64),'hex')" : `, 'evidence_ref',${q(randomUUID())}::uuid,'source_evidence_identity',${q(randomUUID())}`}))).* FROM ${table} t WHERE id=${q(basis.id)}::uuid;`,
        );
        const before = counts(h);
        assert.equal(eligible(id), false);
        await historyVisible(id);
        const denied = await h.publish(id);
        assert.equal(denied.statusCode, 403, denied.body);
        assert.deepEqual(counts(h), before);
        checks.push({
          id: kind + '_ACTIVE_UNRELATED_REPLACEMENT_NOT_REHABILITATION',
          result: 'PASS',
          historicalId: basis.id,
          replacementId: replacement,
        });
        sql(
          runtime,
          h.database,
          `UPDATE ${table} SET status=${q(kind === 'credential' ? 'rejected' : 'revoked')},version=version+1 WHERE id=${q(replacement)}::uuid;UPDATE ${table} SET status=${q(basis.status)},version=version+1 WHERE id=${q(basis.id)}::uuid;`,
        );
      }
      return {
        result: 'PASS',
        runtime: runtime.name,
        runtimeIdentity: runtimeManifest(runtime),
        health: h.health,
        predecessor: h.predecessor,
        migrations: h.migrations,
        checks,
        races,
        counters: h.counters(),
      };
    }),
  );
}
assert.deepEqual(currentPhysicalSourceDigests(root), pins);
for (const [p, hash] of Object.entries(inputs)) assert.equal(digest(p), hash);
const e =
  'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/' +
  (process.argv.includes('--k18-revalidation') ? 'K18/k17-revalidation' : 'K17');
mkdirSync(e, { recursive: true });
writeFileSync(
  e + '/publication-boundaries.json',
  JSON.stringify(
    {
      result: 'PASS',
      checkpoint: 'K17',
      tasks: ['T065', 'T066'],
      capturedAt: new Date().toISOString(),
      inputs,
      physicalSourceDigests: pins,
      runtimes: results,
      syntheticEngineeringOnly: true,
      acceptance: 'PENDING_PRODUCT_OWNER',
    },
    null,
    2,
  ) + '\n',
);
console.log('K17 supplementary both-runtime PASS');
