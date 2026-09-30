import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const encounterId = '95000000-0000-4000-8000-000000000001';
const otherEncounterId = '95000000-0000-4000-8000-000000000002';
const appointmentId = '93000000-0000-4000-8000-000000000001';
const otherAppointmentId = '93000000-0000-4000-8000-000000000002';
const patientId = '92000000-0000-4000-8000-000000000001';
const staffId = '96000000-0000-4000-8000-000000000001';
const messageId = '98000000-0000-4000-8000-000000000001';
const updatedAt = '2026-09-29T09:30:00+03:00';
const sourcePath = new URL('../src/components/feature-010/ContextMessages.tsx', import.meta.url);

const message = (context = appointmentId, body = 'Synthetic existing message.') => ({
  id: messageId,
  contextType: 'appointment',
  contextId: context,
  senderId: staffId,
  body,
  sentAt: updatedAt,
});
const messagePage = (data = [message()], nextCursor: string | null = null) => ({
  data,
  meta: { nextCursor, lastUpdatedAt: updatedAt, stale: false },
});
const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
const profile = (id = staffId) => ({
  id,
  display_name: 'Synthetic Staff Profile',
  birth_date: null,
  nationality_code: 'EG',
  preferred_locale: 'en-EG',
  verification_status: 'verified',
  version: 1,
  privateProfileMetadata: 'synthetic-profile-extra-must-not-be-retained',
});
const encounter = (
  overrides: Partial<{
    id: string;
    patientId: string;
    appointmentId: string;
    status: 'open' | 'completed';
    endedAt: string;
    participants: Array<{
      personId: string;
      roleCode: string;
      startedAt: string;
      endedAt?: string;
      privateMemo?: string;
    }>;
  }> = {},
) => ({
  id: encounterId,
  patientId,
  facilityId: '90000000-0000-4000-8000-000000000001',
  appointmentId,
  encounterType: 'consultation',
  responsibleClinicianId: staffId,
  status: 'open' as const,
  startedAt: '2026-09-29T09:00:00+03:00',
  version: 1,
  participants: [
    {
      personId: staffId,
      roleCode: 'responsible_clinician',
      startedAt: '2026-09-29T09:00:00+03:00',
      privateMemo: 'synthetic-participant-extra-must-not-be-retained',
    },
  ],
  clinicalMetadata: 'synthetic-encounter-extra-must-not-be-retained',
  ...overrides,
});

async function createController(
  fetcher: typeof globalThis.fetch,
  options: {
    accessToken?: () => string | undefined;
    aal?: 1 | 2;
    isOnline?: () => boolean;
    locale?: 'ar-EG' | 'en-EG';
  } = {},
) {
  if (!fs.existsSync(sourcePath))
    assert.fail(
      'Missing C25 clinic messages boundary: implement ClinicContextMessagesController before exposing /messages.',
    );
  const { ClinicContextMessagesController } = await import(
    '../src/components/feature-010/ContextMessages'
  );
  assert.equal(typeof ClinicContextMessagesController, 'function');
  return new ClinicContextMessagesController({
    locale: options.locale ?? 'en-EG',
    accessToken: options.accessToken ?? (() => 'synthetic-clinic-token'),
    aal: options.aal ?? 2,
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: fetcher,
    isOnline: options.isOnline,
  });
}

function setExplicitSelection(controller: Awaited<ReturnType<typeof createController>>) {
  controller.setDraftContext({ encounterId, appointmentId });
}

