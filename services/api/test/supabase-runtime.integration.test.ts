import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp, type AppHarness } from '../src/app.js';
import { loadConfig } from '../src/config.js';

type Status = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string; MAILPIT_URL: string };
let status: Status;
let first: AppHarness;
let second: AppHarness;
let token = '';
let profileId = '';
let caseId = '';
const email = `runtime-${Date.now()}@synthetic.shifaa.test`;
const identityValue = `29913${String(Date.now()).slice(-9)}`;

function runtimeConfig() {
  return loadConfig({
    NODE_ENV: 'development',
    SHIFAA_SYNTHETIC_MODE: 'true',
    SYNTHETIC_PROOFING_ENABLED: 'true',
    AUTH_ADAPTER: 'supabase',
    REPOSITORY_ADAPTER: 'postgres',
    PROOFING_ADAPTER: 'local',
    UPLOAD_ADAPTER: 'supabase',
    SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_JWKS_URL: `${status.API_URL}/auth/v1/.well-known/jwks.json`,
    SUPABASE_JWT_ISSUER: `${status.API_URL}/auth/v1`,
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    DATABASE_URL: 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:54322/postgres',
    IDENTITY_ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString('base64'),
    IDENTITY_BLIND_INDEX_KEY_BASE64: Buffer.alloc(32, 1).toString('base64'),
    PREAUTH_HMAC_KEY_BASE64: Buffer.alloc(32, 2).toString('base64'),
  });
}
const mutationHeaders = (key: string, accessToken?: string) => ({
  'idempotency-key': key,
  ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
});

