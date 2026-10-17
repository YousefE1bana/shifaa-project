import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import type { MessagingAdapter } from '../../services/worker/src/privacy-dsr-notifications.ts';

const patient = '50000000-0000-4000-8000-000000000001';
const guardian = '50000000-0000-4000-8000-000000000002';
const subject = '51000000-0000-4000-8000-000000000001';
const dpo = '50000000-0000-4000-8000-000000000006';

export async function createPrivacyStack(context?: object) {
  // Dynamic imports retain one ESM capability authority under Node/tsx's
  // CommonJS TypeScript loader; require(ESM) would create a second module realm.
  const { acquireTestLauncherContext, releaseTestLauncherContext, trackTestLauncherClose } =
    await import('../../tools/test-launcher-session.mjs');
  const {
    revalidateTestResourceContext,
    connectTestOwner,
    withTestResource,
    guardTestHandle,
    registerRunRecord,
    assertRunOwned,
  } = await import('../../tools/test-resource-context.mjs');
  context = await acquireTestLauncherContext('privacy', context);
  revalidateTestResourceContext(context, 'privacy');
  const [{ default: postgres }, { buildApp }, { loadConfig }] = await Promise.all([
    import('postgres'),
    import('../../services/api/src/app.ts'),
    import('../../services/api/src/config.ts'),
  ]);
  const owner = (await connectTestOwner(context, 'privacy', (url: string) =>
    postgres(url, { max: 2 }),
  )) as postgres.Sql;
  try {
    const config = loadConfig({ NODE_ENV: 'test' });
    const harness = await withTestResource(context, 'privacy', 'api', async (databaseUrl: string) =>
      buildApp({
        config: {
          ...config,
          repositoryAdapter: 'postgres',
          databaseUrl,
        },
        clock: { now: () => new Date() },
      }),
    );
    harness.app = guardTestHandle(context, 'privacy', harness.app, ['inject']);
    return {
      app: harness.app,
      owner,
      createWorker: async (adapter: MessagingAdapter) =>
        withTestResource(context, 'privacy', 'worker', async (url: string) => {
          const { PostgresPrivacyNotificationProcessor } = await import(
            '../../services/worker/src/privacy-dsr-notifications.ts'
          );
          revalidateTestResourceContext(context, 'privacy');
          const worker = new PostgresPrivacyNotificationProcessor(url, adapter);
          worker.close = trackTestLauncherClose('privacy', context, worker.close.bind(worker));
          return guardTestHandle(context, 'privacy', worker, ['processNext']);
        }),
      ids: { patient, guardian, subject, dpo },
      create: async (
        requestType: 'access_export' | 'correction' | 'restriction' | 'erasure_pseudonymization',
        dataCategoryCodes = ['profile.demographics'],
        actor = patient,
      ) => {
        const response = await harness.app.inject({
          method: 'POST',
          url: '/v1/privacy/requests',
          headers: {
            authorization: `Bearer synthetic-person:${actor}`,
            'x-shifaa-patient-context': subject,
            'x-aal': '2',
            'idempotency-key': `privacy-e2e-${randomUUID()}`,
          },
          payload: {
            request_type: requestType,
            scope: { data_category_codes: dataCategoryCodes },
            contact_preference: 'in_app',
          },
        });
        if (response.statusCode === 201)
          registerRunRecord(
            context,
            'privacy',
            'request',
            response.json().request_id ?? response.json().id,
          );
        return response;
      },
      assign: async (requestId: string) => {
        assertRunOwned(context, 'privacy', 'request', requestId);
        const decisionEvidence = randomUUID();
        const fulfilmentEvidence = randomUUID();
        await owner.begin(async (sql) => {
          await sql`insert into consent.dsr_assignments(request_id,dpo_person_id,assigned_by_person_id,assignment_reason_code) values(${requestId}::uuid,${dpo}::uuid,'50000000-0000-4000-8000-000000000010','synthetic.e2e.assignment')`;
          await sql`insert into identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,resource_dsr_id,sha256,mime_type,size_bytes,scan_status,released_at) values(${decisionEvidence}::uuid,'dsr-export',${`synthetic/privacy-005/e2e/${requestId}/decision`},${dpo}::uuid,${subject}::uuid,${requestId}::uuid,${'8'.repeat(64)},'application/pdf',1,'released',now()),(${fulfilmentEvidence}::uuid,'dsr-export',${`synthetic/privacy-005/e2e/${requestId}/fulfilment`},${dpo}::uuid,${subject}::uuid,${requestId}::uuid,${'9'.repeat(64)},'application/json',1,'released',now())`;
          await sql`select set_config('shifaa.person_id',${dpo},true),set_config('shifaa.actor_role','DPO',true),set_config('shifaa.aal','2',true),set_config('shifaa.purposes','privacy.dsr.review',true)`;
          const [row] = await sql<
            any[]
          >`update consent.data_subject_requests set status='under_review' where id=${requestId}::uuid returning version`;
          await sql`insert into consent.data_subject_request_events(request_id,aggregate_version,actor_person_id,actor_type,event_type,from_status,to_status,reason_code) values(${requestId}::uuid,${row.version},${dpo}::uuid,'dpo','under_review','submitted','under_review','synthetic.e2e.assignment')`;
        });
        return { decisionEvidence, fulfilmentEvidence };
      },
      close: async () => {
        try {
          await harness.app.close();
        } finally {
          await owner.end({ timeout: 5 });
        }
        releaseTestLauncherContext('privacy', context);
      },
    };
  } catch (error) {
    await owner.end({ timeout: 5 });
    throw error;
  }
}

export const dpoHeaders = () => ({
  authorization: `Bearer synthetic-dpo:${dpo}`,
  'x-aal': '2',
  'x-purpose': 'privacy.dsr.review',
});
export const mutationKey = () => `privacy-e2e-${randomUUID()}`;