test('explicit context uses profile and encounter authority before generated message REST', async () => {
  let token = 'synthetic-first-token';
  const requests: Array<{
    url: URL;
    init?: RequestInit;
  }> = [];
  const controller = await createController(
    async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      if (url.pathname === '/v1/people/me') return response(profile());
      if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
      if (url.pathname === `/v1/contexts/appointment/${appointmentId}/messages`)
        return response(
          messagePage([
            {
              ...message(),
              privateNote: 'synthetic-private-message-metadata',
              patientName: 'synthetic-name-must-not-render',
            },
          ]),
        );
      return response({ code: 'unexpected-request' }, 404);
    },
    { accessToken: () => token },
  );

  setExplicitSelection(controller);
  assert.equal(controller.state.kind, 'selection');
  assert.deepEqual(controller.state.messages, []);
  assert.equal(requests.length, 0);
  await controller.confirmContext();

  assert.deepEqual(
    requests.map(({ url }) => url.pathname),
    [
      '/v1/people/me',
      `/v1/encounters/${encounterId}`,
      `/v1/contexts/appointment/${appointmentId}/messages`,
    ],
  );
  assert.equal(requests[1]?.url.searchParams.get('fields'), 'participants');
  const messageRequest = requests[2];
  assert.equal(messageRequest?.init?.method, 'GET');
  assert.equal(messageRequest?.init?.cache, 'no-store');
  assert.equal(
    new Headers(messageRequest?.init?.headers).get('Authorization'),
    'Bearer synthetic-first-token',
  );
  assert.equal(new Headers(messageRequest?.init?.headers).get('Accept-Language'), 'en-EG');
  assert.equal(new Headers(messageRequest?.init?.headers).get('X-AAL'), '2');
  assert.equal(
    new Headers(messageRequest?.init?.headers).get('X-Purpose'),
    'appointment.scheduling',
  );
  assert.equal(controller.state.kind, 'active');
  assert.deepEqual(controller.state.messages[0], message());
  assert.doesNotMatch(
    JSON.stringify(controller.state),
    /privateProfileMetadata|clinicalMetadata|privateMemo|synthetic-private-message-metadata|patientName|display_name/,
  );

  token = 'synthetic-rotated-token';
  const previousCount = requests.length;
  await controller.refresh();
  assert.equal(requests.length, previousCount + 3);
  assert.equal(
    new Headers(requests.at(-1)?.init?.headers).get('Authorization'),
    'Bearer synthetic-rotated-token',
  );
});

test('identity, encounter, participant, and appointment mismatch fail closed before message REST', async () => {
  const cases = [
    { name: 'patient self', profileId: patientId },
    { name: 'profile has an invalid subject id', profileId: 'not-a-uuid' },
    {
      name: 'encounter belongs to another appointment',
      encounter: { appointmentId: otherAppointmentId },
    },
    { name: 'encounter completed', encounter: { status: 'completed' as const } },
    {
      name: 'participant ended',
      encounter: {
        participants: [
          {
            personId: staffId,
            roleCode: 'responsible_clinician',
            startedAt: '2026-09-29T09:00:00+03:00',
            endedAt: '2026-09-29T09:15:00+03:00',
          },
        ],
      },
    },
    {
      name: 'unknown workforce role',
      encounter: {
        participants: [
          {
            personId: staffId,
            roleCode: 'unrecognized_role',
            startedAt: '2026-09-29T09:00:00+03:00',
          },
        ],
      },
    },
    {
      name: 'participant interval starts in the future',
      encounter: {
        participants: [
          {
            personId: staffId,
            roleCode: 'consultant',
            startedAt: '2026-10-01T09:00:00+03:00',
          },
        ],
      },
    },
    { name: 'encounter projection has a different id', encounter: { id: otherEncounterId } },
  ];
  for (const variant of cases) {
    const requests: string[] = [];
    const controller = await createController(async (input) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname === '/v1/people/me') return response(profile(variant.profileId));
      if (url.pathname === `/v1/encounters/${encounterId}`)
        return response(encounter(variant.encounter));
      if (url.pathname.endsWith('/messages')) return response(messagePage());
      return response({ code: 'unexpected-request' }, 404);
    });
    setExplicitSelection(controller);
    await assert.rejects(controller.confirmContext(), /context-request-failed/);
    assert.notEqual(controller.state.kind, 'active', variant.name);
    assert.deepEqual(controller.state.messages, [], variant.name);
    assert.equal(
      requests.some((request) => request.endsWith('/messages')),
      false,
      variant.name,
    );
    assert.doesNotMatch(
      JSON.stringify(controller.state),
      /display_name|patientId|roleCode|facilityId/,
    );
  }
});

