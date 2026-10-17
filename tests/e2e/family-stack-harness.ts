import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';

export async function createFamilyStack(context?: object) {
  // Dynamic imports retain one ESM capability authority under Node/tsx's
  // CommonJS TypeScript loader; require(ESM) would create a second module realm.
  const { acquireTestLauncherContext } = await import('../../tools/test-launcher-session.mjs');
  const { revalidateTestResourceContext, connectTestOwner, withTestResource, guardTestHandle } =
    await import('../../tools/test-resource-context.mjs');
  context = await acquireTestLauncherContext('family', context);
  revalidateTestResourceContext(context, 'family');
  const [{ default: postgres }, { buildApp }, { loadConfig }] = await Promise.all([
    import('postgres'),
    import('../../services/api/src/app.ts'),
    import('../../services/api/src/config.ts'),
  ]);
  const owner = (await connectTestOwner(context, 'family', (url: string) =>
    postgres(url, { max: 2 }),
  )) as postgres.Sql;
  try {
    const ids = {
      self: randomUUID(),
      dependent: randomUUID(),
      guardian: randomUUID(),
      delegate: randomUUID(),
      reviewer: randomUUID(),
      unrelated: randomUUID(),
      selfPatient: randomUUID(),
      dependentPatient: randomUUID(),
      evidence: randomUUID(),
    };
    const run = randomUUID();
    for (const [person, label] of [
      [ids.self, 'self'],
      [ids.dependent, 'dependent'],
      [ids.guardian, 'guardian'],
      [ids.delegate, 'delegate'],
      [ids.reviewer, 'reviewer'],
      [ids.unrelated, 'unrelated'],
    ] as const)
      await owner`insert into identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status) values(${person}::uuid,${randomUUID()}::uuid,${`Synthetic E2E ${label}`},'EG','en-EG','active')`;
    await owner`insert into identity.patients(id,person_id,medical_record_number) values(${ids.selfPatient}::uuid,${ids.self}::uuid,${`SYN-E2E-S-${run}`}),(${ids.dependentPatient}::uuid,${ids.dependent}::uuid,${`SYN-E2E-D-${run}`})`;
    await owner`insert into identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id) values(${randomUUID()}::uuid,${ids.selfPatient}::uuid,${ids.self}::uuid,'self','active','2026-01-01T00:00:00Z',${ids.self}::uuid),(${randomUUID()}::uuid,${ids.dependentPatient}::uuid,${ids.dependent}::uuid,'self','active','2026-01-01T00:00:00Z',${ids.dependent}::uuid)`;
    await owner`insert into identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status,released_at) values(${ids.evidence}::uuid,'guardianship-evidence',${`synthetic/e2e/${run}`},${ids.guardian}::uuid,${ids.dependentPatient}::uuid,${'9'.repeat(64)},'application/pdf',1,'released','2026-08-11T08:00:00Z')`;
    const base = loadConfig({ NODE_ENV: 'test' });
    const harness = await withTestResource(context, 'family', 'api', async (databaseUrl: string) =>
      buildApp({
        config: {
          ...base,
          repositoryAdapter: 'postgres',
          databaseUrl,
        },
        // Keep synthetic application time aligned with PostgreSQL's transaction time so
        // forced-RLS validity and invitation-expiry predicates share one authority window.
        clock: { now: () => new Date() },
      }),
    );
    harness.app = guardTestHandle(context, 'family', harness.app, ['inject']);
    return {
      app: harness.app,
      owner,
      ids,
      close: async () => {
        try {
          await harness.app.close();
        } finally {
          await owner.end({ timeout: 5 });
        }
      },
    };
  } catch (error) {
    await owner.end({ timeout: 5 });
    throw error;
  }
}

export const person = (id: string) => `Bearer synthetic-person:${id}`;
export const admin = (id: string) => `Bearer synthetic-admin:support_admin:${id}`;
export const key = () => `family-e2e-${randomUUID()}`;
