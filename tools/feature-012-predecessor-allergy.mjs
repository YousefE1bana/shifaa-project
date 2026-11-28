import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PostgresFeature011Allergies } from '../services/api/src/adapters/postgres/feature-011-allergies.ts';
import { Feature011Allergies } from '../services/api/src/modules/feature-011/allergies.ts';

const facility = 'f0110000-0000-4000-8200-000000000001';
const clinician = 'f0110000-0000-4000-8000-000000000002';
const encounter = 'f0110000-0000-4000-8400-000000000001';
const patient = 'f0110000-0000-4000-8100-000000000001';
const sourceIdentity = 'synthetic.internal_clinician_provenance';
const keyRef = 'synthetic-local/k13/versions/1';

export function openAllergyFixture(config, support) {
  const postgres = createRequire('/opt/deps/services/api/package.json')('postgres');
  const pool = postgres(config.databaseUrl, { max: 2, prepare: false, onnotice() {} });
  const key = readFileSync('/tmp/f012-allergy-key');
  assert.equal(key.length, 32);
  // Reuse the K13 synthetic selector. The installed SQL independently checks
  // current care and the exact patient, facility, encounter and actor on each use.
  const repository = new PostgresFeature011Allergies(
    pool,
    randomBytes(32),
    async (actor, subject, requested) =>
      actor.personId === clinician && subject === patient && (!requested || requested === encounter)
        ? { facilityId: facility, encounterId: encounter }
        : undefined,
  );
  const service = new Feature011Allergies({
    repository,
    provider: {
      async prepare(_purpose, exact) {
        assert.ok(exact === undefined || exact === keyRef);
        return { key: Buffer.from(key), keyRef, immutable: true, release() {} };
      },
    },
    evidence: {
      mode: 'isolated-synthetic',
      sourceIdentity,
      now: () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z'),
    },
    support: {
      async lookup(ref) {
        assert.equal(ref, support?.id);
        return {
          contractId: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
          profile: 'allergy_verification',
          bindingId: randomUUID(),
          producerId: 'f011.allergy_evidence_boundary',
          verifiedAt: support.verifiedAt,
          evidenceRef: ref,
          patientId: patient,
          allergyId: support.allergyId,
          previousRevisionId: support.previousRevisionId,
          previousVersion: support.previousVersion,
          revisionId: randomUUID(),
          revisionVersion: support.previousVersion + 1,
          targetStatus: support.targetStatus,
          attestorPersonId: clinician,
          sourceIdentity,
          sourceEvidenceIdentity: ref,
          synthetic: true,
          consumed: false,
        };
      },
    },
  });
  return {
    service,
    async close() {
      key.fill(0);
      await pool.end();
    },
  };
}

export async function allergyApi(app, fixtures, input) {
  const listing = '/v1/patients/' + patient + '/allergies';
  const verify = input.action === 'verify';
  const history = input.action === 'history';
  const clinicalActor = verify || input.reporter === 'clinician';
  const correctsAllergyId = input.action === 'correct' ? input.allergyId : undefined;
  const requestId = randomUUID();
  const response = await app.inject({
    method: history ? 'GET' : 'POST',
    url: verify
      ? '/v1/allergies/' + input.support.allergyId + '/verification'
      : listing + (history ? '?view=history&allergyId=' + input.allergyId : ''),
    headers: {
      authorization: 'Bearer ' + fixtures[clinicalActor ? 0 : 1].token,
      'accept-language': 'en-EG',
      'x-purpose': 'synthetic.feature011',
      'x-request-id': requestId,
      ...(history ? {} : { 'idempotency-key': randomUUID() }),
      ...(verify ? { 'if-match': '"' + input.support.previousVersion + '"' } : {}),
    },
    ...(history
      ? {}
      : {
          payload: verify
            ? {
                targetStatus: input.support.targetStatus,
                verificationEvidenceRef: input.support.id,
                reason: 'K13 synthetic verification only',
                encounterId: encounter,
              }
            : {
                substance: { identity: 'synthetic-neutral', display: 'K13 neutral fixture' },
                source: { display: 'Synthetic self report' },
                ...(clinicalActor ? { encounterId: encounter } : {}),
                ...(correctsAllergyId ? { correctsAllergyId } : {}),
              },
        }),
  });
  const body = response.json();
  const summary = ({
    allergyId,
    revisionId,
    previousRevisionId,
    correctsAllergyId,
    status,
    version,
  }) => ({ allergyId, revisionId, previousRevisionId, correctsAllergyId, status, version });
  return {
    result: {
      status: response.statusCode,
      requestId,
      ...(response.statusCode >= 400
        ? { code: body.code }
        : { revisions: (history ? body.data : [body]).map(summary) }),
    },
  };
}