test('body-only send waits for the canonical generated response and uses current purpose', async () => {
  const requests: Array<{ path: string; method: string; body?: unknown; headers: Headers }> = [];
  let release!: (result: Response) => void;
  let holdSend = false;
  const controller = await createController(async (input, init) => {
    const url = new URL(String(input));
    const request = {
      path: url.pathname,
      method: init?.method ?? 'GET',
      ...(init?.body === undefined ? {} : { body: JSON.parse(String(init.body)) }),
      headers: new Headers(init?.headers),
    };
    requests.push(request);
    if (request.path === `/v1/people/me`) return response(profile());
    if (request.path === `/v1/encounters/${encounterId}`) return response(encounter());
    if (request.method === 'POST' && holdSend)
      return new Promise<Response>((resolve) => (release = resolve));
    if (request.method === 'POST')
      return response(message(appointmentId, 'Canonical server response.'), 201);
    return response(messagePage());
  });
  setExplicitSelection(controller);
  await controller.confirmContext();
  holdSend = true;
  const pending = controller.sendMessage(
    { body: 'Synthetic submitted body.' },
    'synthetic-clinic-idempotency',
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(controller.state.messages, []);
  assert.equal(controller.state.sentMessage, null);
  const post = requests.at(-1);
  assert.equal(post?.method, 'POST');
  assert.deepEqual(post?.body, { body: 'Synthetic submitted body.' });
  assert.equal(post?.headers.get('Idempotency-Key'), 'synthetic-clinic-idempotency');
  assert.equal(post?.headers.get('X-Purpose'), 'appointment.scheduling');
  assert.equal(post?.headers.get('X-AAL'), '2');
  release(response(message(appointmentId, 'Canonical server response.'), 201));
  await pending;
  assert.equal(controller.state.kind, 'success');
  assert.deepEqual(
    controller.state.sentMessage,
    message(appointmentId, 'Canonical server response.'),
  );
  assert.equal(
    controller.state.messages.some((item) => item.body === 'Synthetic submitted body.'),
    false,
  );
});

test('hints are closed and deduplicated, and cursor pagination stays in the selected context', async () => {
  const requests: URL[] = [];
  const controller = await createController(async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === '/v1/people/me') return response(profile());
    if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
    return response(messagePage([message()], 'synthetic-next-cursor'));
  });
  setExplicitSelection(controller);
  await controller.confirmContext();
  const hint = {
    eventId: '98000000-0000-4000-8000-000000000002',
    contextId: appointmentId,
    version: 1,
  };
  assert.equal(controller.handleRefreshHint({ ...hint, contextId: otherAppointmentId }), false);
  assert.equal(controller.handleRefreshHint({ ...hint, body: 'Must not be consumed.' }), false);
  assert.equal(controller.handleRefreshHint(hint), true);
  assert.equal(controller.handleRefreshHint(hint), false);
  assert.deepEqual(controller.state.messages, []);
  await controller.refresh();
  await controller.loadOlder();
  const messageRequests = requests.filter((url) => url.pathname.endsWith('/messages'));
  assert.ok(messageRequests.length >= 3);
  assert.ok(
    messageRequests.every((url) => url.pathname.endsWith(`/appointment/${appointmentId}/messages`)),
  );
  assert.equal(messageRequests.at(-1)?.searchParams.get('cursor'), 'synthetic-next-cursor');
});

