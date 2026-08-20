import { randomUUID } from 'node:crypto';

import { buildApp } from '@shifaa/api';
import { loadConfig } from '@shifaa/api/config';
import postgres from 'postgres';

const patient = '50000000-0000-4000-8000-000000000001';
const guardian = '50000000-0000-4000-8000-000000000002';
const subject = '51000000-0000-4000-8000-000000000001';
const dpo = '50000000-0000-4000-8000-000000000006';

export async function createPrivacyStack() {
  const owner = postgres('postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa', {
    max: 2,
  });
  const config = loadConfig({ NODE_ENV: 'test' });
  const harness = await buildApp({
    config: {
      ...config,
      repositoryAdapter: 'postgres',
      databaseUrl: 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa',
    },
    clock: { now: () => new Date() },
  });
  return {
    ...harness,
    owner,
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
      return response;
    },
    assign: async (requestId: string) => {
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
      await harness.app.close();
      await owner.end({ timeout: 5 });
    },
  };
}

export const dpoHeaders = () => ({
  authorization: `Bearer synthetic-dpo:${dpo}`,
  'x-aal': '2',
  'x-purpose': 'privacy.dsr.review',
});
export const mutationKey = () => `privacy-e2e-${randomUUID()}`;
