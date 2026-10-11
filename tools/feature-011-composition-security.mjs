// Actual native Auth/API abuse composition over exact harness-owned databases.
// Synthetic authority/material is not clinical or production-source acceptance.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withPublication } from './feature-011-publication-fixtures.mjs';
import { request as draft } from './run-feature-011-content-api-test.mjs';
import { patient } from './run-feature-011-allergy-api-test.mjs';
import { runtimes, digest } from './run-feature-011-postgres-test.mjs';
import { Feature011Governance } from '../services/api/src/modules/feature-011/list-clinical-content.ts';
import { verifyFeature011Contracts } from './verify-feature-011-contracts.mjs';
import { evidence } from './run-feature-011-composition-test.mjs';

const output = `${evidence}/reruns/native-abuse`;
const ownPerson = 'f0110000-0000-4000-8000-000000000001';
const otherPerson = 'f0110000-0000-4000-8000-000000000006';
const specimen = 'K22_PROTECTED_FACT_SENTINEL';
const spoof = {
  'x-person-id': otherPerson,
  'x-actor-role': 'ADM-MEDICAL',
  'x-aal': '2',
  'x-shifaa-person-id': otherPerson,
  'shifaa.person_id': otherPerson,
  'shifaa.actor_role': 'ADM-MEDICAL',
};
const report = {
  substance: { identity: 'synthetic-neutral', display: specimen },
  source: { display: 'Synthetic self-report' },
};
const results = [];
const before = await verifyFeature011Contracts();
assert.equal(before.result, 'PASS');
for (const runtime of runtimes) {
  console.log(runtime.name + ': K22 native/GUC attribution and API abuse');
  results.push(
    await withPublication(
      runtime,
      async (h) => {
        const checks = [];
        const count = () =>
          h.owner(
            `SELECT json_build_object('allergies',(SELECT count(*) FROM clinical.allergies),'releases',(SELECT count(*) FROM clinical.content_releases),'signatures',(SELECT count(*) FROM audit.signature_evidence),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'completed',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed'));`,
          );
        const resource = randomUUID();
        const endpoints = [
          {
            id: 'listAllergies',
            method: 'GET',
            url: `/v1/patients/${patient}/allergies`,
            actor: 'patient',
          },
          {
            id: 'createAllergy',
            method: 'POST',
            url: `/v1/patients/${patient}/allergies`,
            body: report,
            actor: 'patient',
          },
          {
            id: 'verifyAllergy',
            method: 'POST',
            url: `/v1/allergies/${resource}/verification`,
            body: {
              targetStatus: 'clinician_confirmed',
              reason: 'Synthetic K22 reason',
              verificationEvidenceRef: randomUUID(),
              encounterId: 'f0110000-0000-4000-8400-000000000001',
            },
            actor: 'clinician',
          },
          {
            id: 'listClinicalContent',
            method: 'GET',
            url: '/v1/admin/clinical-content/synthetic?projection=governance',
            actor: 'medical',
          },
          {
            id: 'createClinicalContentRelease',
            method: 'POST',
            url: '/v1/admin/clinical-content/synthetic/releases',
            body: draft,
            actor: 'medical',
          },
          {
            id: 'signClinicalContentRelease',
            method: 'POST',
            url: `/v1/admin/clinical-content/releases/${resource}/signatures`,
            body: {
              artifactVersion: 1,
              artifactDigest: draft.artifact.declaredDigest,
              capacity: 'physician',
              decision: 'approved',
              signingEvidenceRef: randomUUID(),
            },
            actor: 'clinician',
          },
          {
            id: 'publishClinicalContentRelease',
            method: 'POST',
            url: `/v1/admin/clinical-content/releases/${resource}/publish`,
            body: {
              artifactVersion: 1,
              artifactDigest: draft.artifact.declaredDigest,
              confirmPublication: true,
            },
            actor: 'publisher',
          },
        ];
        for (const endpoint of endpoints) {
          for (const scenario of [
            'missing-auth',
            'unrecognized-native',
            'claimed-person',
            'low-aal',
            'missing-purpose',
          ]) {
            // AAL2 is mandatory for clinician actions, not PAT read/report.
            const actor =
              scenario === 'low-aal' && endpoint.actor === 'patient' ? 'clinician' : endpoint.actor;
            const patch =
              scenario === 'missing-auth'
                ? { authorization: '' }
                : scenario === 'unrecognized-native'
                  ? { authorization: 'Bearer invalid-native' }
                  : scenario === 'claimed-person'
                    ? { authorization: 'Bearer synthetic-person:' + otherPerson, ...spoof }
                    : scenario === 'low-aal'
                      ? { authorization: 'Bearer ' + h.actors[actor].aal1, ...spoof }
                      : { 'x-purpose': '' };
            const previous = count();
            const body =
              scenario === 'low-aal' && endpoint.id === 'createAllergy'
                ? { ...endpoint.body, encounterId: 'f0110000-0000-4000-8400-000000000001' }
                : endpoint.body;
            const response = await h.request(endpoint.method, body, {
              url: endpoint.url,
              actor,
              headers: { 'if-match': '"1"', ...patch },
            });
            assert.equal(
              response.statusCode,
              ['low-aal', 'missing-purpose'].includes(scenario) ? 403 : 401,
              endpoint.id + ': ' + scenario,
            );
            assert.deepEqual(count(), previous, 'Denied request commits no effect');
            for (const forbidden of [
              specimen,
              'keyRef',
              'privateReviewSources',
              'credentialBasis',
              'protectedBody',
            ])
              assert(!response.body.includes(forbidden));
            checks.push({
              operation: endpoint.id,
              scenario,
              result: 'PASS',
              status: response.statusCode,
            });
          }
        }
        // A valid native identity stays authoritative even with contrary GUC-like headers.
        const created = await h.request('POST', report, { headers: spoof });
        assert.equal(created.statusCode, 201);
        const identity = h.owner(
          `SELECT json_build_object('person',original_recorder_person_id,'patient',patient_id) FROM clinical.allergies WHERE id='${created.json().revisionId}'::uuid;`,
        );
        assert.deepEqual(identity, { person: ownPerson, patient });
        checks.push({
          operation: 'createAllergy',
          scenario: 'native-person-overrides-client-guc-claims',
          result: 'PASS',
        });
        for (const [operation, url, actor] of [
          ['listAllergies', `/v1/patients/${patient}/allergies`, 'patient'],
          [
            'listClinicalContent',
            '/v1/admin/clinical-content/synthetic?projection=governance',
            'medical',
          ],
        ]) {
          const response = await h.request('GET', undefined, { url, actor, headers: spoof });
          assert.equal(response.statusCode, 200);
          checks.push({
            operation,
            scenario: 'authorized-native-read-positive-control',
            result: 'PASS',
          });
        }
        const state = count();
        const denied = await h.content(draft, { actor: 'patient', headers: spoof });
        assert.equal(denied.statusCode, 403);
        assert.deepEqual(count(), state);
        checks.push({
          operation: 'createClinicalContentRelease',
          scenario: 'client-role-cannot-elevate-patient',
          result: 'PASS',
        });
        const sinks = h.owner(
          `SELECT json_build_object('audit',(SELECT json_agg(to_jsonb(t)) FROM audit.events t),'outbox',(SELECT json_agg(to_jsonb(t)) FROM platform.outbox_events t),'idempotency',(SELECT json_agg(to_jsonb(t)) FROM platform.idempotency_records t));`,
        );
        assert(!JSON.stringify(sinks).includes(specimen));
        assert.equal(h.counters().externalUnderLocks, 0);
        return {
          runtime: runtime.name,
          serverVersion: h.health.manifest.serverVersion,
          result: 'PASS',
          checks,
          count: checks.length,
          allSeven: endpoints.map((x) => x.id),
          gucValuesAuthenticate: false,
          verifiedNativeAttribution: identity,
          zeroEffectsForDenials: true,
          prohibitedSinkScan: 'PASS',
          externalUnderLocks: 0,
        };
      },
      async (args) => ({
        reading: new Feature011Governance({
          ...args.deps,
          repository: args.repository,
          cursorKey: randomBytes(32),
          context: {
            resolve: async (actor) =>
              Number(actor.personId.slice(-12)) === 2
                ? { role: 'CLN', facilityId: 'f0110000-0000-4000-8200-000000000001' }
                : { role: 'ADM-MEDICAL' },
          },
        }),
      }),
    ),
  );
}
const after = await verifyFeature011Contracts();
assert.equal(after.result, 'PASS');
assert.deepEqual(after.inputDigests, before.inputDigests);
mkdirSync(output, { recursive: true });
writeFileSync(
  output + '/proof.json',
  JSON.stringify(
    {
      task: 'T082',
      result: 'PASS',
      runtimes: results,
      sourceSha256: digest('tools/feature-011-composition-security.mjs'),
      capturedAt: new Date().toISOString(),
      syntheticOnly: true,
      retainedGates: 'UNCHANGED_OPEN',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    result: 'PASS',
    counts: results.map((x) => ({ runtime: x.runtime, count: x.count })),
  }),
);