test('forged hints are inert and valid future or out-of-order hints require REST authority again', async () => {
  for (const revocation of ['revoked', 'completed'] as const) {
    let revoked = false;
    let messageReads = 0;
    let messageWrites = 0;
    const requests: string[] = [];
    const controller = await createController(async (input, init) => {
      const url = new URL(String(input));
      requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
      if (url.pathname === '/v1/people/me') return response(profile());
      if (url.pathname === `/v1/encounters/${encounterId}`) {
        if (revoked && revocation === 'revoked') return response({ code: 'not-found' }, 404);
        return response(encounter(revoked ? { status: 'completed' } : {}));
      }
      if (url.pathname.endsWith('/messages')) {
        if (init?.method === 'POST') {
          messageWrites += 1;
          return response({ code: 'forbidden' }, 403);
        }
        messageReads += 1;
        return revoked ? response({ code: 'forbidden' }, 403) : response(messagePage());
      }
      return response({ code: 'unexpected-request' }, 404);
    });
    setExplicitSelection(controller);
    await controller.confirmContext();
    const hint = {
      eventId:
        revocation === 'revoked'
          ? '98000000-0000-4000-8000-000000000021'
          : '98000000-0000-4000-8000-000000000022',
      contextId: appointmentId,
      version: 8,
    };
    assert.equal(controller.handleRefreshHint({ ...hint, contextId: otherAppointmentId }), false);
    assert.equal(controller.handleRefreshHint({ ...hint, eventType: 'wrong.event' }), false);
    assert.equal(
      controller.handleRefreshHint({ ...hint, body: 'synthetic-message-plaintext-canary' }),
      false,
    );
    assert.equal(
      controller.handleRefreshHint({ ...hint, bodyCiphertext: 'synthetic-ciphertext-canary' }),
      false,
    );
    assert.equal(controller.handleRefreshHint({ ...hint, version: 0 }), false);
    assert.equal(messageReads, 1, 'invalid hints must not reauthorize through REST');
    assert.deepEqual(controller.state.messages, [message()]);

    assert.equal(controller.handleRefreshHint(hint), true);
    assert.deepEqual(controller.state.messages, []);
    revoked = true;
    await assert.rejects(controller.refresh(), /context-request-failed/);
    assert.deepEqual(
      controller.state.messages,
      [],
      `${revocation} REST denial must clear protected history`,
    );
    await assert.rejects(
      controller.sendMessage({ body: 'must not be sent' }, 'synthetic-hint-denied-send'),
      /message-context-not-current/,
    );
    assert.equal(messageWrites, 0, 'denied state must keep the composer send path closed');

    const outOfOrder = { ...hint, eventId: `${hint.eventId.slice(0, -1)}3`, version: 2 };
    assert.equal(controller.handleRefreshHint(outOfOrder), true);
    await assert.rejects(controller.refresh(), /context-request-failed/);
    assert.deepEqual(controller.state.messages, []);
    assert.equal(messageWrites, 0);
    assert.equal(requests.filter((request) => request.includes('/messages')).length, 1);
  }
});

test('403, 409, and 503 reads clear protected history and expose safe states', async () => {
  for (const [status, state] of [
    [403, 'participant-removed'],
    [409, 'conflict'],
    [503, 'chat-unavailable'],
  ] as const) {
    let fail = false;
    const controller = await createController(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/people/me') return response(profile());
      if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
      return fail
        ? response(
            {
              status,
              title: 'Synthetic failure',
              detail: 'Synthetic body/ciphertext/clinical metadata must not escape.',
              body: 'private body canary',
              ciphertext: 'cipher canary',
              clinicalMetadata: { diagnosis: 'synthetic' },
            },
            status,
          )
        : response(messagePage());
    });
    setExplicitSelection(controller);
    await controller.confirmContext();
    assert.deepEqual(controller.state.messages, [message()]);
    fail = true;
    await assert.rejects(controller.refresh(), /context-request-failed/);
    assert.equal(controller.state.kind, state);
    assert.deepEqual(controller.state.messages, []);
    assert.doesNotMatch(
      JSON.stringify(controller.state),
      /private body canary|cipher canary|diagnosis/,
    );
  }
});

test('AAL 1 cannot send and never reaches the generated POST endpoint', async () => {
  let postCount = 0;
  let messageRequestCount = 0;
  const controller = await createController(
    async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/people/me') return response(profile());
      if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
      if (url.pathname.endsWith('/messages')) messageRequestCount += 1;
      if (init?.method === 'POST') {
        postCount += 1;
        return response(message(), 201);
      }
      return response(messagePage());
    },
    { aal: 1 },
  );
  setExplicitSelection(controller);
  await assert.rejects(controller.confirmContext());
  await assert.rejects(
    controller.sendMessage({ body: 'No low assurance send.' }, 'synthetic-aal1-key'),
    /message-context-not-current/,
  );
  assert.equal(postCount, 0);
  assert.equal(messageRequestCount, 0);
  assert.notEqual(controller.state.kind, 'active');
  assert.deepEqual(controller.state.messages, []);
});

