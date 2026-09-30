import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const encounterId = 'a1000000-0000-4000-8000-000000000010';
const otherEncounterId = 'a1000000-0000-4000-8000-000000000020';
const patientId = 'a1000000-0000-4000-8000-000000000011';
const chatAdapterPath = new URL('../src/feature-010-chat.ts', import.meta.url);
const ok = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
const message = {
  id: 'a1000000-0000-4000-8a00-000000000001',
  contextType: 'appointment',
  contextId: encounterId,
  senderId: 'a1000000-0000-4000-8000-000000000011',
  body: 'Synthetic patient message.',
  sentAt: '2030-01-07T09:30:00Z',
};
const pageMeta = {
  nextCursor: null,
  lastUpdatedAt: '2030-01-07T09:30:00Z',
  stale: false,
};

async function createApi(
  fetcher: typeof globalThis.fetch,
  options: { isOnline?: () => boolean; accessToken?: () => string | undefined } = {},
) {
  if (!fs.existsSync(chatAdapterPath)) {
    assert.fail(
      'Missing C24 patient chat adapter: implement PatientFeature010ChatApi before enabling the encounter composer.',
    );
  }
  const { PatientFeature010ChatApi } = await import('../src/feature-010-chat.ts');
  return new PatientFeature010ChatApi({
    locale: 'en-EG',
    accessToken: options.accessToken ?? (() => 'synthetic-patient-token'),
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: fetcher,
    isOnline: options.isOnline,
  });
}

test('patient chat REST list uses appointment context, live bearer, locale, and no-store', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const api = await createApi(async (input, options) => {
    url = String(input);
    init = options;
    return ok({ data: [message], meta: pageMeta });
  });
  const page = await api.listMessages(encounterId);
  assert.deepEqual(page.data, [message]);
  assert.equal(url, `https://synthetic.invalid/v1/contexts/appointment/${encounterId}/messages`);
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-patient-token');
  assert.equal(new Headers(init?.headers).get('Accept-Language'), 'en-EG');
  assert.equal(init?.cache, 'no-store');
  assert.equal(init?.method, 'GET');
});

test('patient chat pagination remains a generated REST read', async () => {
  let url = '';
  const api = await createApi(async (input) => {
    url = String(input);
    return ok({ data: [message], meta: { ...pageMeta, nextCursor: 'opaque-next-cursor' } });
  });
  const page = await api.listMessages(encounterId, { limit: 1 });
  assert.equal(new URL(url).searchParams.get('limit'), '1');
  assert.equal(page.meta.nextCursor, 'opaque-next-cursor');
  await api.listMessages(encounterId, { cursor: page.meta.nextCursor ?? undefined, limit: 1 });
  assert.equal(new URL(url).searchParams.get('cursor'), 'opaque-next-cursor');
});

test('REST message pages use closed projections and reject wrong context', async () => {
  let wrongContext = false;
  const api = await createApi(async () =>
    ok({
      data: [
        {
          ...message,
          privateMemo: 'synthetic-private-message-metadata',
          ...(wrongContext ? { contextId: otherEncounterId } : {}),
        },
      ],
      meta: pageMeta,
    }),
  );
  const page = await api.listMessages(encounterId);
  assert.deepEqual(page.data[0], message);
  assert.doesNotMatch(JSON.stringify(page), /synthetic-private-message-metadata|privateMemo/);
  assert.deepEqual(Object.keys(page).sort(), ['data', 'meta']);
  assert.deepEqual(Object.keys(page.data[0] ?? {}).sort(), [
    'body',
    'contextId',
    'contextType',
    'id',
    'senderId',
    'sentAt',
  ]);
  assert.deepEqual(Object.keys(page.meta).sort(), ['lastUpdatedAt', 'nextCursor', 'stale']);
  assert.equal(api.messages.length, 1);
  wrongContext = true;
  await assert.rejects(api.listMessages(encounterId), /context/i);
  assert.deepEqual(api.messages, []);
});

test('patient chat send forwards only generated body and idempotency through REST', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const api = await createApi(async (input, options) => {
    url = String(input);
    init = options;
    return ok(message, 201);
  });
  const sent = await api.sendMessage(encounterId, { body: message.body }, 'synthetic-chat-key');
  assert.deepEqual(sent, message);
  assert.equal(url, `https://synthetic.invalid/v1/contexts/appointment/${encounterId}/messages`);
  assert.equal(init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(init?.body)), { body: message.body });
  assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'synthetic-chat-key');
  assert.equal(init?.cache, 'no-store');
});

