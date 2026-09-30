import { PatientOnboardingApi } from '../../apps/patient/src/identity-onboarding-api.js';
import { MemoryAccessTokenStore } from '../../packages/auth/src/identity-continuity.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../../services/api/src/app.js';
import { loadConfig } from '../../services/api/src/config.js';
import { PatientFeature010EncounterApi } from '../../apps/patient/src/feature-010-encounter.js';
import { PatientFeature010ChatApi } from '../../apps/patient/src/feature-010-chat.js';
import { PatientFeature010ReferralApi } from '../../apps/patient/src/feature-010-referrals.js';
import { rememberFeature010Session } from '../../apps/patient/src/feature-010-session.js';
import { createEncounterStartClients } from '../../apps/clinic/src/lib/feature-010-api.js';

const patient = 'f0100000-0000-4000-8000-000000000002';
const encounter = 'f0100000-0000-4000-8800-000000000001';
const appointment = 'f0100000-0000-4000-8500-000000000001';
const facility = 'f0100000-0000-4000-8200-000000000001';
const token = `synthetic-person:${patient}`;
const projection = {
  id: encounter,
  patientId: patient,
  facilityId: facility,
  appointmentId: appointment,
  responsibleClinicianId: patient,
  encounterType: 'consultation',
  status: 'open' as const,
  startedAt: '2030-04-05T08:00:00Z',
  version: 1,
};
const meta = { nextCursor: null, lastUpdatedAt: '2030-04-05T08:00:00Z', stale: false };
const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  rememberFeature010Session(token, undefined);
  await Promise.all(apps.splice(0).map(({ app }) => app.close()));
});

it('real patient adapters cross the generated transport and real routes with current session AAL and purpose', async () => {
  const send = vi.fn(async (_context: { actor: { aal: 1 | 2; purposes: readonly string[] } }) => ({
    id: encounter,
    contextType: 'appointment' as const,
    contextId: appointment,
    senderId: patient,
    body: 'Synthetic message',
    sentAt: meta.lastUpdatedAt,
  }));
  const harness = await buildApp({
    config: loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' }),
    feature010EncounterService: {
      getEncounter: vi.fn(async () => projection),
      createEncounter: vi.fn(),
      updateEncounter: vi.fn(),
      signEncounterNote: vi.fn(),
      completeEncounter: vi.fn(),
    },
    feature010MessageService: {
      listContextMessages: vi.fn(async () => ({ data: [], meta })),
      sendContextMessage: send,
    },
    feature010ReferralService: {
      listReferrals: vi.fn(async () => ({ data: [], meta })),
      createReferral: vi.fn(),
      acceptReferral: vi.fn(),
    },
  });
  apps.push(harness);
  const statuses: number[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const reply = await harness.app.inject({
      method: init?.method === 'POST' ? 'POST' : 'GET',
      url: new URL(String(input)).pathname + new URL(String(input)).search,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      ...(typeof init?.body === 'string' ? { payload: init.body } : {}),
    });
    statuses.push(reply.statusCode);
    return new Response(reply.body, {
      status: reply.statusCode,
      headers: reply.headers as Record<string, string>,
    });
  };
  const tokenStore = new MemoryAccessTokenStore();
  const onboarding = new PatientOnboardingApi(
    'http://synthetic.invalid',
    async (input) =>
      new Response(
        JSON.stringify(
          String(input).endsWith('/auth/login')
            ? { kind: 'challenge', challenge_id: 'synthetic-challenge' }
            : { kind: 'session', access_token: token, aal: 1 },
        ),
        { headers: { 'content-type': 'application/json' } },
      ),
    { accessTokens: tokenStore },
  );
  await onboarding.login('synthetic-patient', 'synthetic-password');
  await onboarding.verifyOtp('123456');
  const options = {
    locale: 'en-EG' as const,
    accessToken: () => tokenStore.read(),
    apiBaseUrl: 'http://synthetic.invalid',
    fetch: fetcher,
  };

  await new PatientFeature010EncounterApi(options).getEncounter(encounter);
  const chat = new PatientFeature010ChatApi(options);
  await chat.listMessages(appointment);
  await new PatientFeature010ReferralApi({
    ...options,
    actorRole: 'PAT',
    patientId: patient,
  }).listPendingReferrals();
  await expect(
    chat.sendMessage(appointment, { body: 'Synthetic message' }, 'pr394-context-message-001'),
  ).rejects.toThrow();
  expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
  expect(statuses.at(-1)).toBe(403);
  expect(send).not.toHaveBeenCalled();
  onboarding.installAccessToken(token, 2);
  await chat.listMessages(appointment);
  await chat.sendMessage(appointment, { body: 'Synthetic message' }, 'pr394-context-message-001');
  expect(statuses.at(-1)).toBe(201);
  expect(send.mock.calls[0]?.[0]).toMatchObject({
    actor: { aal: 2, purposes: ['appointment.scheduling'] },
  });
  tokenStore.write(`synthetic-person:${facility}`);
  await chat.listMessages(appointment);
  await expect(
    chat.sendMessage(appointment, { body: 'Synthetic message' }, 'pr394-context-message-001'),
  ).rejects.toThrow();
  expect(statuses.at(-1)).toBe(403);
});

it('clinic start transport sends the caller session assurance and approved purpose, never an AAL2 default', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://synthetic.invalid');
  const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    expect(headers.get('x-purpose')).toBe('appointment.scheduling');
    expect(headers.get('x-aal')).toBe('1');
    return new Response(JSON.stringify(projection), {
      headers: { 'cache-control': 'private, no-store' },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  try {
    await createEncounterStartClients(token, 'en-EG', 1).encounters.getEncounter(encounter);
  } finally {
    vi.unstubAllGlobals();
  }
  expect(fetcher).toHaveBeenCalledOnce();
});
