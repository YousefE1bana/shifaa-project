// K20 native/non-owner metadata composition. All admissions and people are synthetic.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Value } from '@sinclair/typebox/value';
import { feature011Schemas } from '../packages/contracts/src/feature-011.ts';
import { Feature011Client } from '../packages/api-client/src/feature-011.ts';
import { Feature011Governance } from '../services/api/src/modules/feature-011/list-clinical-content.ts';
import { withPublication, quote as q, person } from './feature-011-publication-fixtures.mjs';
import { request as initial } from './run-feature-011-content-api-test.mjs';
import { root, runtimes, sql, digest, runtimeManifest } from './run-feature-011-postgres-test.mjs';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
} from './verify-feature-011-contracts.mjs';

const evidence =
  'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K20';
const paths = [
  'services/api/src/modules/feature-011/clinical-status.ts',
  'services/api/src/modules/feature-011/clinical-status.test.ts',
  'services/api/src/modules/feature-011/list-clinical-content.ts',
  'services/api/src/routes/feature-011-content.ts',
  'services/api/src/adapters/postgres/feature-011-content.ts',
  'packages/contracts/src/feature-011.ts',
  'packages/api-client/src/feature-011.ts',
  'tools/run-feature-011-status-test.mjs',
  'tools/feature-011-publication-fixtures.mjs',
];
const parity = await verifyFeature011Contracts();
assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
const pins = currentPhysicalSourceDigests(root),
  inputs = Object.fromEntries(paths.map((p) => [p, digest(p)])),
  results = [];
