import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { withAllergyApi, runK11, patient } from './run-feature-011-allergy-api-test.mjs';
import { runtimes, sql, digest } from './run-feature-011-postgres-test.mjs';
import { PostgresIdentityRepository } from '../services/api/src/adapters/postgres/identity-repository.ts';
import { PostgresFeature010EncounterRepository } from '../services/api/src/adapters/postgres/feature-010-encounters.ts';
import { PostgresFeature010NotesRepository } from '../services/api/src/adapters/postgres/feature-010-notes.ts';
const e =
  'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K12/identifier-reconciliation';
const encounter = 'f0110000-0000-4000-8400-000000000001',
  facility = 'f0110000-0000-4000-8200-000000000001';
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const results = [];
for (const runtime of runtimes) {
  console.log(runtime.name + ': authoritative handoff');
  results.push(
    await withAllergyApi(runtime, async (h) => {
      const repo = new PostgresIdentityRepository(
        `postgres://shifaa_api:synthetic_api_only@127.0.0.1:${runtime.name === 'shifaa-local-postgres' ? 5432 : 54322}/${h.database}`,
      );
      const tests = [];
      try {
        for (const actor of ['patient', 'clinician', 'outsider']) {
          const native = await h.native(h.actors[actor].token);
          assert.ok(native);
          const profile = await repo.profileByAuthSubject(native.subjectId);
          assert.equal(profile.id, native.personId);
          assert.equal(profile.managedPatientId, actor === 'patient' ? patient : null);
          tests.push(`native-${actor}-own-profile`);
        }
        const native = await h.native(h.actors.clinician.token);
        const encounters = new PostgresFeature010EncounterRepository(
          repo,
          'local',
          new PostgresFeature010NotesRepository(repo, 'local', randomBytes(32)),
        );
        const dto = await encounters.getEncounter(
          {
            personId: native.personId,
            principal: native.subjectId,
            requestId: randomUUID(),
            traceId: randomUUID(),
            aal: native.aal,
            locale: 'en-EG',
            purposes: ['synthetic.feature011'],
          },
          encounter,
        );
        assert.equal(dto.patientId, h.actors.patient.personId);
        assert.equal(dto.patientPersonId, h.actors.patient.personId);
        assert.equal(dto.managedPatientId, patient);
        assert.equal(dto.facilityId, facility);
        tests.push('existing-F010-adapter-generated-contract-pair');
        const projection = (overrides = {}) => {
          const ctx = {
            person_id: native.personId,
            actor_role: 'CLN',
            action: 'getEncounter',
            environment: 'local',
            request_id: randomUUID(),
            trace_id: randomUUID(),
            aal: '2',
            purposes: 'synthetic.feature011',
            facility_id: facility,
            encounter_id: encounter,
            principal: native.subjectId,
            ...overrides,
          };
          const input = `BEGIN; ${Object.entries(ctx)
            .map(([k, v]) => `SELECT set_config('shifaa.${k}',${q(v)},true);`)
            .join(
              '\n',
            )} SELECT clinical.feature_010_get_encounter_projection_v1(${q(encounter)}::uuid); ROLLBACK;`;
          return sql(runtime, h.database, input, { user: 'shifaa_api', allowFailure: true });
        };
        let got = projection();
        assert.equal(got.exitCode, 0, got.output);
        const parsed = JSON.parse(got.stdout.trim().split('\n').at(-1));
        assert.equal(parsed.patientId, h.actors.patient.personId);
        assert.equal(parsed.patientPersonId, h.actors.patient.personId);
        assert.equal(parsed.managedPatientId, patient);
        assert.equal(parsed.facilityId, facility);
        tests.push('authorized-F010-canonical-pair');
        for (const [name, ctx] of Object.entries({
          wrongActor: {
            person_id: h.actors.outsider.personId,
            principal: (await h.native(h.actors.outsider.token)).subjectId,
          },
          missingPurpose: { purposes: '' },
        })) {
          const denied = projection(ctx);
          assert.ok(denied.exitCode !== 0 || !denied.stdout.includes(patient), name);
          tests.push(`F010-${name}-denied`);
        }
        got = projection({
          facility_id: randomUUID(),
          managed_patient_id: randomUUID(),
          patient_person_id: randomUUID(),
        });
        assert.equal(got.exitCode, 0, got.output);
        assert.equal(JSON.parse(got.stdout.trim().split('\n').at(-1)).managedPatientId, patient);
        tests.push('client-claimed-mapping-and-facility-ignored');
        sql(
          runtime,
          h.database,
          `UPDATE identity.facility_memberships SET membership_status='suspended' WHERE person_id=${q(native.personId)}::uuid;`,
        );
        assert.ok(!projection().stdout.includes(patient));
        tests.push('actual-facility-membership-loss-denied');
        sql(
          runtime,
          h.database,
          `UPDATE identity.facility_memberships SET membership_status='active' WHERE person_id=${q(native.personId)}::uuid;`,
        );
        assert.equal(await repo.profileByAuthSubject(randomUUID()), undefined);
        tests.push('unknown-native-subject-no-other-mapping');
        for (const actor of ['patient', 'clinician'])
          for (const locale of ['ar-EG', 'en-EG']) {
            const body = {
              substance: {
                identity: `synthetic-k12-${actor}-${locale}`,
                display: 'اختبار اصطناعي / Synthetic neutral',
              },
              source: { display: 'Synthetic engineering report' },
              ...(actor === 'clinician' ? { encounterId: encounter } : {}),
            };
            const created = await h.request('POST', body, {
              actor,
              key: randomUUID(),
              headers: { 'accept-language': locale },
            });
            assert.equal(created.statusCode, 201, created.body);
            assert.equal(created.headers['content-language'], locale);
            const response = created.json();
            assert.equal(response.patientId, patient);
            assert.equal(response.status, 'self_reported');
            assert.equal(response.coding.knowledge, 'unknown');
            assert.equal(response.substance.display, body.substance.display);
            const read = await h.request('GET', undefined, {
              actor,
              headers: { 'accept-language': locale },
            });
            assert.equal(read.statusCode, 200, read.body);
            assert.equal(read.headers['content-language'], locale);
            assert.ok(read.json().data.some((row) => row.revisionId === response.revisionId));
            tests.push(`native-${actor}-${locale}-read-report-original-response`);
          }
        assert.equal(h.counters().externalUnderLocks, 0);
        return {
          runtime: runtime.name,
          result: 'PASS',
          tests,
          count: tests.length,
          actualNativeAuth:
            'Supabase ES256 with native TOTP AAL2; owner synthetic accounts cleaned by harness',
          databaseRole: 'shifaa_api',
          noNewGrant: true,
        };
      } finally {
        await repo.close();
      }
    }),
  );
}
mkdirSync(e, { recursive: true });
writeFileSync(
  `${e}/handoff-proof.json`,
  JSON.stringify(
    {
      result: 'PASS',
      command: 'corepack pnpm exec tsx tools/run-feature-011-handoff-test.mjs',
      runtimes: results,
      inputs: Object.fromEntries(
        [
          'tools/run-feature-011-handoff-test.mjs',
          'services/api/src/adapters/postgres/identity-repository.ts',
          'supabase/migrations/20261008013921_f010_patient_identifier_handoff.sql',
          'packages/contracts/src/feature-010.ts',
        ].map((p) => [p, digest(p)]),
      ),
      syntheticOnly: true,
    },
    null,
    2,
  ) + '\n',
);
await runK11({ evidenceDirectory: `${e}/k11-regression` });
