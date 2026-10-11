// K18: real native/non-owner authorized resolver composition, synthetic source only.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { root, runtimes, sql, digest, runtimeManifest } from './run-feature-011-postgres-test.mjs';
import {
  withPublication,
  quote as q,
  person,
  publicationRow,
} from './feature-011-publication-fixtures.mjs';
import { request as initial } from './run-feature-011-content-api-test.mjs';
import { Feature011Governance } from '../services/api/src/modules/feature-011/list-clinical-content.ts';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
  currentEvidenceRoot,
} from './verify-feature-011-contracts.mjs';
const f = 'specs/011-allergies-clinical-content-governance',
  e = f + '/evidence/fresh-implementation/K18';
const paths = [
  'services/api/src/modules/feature-011/artifact-review.ts',
  'services/api/src/modules/feature-011/artifact-review.test.ts',
  'services/api/src/modules/feature-011/list-clinical-content.ts',
  'services/api/src/modules/feature-011/create-release.ts',
  'services/api/src/modules/feature-011/material-evidence.ts',
  'services/api/src/modules/feature-011/publish-release.ts',
  'services/api/src/adapters/postgres/feature-011-content.ts',
  'services/api/src/routes/feature-011-content.ts',
  'services/api/src/app.ts',
  'tools/run-feature-011-review-test.mjs',
  'tools/feature-011-publication-fixtures.mjs',
  'tools/run-feature-011-sign-api-test.mjs',
  'tools/run-feature-011-content-api-test.mjs',
  'tools/run-feature-011-allergy-api-test.mjs',
];
const parity = await verifyFeature011Contracts();
assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
const pins = currentPhysicalSourceDigests(root),
  inputs = Object.fromEntries(paths.map((p) => [p, digest(p)]));
const vector = JSON.parse(readFileSync(f + '/contracts/artifact-canonicalization-v1-vectors.json'))
  .positive[0];