test('invalid body and attachment fields are rejected before any REST call', async () => {
  let requests = 0;
  const api = await createApi(async () => {
    requests += 1;
    return ok(message, 201);
  });
  await assert.rejects(api.sendMessage(encounterId, { body: '   ' }, 'synthetic-blank-key'));
  await assert.rejects(
    api.sendMessage(
      encounterId,
      { body: 'Synthetic attachment probe.', attachment: 'synthetic-file-ref' },
      'synthetic-attachment-key',
    ),
  );
  assert.equal(requests, 0);
});

test('offline reads and sends fail without queueing or optimistic success', async () => {
  let requests = 0;
  const api = await createApi(
    async () => {
      requests += 1;
      return ok(message, 201);
    },
    { isOnline: () => false },
  );
  await assert.rejects(api.listMessages(encounterId), /offline/i);
  await assert.rejects(
    api.sendMessage(encounterId, { body: message.body }, 'synthetic-offline-key'),
  );
  assert.equal(requests, 0);
  assert.equal('pendingMessages' in api, false);
  assert.equal('queue' in api, false);
});

test('forbidden, stale, and conflicted reads and sends propagate instead of replaying content', async () => {
  for (const [status, code] of [
    [403, 'forbidden'],
    [409, 'version-conflict'],
    [503, 'temporarily-unavailable'],
  ] as const) {
    const api = await createApi(async () => ok({ code }, status));
    await assert.rejects(api.listMessages(encounterId), new RegExp(String(status)));
    await assert.rejects(
      api.sendMessage(encounterId, { body: message.body }, `synthetic-${status}-key`),
      new RegExp(String(status)),
    );
  }
});

test('sensitive 403 and 503 error payloads never escape the safe error boundary', async () => {
  const bodyCanary = 'synthetic-private-message-error-body';
  const cipherCanary = 'synthetic-ciphertext-error-canary';
  let failureStatus = 0;
  const api = await createApi(async () =>
    failureStatus
      ? ok(
          {
            code: 'forbidden',
            body: bodyCanary,
            ciphertext: cipherCanary,
            clinicalMetadata: { patientId },
          },
          failureStatus,
        )
      : ok({ data: [message], meta: pageMeta }),
  );
  await api.listMessages(encounterId);
  for (const status of [403, 503]) {
    failureStatus = status;
    let captured: unknown;
    try {
      await api.listMessages(encounterId);
    } catch (error) {
      captured = error;
    }
    assert.ok(captured instanceof Error);
    assert.equal(captured.message, `chat-request-failed-${status}`);
    assert.equal(api.readState, status === 403 ? 'denied' : 'stale');
    assert.equal('cause' in captured, false);
    assert.doesNotMatch(String(captured), /body|ciphertext|clinicalMetadata|patientId/);
    assert.doesNotMatch(
      JSON.stringify(captured),
      /synthetic-private-message-error-body|synthetic-ciphertext-error-canary|patientId/,
    );
    assert.deepEqual(api.messages, []);
  }
});

test('refresh hints only invalidate matching context and deduplicate event IDs', async () => {
  const api = await createApi(async () => ok({ data: [], meta: pageMeta }));
  await api.listMessages(encounterId);
  const hint = {
    eventId: 'a1000000-0000-4000-8a00-000000000002',
    contextId: encounterId,
    version: 1,
  };
  assert.equal(api.handleRefreshHint({ ...hint, contextId: otherEncounterId }), false);
  assert.equal(api.handleRefreshHint(hint), true);
  assert.equal(api.handleRefreshHint(hint), false);
  assert.equal(
    api.handleRefreshHint({ ...hint, eventId: 'malformed-event-id', body: message.body }),
    false,
  );
});

test('aborted or superseded reads cannot return as current history', async () => {
  let resolveRead!: (response: Response) => void;
  const api = await createApi(
    async () => new Promise<Response>((resolve) => (resolveRead = resolve)),
  );
  const controller = new AbortController();
  const pending = api.listMessages(encounterId, {}, controller.signal);
  controller.abort();
  resolveRead(ok({ data: [message], meta: pageMeta }));
  await assert.rejects(pending, (error: unknown) =>
    error instanceof DOMException ? error.name === 'AbortError' : /abort/i.test(String(error)),
  );
});