test('blank and whitespace-only bodies never reach POST', async () => {
  const bodies = [
    { request: { body: '   ' }, key: 'synthetic-blank-key' },
    {
      request: {
        body: 'Synthetic message with forbidden attachment.',
        attachmentId: 'synthetic-file',
      },
      key: 'synthetic-attachment-key',
    },
  ];
  for (const { request, key } of bodies) {
    let postCount = 0;
    const controller = await createController(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/people/me') return response(profile());
      if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
      if (init?.method === 'POST') postCount += 1;
      return response(messagePage());
    });
    setExplicitSelection(controller);
    await controller.confirmContext();
    await assert.rejects(controller.sendMessage(request as never, key), /message-body-invalid/);
    assert.equal(postCount, 0);
    assert.deepEqual(controller.state.messages, [message()]);
  }
});

test('offline send is blocked and a late read cannot restore a newly selected context', async () => {
  let online = true;
  let resolveRead!: (result: Response) => void;
  let deferMessages = false;
  let messageRequests = 0;
  const controller = await createController(
    async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/people/me') return response(profile());
      if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
      if (url.pathname === `/v1/encounters/${otherEncounterId}`)
        return response(encounter({ id: otherEncounterId, appointmentId: otherAppointmentId }));
      if (!url.pathname.endsWith('/messages')) return response({ code: 'unexpected-request' }, 404);
      messageRequests += 1;
      return deferMessages
        ? new Promise<Response>((resolve) => (resolveRead = resolve))
        : response(messagePage());
    },
    { isOnline: () => online },
  );
  setExplicitSelection(controller);
  await controller.confirmContext();
  const messageRequestCount = messageRequests;
  online = false;
  controller.markOffline();
  await controller
    .sendMessage({ body: 'Must not queue.' }, 'synthetic-offline-key')
    .catch(() => undefined);
  assert.equal(messageRequests, messageRequestCount);
  assert.deepEqual(controller.state.messages, []);

  online = true;
  deferMessages = true;
  const pending = controller.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.setDraftContext({ encounterId: otherEncounterId, appointmentId: otherAppointmentId });
  resolveRead(response(messagePage([message(appointmentId, 'Late old context history.')])));
  await pending.catch(() => undefined);
  assert.deepEqual(controller.state.messages, []);
  assert.equal(JSON.stringify(controller.state).includes('Late old context history.'), false);
});

test('older failed refresh cannot replace newer successful history', async () => {
  let heldFailure!: (result: Response) => void;
  let holdFirstRefresh = false;
  let listCount = 0;
  const controller = await createController(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/people/me') return response(profile());
    if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
    listCount += 1;
    if (holdFirstRefresh && listCount === 2)
      return new Promise<Response>((resolve) => (heldFailure = resolve));
    return response(messagePage([message(appointmentId, `Fresh page ${listCount}.`)]));
  });
  setExplicitSelection(controller);
  await controller.confirmContext();
  holdFirstRefresh = true;
  const older = controller.refresh();
  while (!heldFailure) await new Promise((resolve) => setTimeout(resolve, 0));
  await controller.refresh();
  assert.equal(controller.state.messages[0]?.body, 'Fresh page 3.');
  heldFailure(response({ status: 403, detail: 'old request denial' }, 403));
  await assert.rejects(older, /Request aborted/);
  assert.equal(controller.state.kind, 'active');
  assert.equal(controller.state.messages[0]?.body, 'Fresh page 3.');
});

test('a late successful send cannot restore canonical content after going offline', async () => {
  let releasePost!: (result: Response) => void;
  let online = true;
  let posts = 0;
  const controller = await createController(
    async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/people/me') return response(profile());
      if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
      if (init?.method === 'POST') {
        posts += 1;
        return new Promise<Response>((resolve) => (releasePost = resolve));
      }
      return response(messagePage());
    },
    { isOnline: () => online },
  );
  setExplicitSelection(controller);
  await controller.confirmContext();
  const sending = controller.sendMessage(
    { body: 'Late success must not appear.' },
    'synthetic-late-key',
  );
  while (!releasePost) await new Promise((resolve) => setTimeout(resolve, 0));
  online = false;
  controller.markOffline();
  releasePost(response(message(appointmentId, 'Late success must not appear.'), 201));
  await assert.rejects(sending, /Request aborted/);
  assert.equal(posts, 1);
  assert.deepEqual(controller.state.messages, []);
  assert.equal(controller.state.sentMessage, null);
  assert.equal(JSON.stringify(controller.state).includes('Late success must not appear.'), false);
});