const exact = Object.fromEntries(
  Object.entries(vector.materialBytesHex).map(([k, v]) => [
    k,
    Buffer.from(v, 'hex').toString('utf8'),
  ]),
);
const results = [];
for (const runtime of runtimes) {
  runtimeManifest(runtime);
  console.log(runtime.name + ': K18 clean native exact review');
  const control = {
    mode: null,
    once: null,
    contextFacility: 'f0110000-0000-4000-8200-000000000001',
    lookups: 0,
    externalUnderLocks: 0,
    immutableFixtures: new Map(),
  };
  const result = await withPublication(
    runtime,
    async (h) => {
      const checks = [],
        check = (id, condition = true) => {
          assert.ok(condition, id);
          checks.push({ id, result: 'PASS' });
          console.log(runtime.name + ': ' + id);
        };
      const read = (query = {}, options = {}) =>
        h.request('GET', undefined, {
          actor: 'medical',
          url:
            '/v1/admin/clinical-content/synthetic?' +
            new URLSearchParams({ projection: 'governance', ...query }),
          ...options,
        });
      const count = () =>
        h.owner(
          `SELECT json_build_object('domain',(SELECT count(*) FROM clinical.content_releases),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'completed',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed'));`,
        );
      const deny = async (id, work, status = 403) => {
        const before = count();
        const response = await work();
        assert.equal(response.statusCode, status, 'Redacted response status for ' + id);
        assert.deepEqual(count(), before);
        assert(!response.body.includes('artifactReview'));
        check(id);
        return response;
      };
      const created = await h.content(initial, { key: 'k18-original-create-response' });
      assert.equal(created.statusCode, 201, created.body);
      const id = created.json().releaseId;
      assert.deepEqual(created.json().artifactReview, exact);
      check('CREATE_EXACT_ORIGINAL_REVIEW');
      for (const locale of ['ar-EG', 'en-EG']) {
        const page = await read({ releaseId: id }, { headers: { 'accept-language': locale } });
        assert.equal(page.statusCode, 200, page.body);
        assert.deepEqual(page.json().data[0].artifactReview, exact);
        assert.equal(page.headers['cache-control'], 'private, no-store');
        check('EXACT_GOVERNANCE_UTF8_' + locale);
      }
      const calls = control.lookups;
      // The shared K06 fixture has separate read grants. Revoke only those in
      // this temporary DB so the negative actually represents signing alone.
      sql(
        runtime,
        h.database,
        `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE person_id IN (${q(person(2))}::uuid,${q(person(3))}::uuid) AND action='listClinicalContent' AND status='active';`,
      );
      await deny('SIGNING_ONLY_NO_READ_OR_RESOLVER', () =>
        read({ projection: 'assigned_review', releaseId: id }, { actor: 'clinician' }),
      );
      assert.equal(control.lookups, calls);
      await deny(
        'NO_NATIVE_IDENTITY',
        () => read({ releaseId: id }, { headers: { authorization: 'Bearer invalid' } }),
        401,
      );
      await deny('LOW_AAL_DENIED', () =>
        read({ releaseId: id }, { headers: { authorization: 'Bearer ' + h.actors.medical.aal1 } }),
      );
      await deny('MISSING_PURPOSE_DENIED', () =>
        read({ releaseId: id }, { headers: { 'x-purpose': '' } }),
      );
      await deny('CLAIMED_ROLE_REJECTED', () => read({ releaseId: id, role: 'ADM-MEDICAL' }), 422);
      await deny('STATUS_NEVER_RESOLVES_MATERIAL_IN_K18', () =>
        read({ projection: 'status', releaseId: id }),
      );
      assert.equal(control.lookups, calls);
      // Fixture-only, existing offline-governed read authority. No online/new grants or SQL changes.
      const readGrant = randomUUID(),
        event = randomUUID();
      sql(
        runtime,
        h.database,
        `BEGIN;INSERT INTO clinical.content_governance_authorities(id,person_id,action,capacity,content_type,governed_content_key,effective_scope_key,facility_id,issued_by,evidence_ref,evidence_producer_id,evidence_verified_at,source_identity,source_evidence_identity,status,valid_from,valid_until,version)
    VALUES(${q(readGrant)}::uuid,${q(person(2))}::uuid,'listClinicalContent',NULL,'synthetic',${q(initial.governedContentKey)},${q(initial.effectiveScopeKey)},${q(control.contextFacility)}::uuid,${q(person(8))}::uuid,${q(randomUUID())}::uuid,'f011.governance_provisioner',clock_timestamp(),'synthetic.k18.read-authority',${q(randomUUID())},'active','2020-01-01',NULL,1);
    SELECT * FROM audit.append_event_v1(${q(event)}::uuid,${q(event)},'clinical_content_evidence.provisioned','clinical.content_governance_authorities','success',p_actor_person_id=>${q(person(8))}::uuid,p_resource_id=>${q(readGrant)}::uuid,p_resource_version=>1,p_purpose_code=>'governed.feature011.provision',p_user_agent_class=>'service');COMMIT;`,
      );
      const assigned = await read(
        { projection: 'assigned_review', releaseId: id },
        { actor: 'clinician' },
      );
      assert.equal(assigned.statusCode, 200, assigned.body);
      assert.deepEqual(assigned.json().data[0].artifactReview, exact);
      for (const field of [
        'signatures',
        'creatorPersonId',
        'publisherPersonId',
        'keyRef',
        'privateReviewSources',
        'protectedBody',
        'credentialBasis',
      ])
        assert(!Object.hasOwn(assigned.json().data[0], field));
      check('SEPARATE_EXACT_REVIEW_AUTHORITY_CLOSED_DTO');
      control.contextFacility = randomUUID();
      await deny('WRONG_FACILITY_CONTEXT_DENIED', () =>
        read({ projection: 'assigned_review', releaseId: id }, { actor: 'clinician' }),
      );
      control.contextFacility = 'f0110000-0000-4000-8200-000000000001';
      await deny('WRONG_CONTENT_SCOPE_DENIED', () =>
        h.request('GET', undefined, {
          actor: 'clinician',
          url: '/v1/admin/clinical-content/other?projection=assigned_review&releaseId=' + id,
        }),
      );
      await deny('WRONG_RELEASE_DENIED', () =>
        read({ projection: 'assigned_review', releaseId: randomUUID() }, { actor: 'clinician' }),
      );
      for (const mode of [
        'unavailable',
        'reference',
        'hash',
        'binary',
        'type',
        'source',
        'correlation',
        'cross-resource',
      ]) {
        control.mode = mode;
        await deny(
          'SOURCE_' + mode.toUpperCase().replace('-', '_') + '_ATOMIC_DENIAL',
          () => read({ releaseId: id }),
          422,
        );
        control.mode = null;
      }
      // Entire page fails; neither the previously resolved first row nor partial DTO escapes.
      const another = await h.content();
      assert.equal(another.statusCode, 201, another.body);
      control.mode = 'later-row';
      await deny('WHOLE_PAGE_FAILURE_NO_PARTIAL_RESPONSE', () => read(), 422);
      control.mode = null;
      const first = await read({ limit: '1' });
      assert.equal(first.statusCode, 200, first.body);
      const cursor = first.json().meta.nextCursor;
      assert(cursor);
      const next = await read({ limit: '1', cursor });
      assert.equal(next.statusCode, 200, next.body);
      assert.notEqual(next.json().data[0].releaseId, first.json().data[0].releaseId);
      check('SCOPE_BOUND_CURSOR_CURRENT_REAUTHORIZATION');
      await deny('CURSOR_TAMPER_DENIED', () => read({ limit: '1', cursor: cursor + 'x' }), 422);
      await deny('CURSOR_SCOPE_SUBSTITUTION_DENIED', () => read({ limit: '2', cursor }), 422);
      // External lookup must see no API transaction holding locks; revoke between metadata/final check.
      control.once = () =>
        sql(
          runtime,
          h.database,
          `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${q(readGrant)}::uuid;`,
        );
      await deny('REVOKED_AFTER_RESOLUTION_FINAL_DISCLOSURE_DENIED', () =>
        read({ projection: 'assigned_review', releaseId: id }, { actor: 'clinician' }),
      );
      const unused = control.lookups;
      await deny('REVOKED_READ_AUTHORITY_DENIES_BEFORE_RESOLVER', () =>
        read({ projection: 'assigned_review', releaseId: id }, { actor: 'clinician' }),
      );
      assert.equal(control.lookups, unused);
      // Create replay is the stored original snapshot, even after signing advances workflow.
      const signing = await h.sign(id, h.issue(id, 2));
      assert.equal(signing.statusCode, 200, signing.body);
      const beforeReplay = count(),
        keys = h.counters().keyPreparations;
      const replay = await h.content(initial, { key: 'k18-original-create-response' });
      assert.equal(replay.statusCode, 201, replay.body);
      assert.equal(replay.body, created.body);
      assert.deepEqual(count(), beforeReplay);
      assert.equal(h.counters().keyPreparations, keys + 1);
      check('CREATE_ORIGINAL_REPLAY_NO_NEW_EFFECT_OR_ENCRYPTION');
      control.mode = 'unavailable';
      await deny(
        'CREATE_REPLAY_EVIDENCE_LOSS_DENIED',
        () => h.content(initial, { key: 'k18-original-create-response' }),
        422,
      );
      control.mode = null;
      const ready = await h.ready();
      const pub = await h.publish(ready.id, { key: 'k18-original-publish-response' });
      assert.equal(pub.statusCode, 200, pub.body);
      assert.deepEqual(pub.json().artifactReview, exact);
      check('PUBLISH_EXACT_PREPARED_REVIEW_CURRENT_SQL_AUTH');
      const version = publicationRow(h, ready.id).workflowVersion - 1,
        beforePub = count(),
        pubKeys = h.counters().keyPreparations;
      const pubReplay = await h.publish(ready.id, {
        key: 'k18-original-publish-response',
        version,
      });
      assert.equal(pubReplay.statusCode, 200, pubReplay.body);
      assert.equal(pubReplay.body, pub.body);
      assert.deepEqual(count(), beforePub);
      assert.equal(h.counters().keyPreparations, pubKeys + 1);
      check('PUBLISH_ORIGINAL_REPLAY_NO_NEW_EFFECT_OR_ENCRYPTION');
      control.mode = 'binary';
      await deny(
        'PUBLISH_REPLAY_INVALID_SOURCE_DENIED',
        () => h.publish(ready.id, { key: 'k18-original-publish-response', version }),
        422,
      );
      control.mode = null;
      // Post-acceptance producer repair: empty code/vector strings remain exact; BODY stays nonempty.
      const noDeclared = {
        ...initial,
        governedContentKey: 'k18-empty-material',
        artifact: { ...initial.artifact },
      };
      delete noDeclared.artifact.declaredDigest;
      for (const [kind, field] of [
        ['code', 'codeEvidenceRef'],
        ['testVectors', 'testVectorEvidenceRef'],
      ]) {
        const ref = randomUUID();
        noDeclared.artifact[field] = ref;
        control.immutableFixtures.set(ref, { kind, bytes: Buffer.alloc(0) });
      }
      const empty = await h.content(noDeclared);
      assert.equal(empty.statusCode, 201, empty.body);
      assert.deepEqual(empty.json().artifactReview, {
        content: exact.content,
        code: '',
        testVectors: '',
      });
      const emptyRead = await read({ releaseId: empty.json().releaseId });
      assert.equal(emptyRead.statusCode, 200, emptyRead.body);
      assert.deepEqual(emptyRead.json().data[0].artifactReview, empty.json().artifactReview);
      check('PERMITTED_EMPTY_CODE_VECTOR_ROUNDTRIP');
      const emptyBodyRef = randomUUID();
      control.immutableFixtures.set(emptyBodyRef, { kind: 'content', bytes: Buffer.alloc(0) });
      await deny(
        'EMPTY_BODY_REMAINS_DENIED',
        () =>
          h.content({
            ...noDeclared,
            artifact: { ...noDeclared.artifact, contentEvidenceRef: emptyBodyRef },
          }),
        403,
      );
      // Inspect only fetched metadata in JS: raw evidence sent to SQL even in a negative is forbidden.
      const sinks = h.owner(
        `SELECT json_build_object('audit',(SELECT coalesce(json_agg(to_jsonb(a)),'[]'::json) FROM audit.events a),'outbox',(SELECT coalesce(json_agg(to_jsonb(a)),'[]'::json) FROM platform.outbox_events a),'idempotency',(SELECT coalesce(json_agg(response_body),'[]'::json) FROM platform.idempotency_records),'receipts',(SELECT coalesce(json_agg(json_build_object('contract',receipt_contract_id,'bytes',octet_length(receipt_ciphertext),'nonce',octet_length(receipt_nonce),'tag',octet_length(receipt_auth_tag))),'[]'::json) FROM clinical.mutation_receipts));`,
      );
      const serialized = JSON.stringify({
        audit: sinks.audit,
        outbox: sinks.outbox,
        idempotency: sinks.idempotency,
      });
      for (const value of Object.values(exact)) if (value) assert(!serialized.includes(value));
      for (const forbidden of [
        'artifactReview',
        'keyRef',
        'privateReviewSources',
        'protectedBody',
        'credentialBasis',
        'designationBasis',
        'authorityBasis',
        'Restricted synthetic reason',
      ])
        assert(!serialized.includes(forbidden));
      assert(sinks.receipts.every((r) => r.bytes > 0 && r.nonce === 12 && r.tag === 16));
      check('DEDICATED_RECEIPT_CIPHERTEXT_GENERIC_SINKS_CLOSED');
      const closed = await read({ releaseId: ready.id });
      assert.equal(closed.statusCode, 200, closed.body);
      for (const forbidden of [
        'keyRef',
        'privateReviewSources',
        'protectedBody',
        'credentialBasis',
        'designationBasis',
        'authorityBasis',
        'Restricted synthetic reason',
      ])
        assert(!closed.body.includes(forbidden));
      check('GOVERNANCE_NO_PRIVATE_CRYPTO_SOURCE_DOCUMENTS');
      // Existing SQL clinic projection is independently closed; no application resolver capability.
      sql(
        runtime,
        h.database,
        `UPDATE clinical.content_governance_authorities SET status='active',version=version+1 WHERE id=${q(readGrant)}::uuid;`,
      );
      const actor = {
        ...(await h.native(h.actors.clinician.token)),
        requestId: randomUUID(),
        locale: 'en-EG',
        purposes: ['synthetic.feature011'],
      };
      const lookupCount = control.lookups,
        metadata = await h.repository.readContext(
          actor,
          'synthetic',
          { projection: 'status' },
          { role: 'CLN', facilityId: control.contextFacility },
        );
      for (const r of metadata)
        for (const forbidden of [
          'artifact',
          'artifactReview',
          'signatures',
          'keyRef',
          'privateReviewSources',
          'protectedBody',
          'creatorPersonId',
          'publisherPersonId',
        ])
          assert(!Object.hasOwn(r, forbidden));
      assert.equal(control.lookups, lookupCount);
      check('CLINIC_SQL_METADATA_CLOSED_NO_RESOLVER');
      // Current native profile loss makes pre-existing receipts unusable without source/key calls.
      sql(
        runtime,
        h.database,
        `UPDATE identity.people SET profile_status='suspended' WHERE id=${q(person(5))}::uuid;`,
      );
      const lostKeys = h.counters().keyPreparations,
        lostLookups = control.lookups;
      await deny('CREATE_REPLAY_LOST_CURRENT_DISCLOSURE_AUTHORITY', () =>
        h.content(initial, { key: 'k18-original-create-response' }),
      );
      assert.equal(h.counters().keyPreparations, lostKeys);
      assert.equal(control.lookups, lostLookups);
      sql(
        runtime,
        h.database,
        `UPDATE identity.people SET profile_status='active' WHERE id=${q(person(5))}::uuid;UPDATE identity.people SET profile_status='suspended' WHERE id=${q(person(6))}::uuid;`,
      );
      await deny('PUBLISH_REPLAY_LOST_CURRENT_DISCLOSURE_AUTHORITY', () =>
        h.publish(ready.id, { key: 'k18-original-publish-response', version }),
      );
      sql(
        runtime,
        h.database,
        `UPDATE identity.people SET profile_status='active' WHERE id=${q(person(6))}::uuid;`,
      );
      h.config.feature011KillSwitch = true;
      const kill = await read({ releaseId: id });
      assert.equal(kill.statusCode, 503, kill.body);
      check('KILL_SWITCH_DISCLOSURE_DENIED');
      h.config.feature011KillSwitch = false;
      const roles = h.owner(
        `SELECT coalesce(json_agg(json_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls)),'[]'::json) FROM pg_roles WHERE rolname IN ('shifaa_api','shifaa_f011_executor');`,
      );
      assert.equal(roles.length, 2);
      assert(roles.every((r) => !r.super && !r.bypass));
      check('NON_OWNER_ROLES_SECURITY_RETAINED');
      const counters = h.counters();
      assert.equal(counters.externalUnderLocks, 0);
      assert.equal(control.externalUnderLocks, 0);
      assert(counters.sqlSinkChecks > 0);
      check('ZERO_EXTERNAL_RESOLUTION_UNDER_LOCKS_NO_RAW_SQL');
      return {
        runtime: runtime.name,
        serverVersion: h.health.manifest.serverVersion,
        health: h.health,
        predecessor: h.predecessor,
        migrations: h.migrations,
        checks,
        count: checks.length,
        counters,
        resolver: { lookups: control.lookups, externalUnderLocks: control.externalUnderLocks },
        readAuthority: 'separate synthetic offline fixture; no product grant/privilege change',
        logging: 'application and isolated API logger disabled; redacted problem DTOs checked',
        syntheticEngineeringOnly: true,
      };
    },
    async (args) => {
      const originalResolve = args.deps.material.resolve.bind(args.deps.material);
      const resolvedMaterial = {
        resolve: async (kind, reference) => {
          control.lookups++;
          const locked = args.owner(
            `SELECT to_json(EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=${q(args.database)} AND usename='shifaa_api' AND xact_start IS NOT NULL));`,
          );
          if (locked) control.externalUnderLocks++;
          assert.equal(locked, false, 'External source lookup while API transaction open');
          if (control.once) {
            const fn = control.once;
            control.once = null;
            fn();
          }
          if (control.mode === 'unavailable') throw Error('Synthetic source unavailable');
          const immutable = control.immutableFixtures.get(reference);
          const v = immutable
            ? {
                kind: immutable.kind,
                reference,
                sourceIdentity: 'synthetic.k15',
                sourceEvidenceIdentity: reference,
                bytes: Buffer.from(immutable.bytes),
              }
            : await originalResolve(kind, reference);
          if (control.mode === 'reference') v.reference = randomUUID();
          if (control.mode === 'hash' || control.mode === 'cross-resource')
            v.bytes = Buffer.from('different neutral material');
          if (control.mode === 'binary') v.bytes = Buffer.from([0xff]);
          if (control.mode === 'type') v.kind = kind === 'content' ? 'code' : 'content';
          if (control.mode === 'source') v.sourceIdentity = 'synthetic.unapproved';
          if (control.mode === 'correlation') v.sourceEvidenceIdentity = randomUUID();
          if (control.mode === 'later-row' && control.lookups % 12 >= 6)
            v.bytes = Buffer.from('wrong later row');
          return v;
        },
      };
      // The same real source wrapper covers reads, create/publish preflight and receipt replay.
      args.deps.material.resolve = resolvedMaterial.resolve;
      return {
        reading: new Feature011Governance({
          ...args.deps,
          repository: args.repository,
          cursorKey: randomBytes(32),
          context: {
            resolve: async (actor) => {
              const n = Number(actor.personId.slice(-12));
              return n === 2
                ? { role: 'CLN', facilityId: control.contextFacility }
                : n === 3
                  ? { role: 'PHA', facilityId: control.contextFacility }
                  : { role: 'ADM-MEDICAL' };
            },
          },
        }),
      };
    },
  );
  results.push(result);
}
assert.deepEqual(currentPhysicalSourceDigests(root), pins);
for (const [p, hash] of Object.entries(inputs)) assert.equal(digest(p), hash);
mkdirSync(e, { recursive: true });
const proof = {
  checkpoint: 'K18',
  tasks: ['T068', 'T069'],
  result: 'PASS',
  capturedAt: new Date().toISOString(),
  inputs,
  physicalSourceDigests: pins,
  runtimes: results,
  sqlChanged: currentEvidenceRoot(root).includes('/K17/prerequisite-remediation'),
  prerequisiteEvidenceRoot: currentEvidenceRoot(root),
  productionKmsAcceptance: false,
  realClinicalAcceptance: false,
  retainedGates: 'UNCHANGED_OPEN',
  acceptance: 'PENDING_PRODUCT_OWNER',
};
for (const name of ['governance-read', 'review-proof'])
  writeFileSync(e + '/' + name + '.json', JSON.stringify(proof, null, 2) + '\n');
console.log(
  JSON.stringify({
    result: 'PASS',
    runtimes: results.map((r) => ({
      runtime: r.runtime,
      count: r.count,
      lookups: r.resolver.lookups,
    })),
  }),
);