const facility = 'f0110000-0000-4000-8200-000000000001';
// A changed predecessor/time changes ARTIFACT/1: the frozen initial digest is not its digest.
const { declaredDigest: initialDigest, ...successorArtifact } = initial.artifact;
assert(initialDigest);
const privateFields = [
  'body',
  'artifactReview',
  'artifactDigest',
  'workflowVersion',
  'signatures',
  'signerPersonId',
  'evidenceRef',
  'keyRef',
  'privateReviewSources',
  'protectedBody',
  'credentialDocuments',
];
for (const runtime of runtimes) {
  runtimeManifest(runtime);
  const scenarios = [];
  for (const scenario of ['lifecycle', 'credential', 'designation', 'signing-grant']) {
    console.log(runtime.name + ': clean K20 ' + scenario);
    const control = {
        facility,
        role: 'CLN',
        reading: false,
        resolver: 0,
        keys: 0,
        inject: null,
        sqlRows: 0,
      },
      checks = [];
    const result = await withPublication(
      runtime,
      async (h) => {
        const check = (id) => {
          checks.push({ id, result: 'PASS' });
          console.log(runtime.name + ': ' + scenario + ' ' + id);
        };
        const state = () =>
          h.owner(
            `SELECT json_build_object('releases',(SELECT count(*) FROM clinical.content_releases),'signatures',(SELECT count(*) FROM audit.signature_evidence),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'idempotency',(SELECT count(*) FROM platform.idempotency_records));`,
          );
        const read = async (query = {}, options = {}) => {
          const before = state(),
            crypto = h.counters().keyPreparations;
          control.reading = true;
          try {
            const response = await h.request('GET', undefined, {
              actor: 'clinician',
              url:
                '/v1/admin/clinical-content/synthetic?' +
                new URLSearchParams({ projection: 'status', ...query }),
              ...options,
            });
            assert.deepEqual(state(), before, 'Status read must not mutate durable effects');
            assert.equal(h.counters().keyPreparations, crypto);
            for (const field of privateFields)
              assert(!response.body.includes('"' + field + '"'), field + ' absent from HTTP');
            assert(!response.body.includes('PRIVATE_SENTINEL'));
            if (response.statusCode === 200)
              assert(
                Value.Check(feature011Schemas.StatusList, response.json()),
                'Closed HTTP metadata schema',
              );
            return response;
          } finally {
            control.reading = false;
          }
        };
        const empty = async (id, query = {}) => {
          const r = await read(query);
          assert.equal(r.statusCode, 200, r.body);
          assert.deepEqual(r.json().data, []);
          check(id);
        };
        const denied = async (id, query = {}, options = {}, code = 403) => {
          const r = await read(query, options);
          assert.equal(r.statusCode, code, r.body);
          check(id);
        };
        const ready = await h.ready(),
          published = await h.publish(ready.id);
        assert.equal(published.statusCode, 200, published.body);
        const history = () =>
          h.owner(
            `SELECT json_build_object('release',to_jsonb(r),'signatures',(SELECT json_agg(to_jsonb(s) ORDER BY s.id) FROM audit.signature_evidence s WHERE s.resource_id=r.id),'sidecars',(SELECT json_agg(to_jsonb(b) ORDER BY b.signature_evidence_id) FROM clinical.content_signature_bindings b JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=r.id)) FROM clinical.content_releases r WHERE r.id=${q(ready.id)}::uuid;`,
          );
        const preserved = history();
        const current = await read();
        assert.equal(current.statusCode, 200, current.body);
        assert.equal(current.json().data[0].releaseId, ready.id);
        assert.equal(current.json().data[0].eligibility, 'effective');
        check('NATIVE_NON_OWNER_PUBLISHED_METADATA');
        if (scenario === 'lifecycle') {
          for (const locale of ['ar-EG', 'en-EG']) {
            const r = await read({}, { headers: { 'accept-language': locale } });
            assert.equal(r.statusCode, 200);
            assert.equal(r.headers['cache-control'], 'private, no-store');
            check('CLOSED_METADATA_' + locale);
          }
          const client = new Feature011Client({
            baseUrl: 'http://isolated.test',
            accessToken: () => h.actors.clinician.token,
            purpose: 'synthetic.feature011',
            fetch: async (url, init) => {
              const r = await read(
                {},
                {
                  url: new URL(String(url)).pathname + new URL(String(url)).search,
                  headers: Object.fromEntries(new Headers(init.headers)),
                },
              );
              return new Response(r.body, { status: r.statusCode, headers: r.headers });
            },
          });
          assert.equal(
            (await client.listClinicalContent('synthetic', { projection: 'status' })).data[0]
              .releaseId,
            ready.id,
          );
          check('GENERATED_CLIENT_EXACT_SQL_API_ALLOWLIST');
          for (const field of privateFields) {
            control.inject = field;
            await denied('PRIVATE_' + field + '_FAILS_ENTIRE_RESPONSE');
            control.inject = null;
          }
          await denied(
            'NO_NATIVE_SESSION',
            {},
            { headers: { authorization: 'Bearer invalid' } },
            401,
          );
          await denied(
            'NATIVE_AAL1_NOT_HEADER_UPGRADABLE',
            {},
            { headers: { authorization: 'Bearer ' + h.actors.clinician.aal1, 'x-aal': '2' } },
          );
          await denied('MISSING_PURPOSE', {}, { headers: { 'x-purpose': '' } });
          await denied('SIGNING_ALONE_NO_STATUS_GRANT', {}, { actor: 'pharmacist' });
          await denied('ADMIN_IS_NOT_CLINIC', {}, { actor: 'medical' });
          for (const field of ['facilityId', 'personId', 'role'])
            await denied('CLIENT_CLAIM_' + field, { [field]: randomUUID() }, {}, 422);
          control.facility = randomUUID();
          await denied('WRONG_CURRENT_FACILITY');
          control.facility = facility;
          const grant = h.owner(
            `SELECT to_json(id) FROM clinical.content_governance_authorities WHERE person_id=${q(person(2))}::uuid AND action='listClinicalContent' AND capacity IS NULL;`,
          );
          sql(
            runtime,
            h.database,
            `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${q(grant)}::uuid;`,
          );
          await denied('REVOKED_CURRENT_STATUS_GRANT');
          sql(
            runtime,
            h.database,
            `UPDATE clinical.content_governance_authorities SET status='active',version=version+1 WHERE id=${q(grant)}::uuid;`,
          );
          const restored = await read();
          assert.equal(restored.statusCode, 200);
          assert.equal(restored.json().data[0].releaseId, ready.id);
          check('FRESH_CURRENT_READ_GRANT_RECHECKED');
          sql(
            runtime,
            h.database,
            `UPDATE identity.facility_memberships SET valid_until='2000-01-01' WHERE person_id=${q(person(2))}::uuid;`,
          );
          await denied('EXPIRED_WORKFORCE_MEMBERSHIP');
          sql(
            runtime,
            h.database,
            `UPDATE identity.facility_memberships SET valid_until=NULL WHERE person_id=${q(person(2))}::uuid;`,
          );
          const draft = await h.content({
            ...initial,
            artifact: successorArtifact,
            predecessor: { initial: false, supersedesReleaseId: ready.id },
          });
          assert.equal(draft.statusCode, 201, draft.body);
          await empty('NO_DRAFT_OR_UNSIGNED_DETAIL', { releaseId: draft.json().releaseId });
          const future = await h.ready({
            request: {
              ...initial,
              artifact: successorArtifact,
              effectiveAt: new Date(Date.now() + 30000).toISOString(),
              predecessor: { initial: false, supersedesReleaseId: ready.id },
            },
          });
          const fp = await h.publish(future.id);
          assert.equal(fp.statusCode, 200, fp.body);
          await empty('FUTURE_RELEASE_NOT_CURRENT_OR_DISCLOSED', { releaseId: future.id });
          assert.equal((await read()).json().data[0].releaseId, ready.id);
          check('FUTURE_RESERVATION_DOES_NOT_ACTIVATE');
          const boundary = new Date(fp.json().effectiveAt).getTime();
          while (Date.now() <= boundary + 20) await new Promise((r) => setTimeout(r, 100));
          assert.equal((await read()).json().data[0].releaseId, future.id);
          check('EFFECTIVE_BOUNDARY_SELECTS_SUCCESSOR');
          sql(
            runtime,
            h.database,
            `UPDATE clinical.content_admissibility_evidence SET status='revoked',version=version+1 WHERE id=${q(future.approval)}::uuid;`,
          );
          await empty('EXACT_ADMISSION_LOSS_NO_ANCESTOR_FALLBACK');
          const replacement = randomUUID();
          sql(
            runtime,
            h.database,
            `INSERT INTO clinical.content_admissibility_evidence SELECT (jsonb_populate_record(NULL::clinical.content_admissibility_evidence,to_jsonb(a)||jsonb_build_object('id',${q(replacement)}::uuid,'status','active','version',1,'source_evidence_identity',${q(randomUUID())}))).* FROM clinical.content_admissibility_evidence a WHERE id=${q(future.approval)}::uuid;`,
          );
          await empty('UNBOUND_BROAD_ADMISSION_CANNOT_REHABILITATE');
          for (const key of ['feature011Enabled', 'feature011KillSwitch']) {
            const previous = h.config[key];
            h.config[key] = key === 'feature011KillSwitch';
            try {
              await denied('DEFAULT_OFF_OR_KILL_' + key, {}, {}, 503);
            } finally {
              h.config[key] = previous;
            }
          }
        } else {
          const binding = h.owner(
            `SELECT to_jsonb(b) FROM clinical.content_signature_bindings b JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=${q(ready.id)}::uuid AND s.signer_role='pharmacist';`,
          );
          const table =
            scenario === 'credential'
              ? 'identity.professional_licenses'
              : scenario === 'designation'
                ? 'clinical.content_reviewer_designations'
                : 'clinical.content_governance_authorities';
          const id =
            binding[
              scenario === 'credential'
                ? 'credential_id'
                : scenario === 'designation'
                  ? 'designation_id'
                  : 'signing_authority_id'
            ];
          const change =
            scenario === 'credential'
              ? "expires_on='2000-01-01',version=version+1"
              : scenario === 'designation'
                ? "status='revoked',version=version+1"
                : 'version=version+1';
          sql(runtime, h.database, `UPDATE ${table} SET ${change} WHERE id=${q(id)}::uuid;`);
          await empty('CURRENT_EXACT_' + scenario + '_LOSS_NOT_HISTORY');
          if (scenario === 'signing-grant') {
            sql(
              runtime,
              h.database,
              `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${q(id)}::uuid;`,
            );
            await empty('REVOKED_BOUND_SIGNING_GRANT_UNAVAILABLE');
            sql(
              runtime,
              h.database,
              `INSERT INTO clinical.content_governance_authorities SELECT (jsonb_populate_record(NULL::clinical.content_governance_authorities,to_jsonb(a)||jsonb_build_object('id',${q(randomUUID())}::uuid,'status','active','version',1,'source_evidence_identity',${q(randomUUID())},'evidence_ref',${q(randomUUID())}::uuid))).* FROM clinical.content_governance_authorities a WHERE id=${q(id)}::uuid;`,
            );
            await empty('UNRELATED_REPLACEMENT_GRANT_DOES_NOT_REHABILITATE');
          }
        }
        assert.deepEqual(history(), preserved);
        check('IMMUTABLE_RELEASE_SIGNATURE_SIDECAR_HISTORY');
        assert.equal(control.resolver, 0);
        assert.equal(control.keys, 0);
        assert(control.sqlRows > 0);
        assert.equal(h.counters().externalUnderLocks, 0);
        check('ZERO_STATUS_RESOLVER_DECRYPTOR_OR_MUTATION');
        return {
          runtime: runtime.name,
          scenario,
          health: h.health,
          checks,
          count: checks.length,
          sqlMetadataRows: control.sqlRows,
          statusResolverCalls: control.resolver,
          statusKeyPreparations: control.keys,
          counters: h.counters(),
          native: true,
          nonOwner: true,
          clinicalApproval: false,
        };
      },
      (args) => {
        const source = args.deps.material.resolve.bind(args.deps.material),
          prepare = args.provider.prepare.bind(args.provider),
          original = args.repository.readContext.bind(args.repository);
        args.deps.material.resolve = async (...a) => {
          if (control.reading) {
            control.resolver++;
            throw Error('STATUS_RESOLVER_FORBIDDEN');
          }
          return source(...a);
        };
        args.provider.prepare = async (...a) => {
          if (control.reading) {
            control.keys++;
            throw Error('STATUS_KEY_PREPARATION_FORBIDDEN');
          }
          return prepare(...a);
        };
        const repository = {
          readContext: async (...a) => {
            const rows = await original(...a);
            if (a[2].projection === 'status') {
              for (const row of rows) {
                assert(
                  Value.Check(feature011Schemas.StatusRelease, row),
                  'Closed real SQL metadata',
                );
                control.sqlRows++;
              }
              return control.inject
                ? rows.map((r) => ({ ...r, [control.inject]: 'PRIVATE_SENTINEL' }))
                : rows;
            }
            return rows;
          },
        };
        return {
          reading: new Feature011Governance({
            repository,
            material: args.deps.material,
            evidence: args.deps.evidence,
            cursorKey: randomBytes(32),
            context: {
              resolve: async (actor) =>
                Number(actor.personId.slice(-12)) === 2
                  ? { role: control.role, facilityId: control.facility }
                  : Number(actor.personId.slice(-12)) === 3
                    ? { role: 'PHA', facilityId: facility }
                    : { role: 'ADM-MEDICAL' },
            },
          }),
        };
      },
    );
    assert(result.cleanup.absenceVerified);
    scenarios.push(result);
  }
  results.push({
    runtime: runtime.name,
    scenarios,
    count: scenarios.reduce((n, s) => n + s.count, 0),
    result: 'PASS',
  });
}
assert.deepEqual(currentPhysicalSourceDigests(root), pins);
for (const [p, h] of Object.entries(inputs)) assert.equal(digest(p), h);
const final = await verifyFeature011Contracts();
assert.equal(final.result, 'PASS', final.failures.join('\n'));
mkdirSync(evidence, { recursive: true });
writeFileSync(
  evidence + '/status-proof.json',
  JSON.stringify(
    {
      result: 'PASS',
      checkpoint: 'K20',
      task: 'T076',
      inputs,
      physicalSourceDigests: pins,
      parityPins: Object.keys(final.inputDigests).length,
      runtimes: results,
      allowlist:
        'Generated StatusRelease/StatusList closed schemas at SQL→serializer→HTTP→generated client',
      unavailable:
        'Empty authorized current set; no ancestor fallback or clinical inference. Future/failed eligibility metadata is not invented.',
      syntheticOnly: true,
      retainedGates: 'UNCHANGED_OPEN',
      acceptance: 'PENDING_PRODUCT_OWNER',
      capturedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    result: 'PASS',
    runtimes: results.map((r) => ({ runtime: r.runtime, checks: r.count })),
  }),
);