test('a late successful send cannot restore content after authoritative encounter completion', async () => {
  let releasePost!: (result: Response) => void;
  let completed = false;
  const controller = await createController(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/people/me') return response(profile());
    if (url.pathname === `/v1/encounters/${encounterId}`)
      return response(encounter(completed ? { status: 'completed', endedAt: updatedAt } : {}));
    if (init?.method === 'POST') return new Promise<Response>((resolve) => (releasePost = resolve));
    return response(messagePage());
  });
  setExplicitSelection(controller);
  await controller.confirmContext();
  const sending = controller.sendMessage(
    { body: 'Late completion success canary.' },
    'synthetic-complete-late-key',
  );
  while (!releasePost) await new Promise((resolve) => setTimeout(resolve, 0));
  completed = true;
  await assert.rejects(controller.refresh(), /context-request-failed/);
  assert.equal(controller.state.kind, 'access-ended');
  releasePost(response(message(appointmentId, 'Late completion success canary.'), 201));
  await assert.rejects(sending, /Request aborted/);
  assert.equal(controller.state.kind, 'access-ended');
  assert.deepEqual(controller.state.messages, []);
  assert.equal(controller.state.sentMessage, null);
  assert.equal(JSON.stringify(controller.state).includes('Late completion success canary.'), false);
});

test('an ignored-abort old success cannot restore history after a newer identity denial', async () => {
  let personId = staffId;
  let releaseOldRead!: (result: Response) => void;
  let listCount = 0;
  const controller = await createController(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/people/me') return response(profile(personId));
    if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
    listCount += 1;
    if (listCount === 2) return new Promise<Response>((resolve) => (releaseOldRead = resolve));
    return response(messagePage([message(appointmentId, 'Current authorized history.')]));
  });
  setExplicitSelection(controller);
  await controller.confirmContext();
  const oldRead = controller.refresh();
  while (!releaseOldRead) await new Promise((resolve) => setTimeout(resolve, 0));
  personId = patientId;
  await assert.rejects(controller.refresh(), /context-request-failed/);
  assert.equal(controller.state.kind, 'permission-denied');
  releaseOldRead(response(messagePage([message(appointmentId, 'Late unauthorized history.')])));
  await assert.rejects(oldRead, /Request aborted/);
  assert.equal(controller.state.kind, 'permission-denied');
  assert.deepEqual(controller.state.messages, []);
  assert.equal(JSON.stringify(controller.state).includes('Late unauthorized history.'), false);
});

test('token rotation during a deferred profile preflight prevents message reads', async () => {
  let token = 'synthetic-before-rotation';
  let holdProfile = false;
  let releaseProfile!: (result: Response) => void;
  let messageReads = 0;
  const controller = await createController(
    async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/people/me') {
        if (holdProfile) return new Promise<Response>((resolve) => (releaseProfile = resolve));
        return response(profile());
      }
      if (url.pathname === `/v1/encounters/${encounterId}`) return response(encounter());
      if (url.pathname.endsWith('/messages')) messageReads += 1;
      return response(messagePage());
    },
    { accessToken: () => token },
  );
  setExplicitSelection(controller);
  await controller.confirmContext();
  holdProfile = true;
  const pending = controller.refresh();
  while (!releaseProfile) await new Promise((resolve) => setTimeout(resolve, 0));
  const previousMessageReadCount = messageReads;
  token = 'synthetic-after-rotation';
  releaseProfile(response(profile()));
  await assert.rejects(pending, (error: Error) => error.name === 'AbortError');
  assert.equal(messageReads, previousMessageReadCount);
  assert.equal(controller.state.kind, 'permission-denied');
  assert.deepEqual(controller.state.messages, []);
});