async function otpFor(recipient: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list: any = await fetch(`${status.MAILPIT_URL}/api/v1/messages`).then((r) => r.json());
    const summary = list.messages.find((m: any) => m.To?.some((t: any) => t.Address === recipient));
    if (summary) {
      const message: any = await fetch(`${status.MAILPIT_URL}/api/v1/message/${summary.ID}`).then(
        (r) => r.json(),
      );
      const match = message.Text.match(/\b\d{6}\b/);
      if (match) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Mailpit OTP not received.');
}

beforeAll(async () => {
  status = JSON.parse(
    execFileSync(
      process.env['ComSpec'] ?? 'cmd.exe',
      ['/d', '/s', '/c', 'pnpm supabase status -o json'],
      { cwd: '../..', encoding: 'utf8' },
    ),
  ) as Status;
  first = await buildApp({ config: runtimeConfig() });
});
afterAll(async () => {
  await first?.app.close();
  await second?.app.close();
});

describe.sequential('002 Supabase runtime', () => {
  it('uses real Auth OTP/JWKS and persists the complete slice', async () => {
    const registration = await first.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: mutationHeaders('runtime-register-0001'),
      payload: { handle: email, password: 'Local-only-002!Pass', locale: 'en-EG' },
    });
    expect(registration.statusCode).toBe(201);
    const verification = await first.app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      headers: mutationHeaders('runtime-verify-00001'),
      payload: { challenge_id: registration.json().challenge_id, code: await otpFor(email) },
    });
    expect(verification.statusCode).toBe(200);
    token = verification.json().access_token;
    const profile = await first.app.inject({
      method: 'GET',
      url: '/v1/people/me',
      headers: { authorization: `Bearer ${token}` },
    });
    profileId = profile.json().id;
    const updated = await first.app.inject({
      method: 'PATCH',
      url: '/v1/people/me',
      headers: { ...mutationHeaders('runtime-profile-0001', token), 'if-match': '"1"' },
      payload: { display_name: 'Persistent Synthetic Patient', birth_date: '2000-02-02' },
    });
    expect(updated.statusCode).toBe(200);
    const identity = await first.app.inject({
      method: 'POST',
      url: '/v1/people/me/identities',
      headers: mutationHeaders('runtime-identity-0001', token),
      payload: {
        identity_type: 'egyptian_national_id',
        value: identityValue,
        issuing_country: 'EG',
      },
    });
    expect(identity.statusCode).toBe(201);
    caseId = identity.json().verification_case.id;
    expect(identity.json().masked_value).toBe(`••••••••••${identityValue.slice(-4)}`);
    const notice = await first.app.inject({
      method: 'GET',
      url: '/v1/privacy/notices/current',
      headers: { 'accept-language': 'en-EG' },
    });
    const purpose = notice.json().purposes.find((p: any) => p.purpose_code === 'identity_proofing');
    const consent = await first.app.inject({
      method: 'POST',
      url: '/v1/privacy/consents',
      headers: mutationHeaders('runtime-consent-0001', token),
      payload: {
        purpose_code: purpose.purpose_code,
        purpose_version: purpose.version,
        decision: 'granted',
        notice_version: notice.json().version,
      },
    });
    expect(consent.statusCode).toBe(201);
  });

  it('replays a stored response and survives an API restart', async () => {
    const key = 'runtime-profile-replay-0001';
    const request = {
      method: 'PATCH' as const,
      url: '/v1/people/me',
      headers: { ...mutationHeaders(key, token), 'if-match': '"2"' },
      payload: { nationality_code: 'EG' },
    };
    const original = await first.app.inject(request);
    expect(original.statusCode).toBe(200);
    await first.app.close();
    second = await buildApp({ config: runtimeConfig() });
    const replay = await second.app.inject(request);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(original.json());
    const profile = await second.app.inject({
      method: 'GET',
      url: '/v1/people/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(profile.json()).toMatchObject({
      id: profileId,
      display_name: 'Persistent Synthetic Patient',
      version: 3,
    });
    const consents = await second.app.inject({
      method: 'GET',
      url: '/v1/privacy/consents',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(consents.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ purpose_code: 'identity_proofing', decision: 'granted' }),
      ]),
    );
    const queue = await second.app.inject({
      method: 'GET',
      url: '/v1/admin/identity-verifications',
      headers: {
        authorization: ['Bearer', 'synthetic-reviewer:fixture'].join(' '),
        'x-aal': '2',
        'x-purpose': 'identity.review',
      },
    });
    expect(queue.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: caseId,
          masked_value: `••••••••••${identityValue.slice(-4)}`,
        }),
      ]),
    );
  });

  it('rejects forged sessions and public storage reads', async () => {
    const forged = await second.app.inject({
      method: 'GET',
      url: '/v1/people/me',
      headers: { authorization: ['Bearer', 'forged.header.payload'].join(' ') },
    });
    expect(forged.statusCode).toBe(401);
    const publicRead = await fetch(
      `${status.API_URL}/storage/v1/object/public/identity-evidence/${caseId}/missing.jpg`,
      { headers: { apikey: status.ANON_KEY } },
    );
    expect([400, 401, 403, 404]).toContain(publicRead.status);
  });

  it('collapses concurrent same-key consent into one domain/audit/outbox effect', async () => {
    const admin = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', { max: 1 });
    const counts = async () => {
      const [row] = await admin<{ consents: number; audits: number; events: number }[]>`
        select
          (select count(*)::int from consent.records where person_id=${profileId}::uuid and purpose_code='care_updates') consents,
          (select count(*)::int from audit.events where actor_person_id=${profileId}::uuid and action='consent.decision.recorded' and metadata->>'purpose_code'='care_updates') audits,
          (select count(*)::int from platform.outbox_events where event_type='consent.changed' and payload->>'purpose_code'='care_updates') events`;
      if (!row) throw new Error('Count query failed.');
      return row;
    };
    const before = await counts();
    const payload = {
      purpose_code: 'care_updates',
      purpose_version: '1.0.0',
      decision: 'granted',
      notice_version: '1.0.0',
    };
    const request = {
      method: 'POST' as const,
      url: '/v1/privacy/consents',
      headers: mutationHeaders('runtime-consent-race-001', token),
      payload,
    };
    const [left, right] = await Promise.all([
      second.app.inject(request),
      second.app.inject(request),
    ]);
    expect(left.statusCode).toBe(201);
    expect(right.statusCode).toBe(201);
    expect(left.json()).toEqual(right.json());
    const after = await counts();
    expect(after).toEqual({
      consents: before.consents + 1,
      audits: before.audits + 1,
      events: before.events + 1,
    });
    await admin.end();
  });

  it('uploads only through a signed quarantine URL and does not leak pooled RLS context', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const invalidBase = {
      method: 'POST' as const,
      url: `/v1/identity-verifications/${caseId}/upload-intent`,
    };
    const wrongChecksum = await second.app.inject({
      ...invalidBase,
      headers: mutationHeaders('runtime-upload-invalid1', token),
      payload: { mime_type: 'image/jpeg', size_bytes: bytes.length, sha256: 'not-a-checksum' },
    });
    expect(wrongChecksum.statusCode).toBe(400);
    const tooLarge = await second.app.inject({
      ...invalidBase,
      headers: mutationHeaders('runtime-upload-invalid2', token),
      payload: { mime_type: 'image/jpeg', size_bytes: 11 * 1024 * 1024, sha256: digest },
    });
    expect(tooLarge.statusCode).toBe(400);
    const wrongMime = await second.app.inject({
      ...invalidBase,
      headers: mutationHeaders('runtime-upload-invalid3', token),
      payload: { mime_type: 'text/plain', size_bytes: bytes.length, sha256: digest },
    });
    expect(wrongMime.statusCode).toBe(400);
    const intent = await second.app.inject({
      method: 'POST',
      url: `/v1/identity-verifications/${caseId}/upload-intent`,
      headers: mutationHeaders('runtime-upload-00001', token),
      payload: {
        mime_type: 'image/jpeg',
        size_bytes: bytes.length,
        sha256: digest,
      },
    });
    expect(intent.statusCode).toBe(201);
    const upload = await fetch(intent.json().upload_url, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: bytes,
    });
    expect(upload.ok).toBe(true);

    const sql = postgres('postgresql://shifaa_api:synthetic_api_only@127.0.0.1:54322/postgres', {
      max: 1,
    });
    await sql.begin(async (tx) => {
      await tx`select set_config('shifaa.person_id',${profileId},true),set_config('shifaa.actor_role','PAT',true)`;
      const [own] = await tx<{ count: number }[]>`select count(*)::int count from identity.people`;
      expect(own?.count).toBe(1);
      await tx`select set_config('shifaa.person_id',${randomUUID()},true),set_config('shifaa.actor_role','PAT',true)`;
      const [other] = await tx<
        { count: number }[]
      >`select count(*)::int count from identity.people`;
      expect(other?.count).toBe(0);
      const [otherCases] = await tx<
        { count: number }[]
      >`select count(*)::int count from identity.verification_cases`;
      expect(otherCases?.count).toBe(0);
      await tx`select set_config('shifaa.person_id','00000000-0000-4000-8000-000000000002',true),set_config('shifaa.actor_role','ADM-FACILITY',true),set_config('shifaa.aal','1',true),set_config('shifaa.purposes','identity.review',true)`;
      const [aal1] = await tx<
        { count: number }[]
      >`select count(*)::int count from identity.verification_cases`;
      expect(aal1?.count).toBe(0);
      await tx`select set_config('shifaa.aal','2',true),set_config('shifaa.purposes','',true)`;
      const [missingPurpose] = await tx<
        { count: number }[]
      >`select count(*)::int count from identity.verification_cases`;
      expect(missingPurpose?.count).toBe(0);
      await tx`select set_config('shifaa.purposes','identity.review',true)`;
      const [authorized] = await tx<
        { count: number }[]
      >`select count(*)::int count from identity.verification_cases`;
      expect(authorized?.count).toBeGreaterThanOrEqual(1);
    });
    await sql.end();
  });
});