test('a late list response cannot restore history after offline invalidation', async () => {
  let resolveRead!: (response: Response) => void;
  const api = await createApi(
    async () => new Promise<Response>((resolve) => (resolveRead = resolve)),
  );
  const pending = api.listMessages(encounterId);
  api.markOffline();
  resolveRead(ok({ data: [message], meta: pageMeta }));
  await assert.rejects(pending, /abort|offline/i);
  assert.deepEqual(api.messages, []);
  assert.equal(api.readState, 'offline');
});

test('a late send response cannot become visible after offline invalidation', async () => {
  let resolveSend!: (response: Response) => void;
  const api = await createApi(
    async () => new Promise<Response>((resolve) => (resolveSend = resolve)),
  );
  const pending = api.sendMessage(encounterId, { body: message.body }, 'synthetic-late-send-key');
  api.markOffline();
  resolveSend(ok(message, 201));
  await assert.rejects(pending, /abort|offline/i);
  assert.deepEqual(api.messages, []);
  assert.equal(api.readState, 'offline');
});

test('a late send response cannot restore history or success after a newer denial', async () => {
  let resolveSend!: (response: Response) => void;
  let requests = 0;
  const api = await createApi(async () => {
    requests += 1;
    if (requests === 1) return new Promise<Response>((resolve) => (resolveSend = resolve));
    return ok({ code: 'forbidden' }, 403);
  });
  const pendingSend = api.sendMessage(
    encounterId,
    { body: message.body },
    'synthetic-late-denied-send',
  );
  await assert.rejects(api.listMessages(encounterId), /403/);
  resolveSend(ok(message, 201));
  await assert.rejects(pendingSend, /abort/i);
  assert.deepEqual(api.messages, []);
  assert.equal(api.readState, 'denied');
});

test('a late success cannot replace a newer REST denial', async () => {
  let resolveOldRead!: (response: Response) => void;
  let requests = 0;
  const api = await createApi(async () => {
    requests += 1;
    if (requests === 1) return new Promise<Response>((resolve) => (resolveOldRead = resolve));
    return ok({ code: 'forbidden' }, 403);
  });
  const oldRead = api.listMessages(encounterId);
  await assert.rejects(api.listMessages(encounterId), /403/);
  resolveOldRead(ok({ data: [message], meta: pageMeta }));
  await assert.rejects(oldRead, /abort/i);
  assert.deepEqual(api.messages, []);
  assert.equal(api.readState, 'denied');
});

test('a response started with an old or missing token cannot publish after token rotation', async () => {
  for (const replacement of ['synthetic-token-after-rotation', undefined]) {
    let token: string | undefined = 'synthetic-token-before-rotation';
    let resolveRead!: (response: Response) => void;
    const api = await createApi(
      async () => new Promise<Response>((resolve) => (resolveRead = resolve)),
      { accessToken: () => token },
    );
    const pending = api.listMessages(encounterId);
    token = replacement;
    resolveRead(ok({ data: [message], meta: pageMeta }));
    await assert.rejects(pending, /authorization-changed|authorization-unavailable/i);
    assert.deepEqual(api.messages, []);
    assert.equal(api.readState, 'denied');
  }
});

test('route context switch and refresh hint invalidate late history responses', async () => {
  let resolveOldRead!: (response: Response) => void;
  let requests = 0;
  const otherMessage = { ...message, contextId: otherEncounterId };
  const api = await createApi(async () => {
    requests += 1;
    return requests === 1
      ? new Promise<Response>((resolve) => (resolveOldRead = resolve))
      : ok({ data: [otherMessage], meta: pageMeta });
  });
  const oldRead = api.listMessages(encounterId);
  assert.equal(
    api.handleRefreshHint({
      eventId: 'a1000000-0000-4000-8a00-000000000009',
      contextId: encounterId,
      version: 1,
    }),
    true,
  );
  const switched = await api.listMessages(otherEncounterId);
  resolveOldRead(ok({ data: [message], meta: pageMeta }));
  await assert.rejects(oldRead, /abort/i);
  assert.deepEqual(switched.data, [otherMessage]);
  assert.deepEqual(api.messages, [otherMessage]);
});

test('malformed message metadata clears earlier history before exposing a response', async () => {
  let malformed = false;
  const api = await createApi(async () =>
    ok(
      malformed
        ? { data: [message], meta: { ...pageMeta, stale: 'invalid' } }
        : { data: [message], meta: pageMeta },
    ),
  );
  await api.listMessages(encounterId);
  assert.equal(api.messages.length, 1);
  malformed = true;
  await assert.rejects(api.listMessages(encounterId), /projection|meta/i);
  assert.deepEqual(api.messages, []);
});
