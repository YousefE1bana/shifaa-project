import { expect, test, type Page } from 'playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const encounterId = 'a1000000-0000-4000-8000-000000000010';
const appointmentId = 'a1000000-0000-4000-8000-000000000013';
const patientId = 'a1000000-0000-4000-8000-000000000011';
const messageIds = [
  'a1000000-0000-4000-8a00-000000000001',
  'a1000000-0000-4000-8a00-000000000002',
  'a1000000-0000-4000-8a00-000000000003',
  'a1000000-0000-4000-8a00-000000000004',
];
const viewports = [
  { width: 360, height: 800 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
];
const screenshotDir = path.join(os.tmpdir(), 'shifaa-f010-chat-captures');
const syntheticMessages = () => [
  {
    id: messageIds[0],
    contextType: 'appointment',
    contextId: appointmentId,
    senderId: 'a1000000-0000-4000-8000-000000000014',
    body: 'Synthetic clinician message.',
    sentAt: '2030-01-07T09:15:00Z',
  },
];

async function openEncounter(page: Page, actorRole: 'PAT' | 'GUA' | 'DEL' = 'PAT') {
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/session/refresh'),
  );
  await page.goto(
    `/encounters/${encounterId}${actorRole === 'PAT' ? '' : `?actingRole=${actorRole}`}`,
  );
  const refreshResponse = await refreshed;
  expect(refreshResponse.status()).toBe(200);
  await page.waitForTimeout(50);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const denied = page.getByText(/current access is unavailable|عدم توفر صلاحية حالية/);
  if (await denied.isVisible().catch(() => false))
    await page.getByRole('button', { name: /try again|إعادة المحاولة/ }).click();
}

async function emitRefreshHint(page: Page, suffix: string, contextId = appointmentId) {
  await page.evaluate(
    ({ eventId, selectedContextId }) => {
      window.dispatchEvent(
        new CustomEvent('shifaa:feature-010-refresh-hint', {
          detail: { eventId, contextId: selectedContextId, version: 1 },
        }),
      );
    },
    {
      eventId: `a1000000-0000-4000-8a00-${suffix.padStart(12, '0')}`,
      selectedContextId: contextId,
    },
  );
}

async function renderedMessageBodyCount(page: Page, body: string) {
  return page
    .getByText(body, { exact: true })
    .evaluateAll((elements) => elements.filter((element) => element.tagName !== 'TEXTAREA').length);
}

async function wireSyntheticApi(
  page: Page,
  options: {
    locale: 'ar-EG' | 'en-EG';
    completed?: boolean;
    messageStatus?: number;
    actor?: 'PAT' | 'GUA' | 'DEL';
  },
) {
  let encounterStatus = 200;
  let messageStatus =
    options.messageStatus ?? (options.actor && options.actor !== 'PAT' ? 403 : 200);
  let completed = options.completed ?? false;
  let nextCursor: string | null = 'synthetic-next-cursor';
  let updatedAt = '2030-01-07T09:30:00Z';
  let stale = false;
  let messages = syntheticMessages();
  const messageGets: string[] = [];
  const messagePosts: Array<{ body: unknown; idempotencyKey: string | null }> = [];
  let sendCompletions = 0;
  let holdNextSend = false;
  let releaseHeldSend: (() => void) | null = null;
  let holdNextEncounter = false;
  let releaseHeldEncounter: (() => void) | null = null;
  let resolveRefresh!: () => void;
  const refreshDone = new Promise<void>((resolve) => {
    resolveRefresh = resolve;
  });

  await page.context().addCookies([
    {
      name: 'shifaa_csrf',
      value: 'synthetic-csrf',
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
      secure: false,
    },
  ]);
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const privateHeaders = { 'cache-control': 'private, no-store' };
    if (path === '/v1/auth/session/refresh') {
      await route.fulfill({
        status: 200,
        json: {
          accessToken: `synthetic-local-${options.actor ?? 'PAT'}-token`,
          sessionId: 'a1000000-0000-4000-8000-000000000099',
          assurance: 'aal1',
          expiresAt: '2030-01-07T10:00:00Z',
        },
        headers: privateHeaders,
      });
      resolveRefresh();
      return;
    }
    if (path === `/v1/encounters/${encounterId}`) {
      await refreshDone;
      await page.waitForTimeout(50);
      if (holdNextEncounter) {
        holdNextEncounter = false;
        await new Promise<void>((resolve) => {
          releaseHeldEncounter = resolve;
        });
      }
      await route.fulfill({
        status: encounterStatus,
        json:
          encounterStatus === 200
            ? {
                id: encounterId,
                patientId,
                facilityId: 'a1000000-0000-4000-8000-000000000012',
                appointmentId,
                encounterType: 'general',
                responsibleClinicianId: 'a1000000-0000-4000-8000-000000000014',
                status: completed ? 'completed' : 'open',
                startedAt: '2030-01-07T09:00:00Z',
                ...(completed ? { endedAt: '2030-01-07T10:00:00Z' } : {}),
                version: completed ? 2 : 1,
                notes: [],
              }
            : { code: encounterStatus === 403 ? 'forbidden' : 'temporarily-unavailable' },
        headers: privateHeaders,
      });
      return;
    }
    if (path === `/v1/contexts/appointment/${appointmentId}/messages`) {
      if (request.method() === 'GET') {
        const query = new URL(request.url()).searchParams;
        messageGets.push(new URL(request.url()).search);
        const olderMessage = {
          id: messageIds[1],
          contextType: 'appointment',
          contextId: appointmentId,
          senderId: 'a1000000-0000-4000-8000-000000000014',
          body: 'Older synthetic clinician message.',
          sentAt: '2030-01-07T09:10:00Z',
        };
        await route.fulfill({
          status: messageStatus,
          json:
            messageStatus === 200
              ? {
                  data: query.has('cursor') ? [olderMessage] : messages,
                  meta: {
                    nextCursor: query.has('cursor') ? null : nextCursor,
                    lastUpdatedAt: updatedAt,
                    stale,
                  },
                }
              : { code: messageStatus === 403 ? 'forbidden' : 'temporarily-unavailable' },
          headers: privateHeaders,
        });
        return;
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as { body?: unknown };
        messagePosts.push({
          body,
          idempotencyKey: request.headers()['idempotency-key'] ?? null,
        });
        if (messageStatus !== 200) {
          await route.fulfill({
            status: messageStatus,
            json: { code: messageStatus === 403 ? 'forbidden' : 'temporarily-unavailable' },
            headers: privateHeaders,
          });
          return;
        }
        if (holdNextSend) {
          holdNextSend = false;
          await new Promise<void>((resolve) => {
            releaseHeldSend = resolve;
          });
        }
        const accepted = {
          id: messageIds[messagePosts.length],
          contextType: 'appointment',
          contextId: appointmentId,
          senderId: patientId,
          body: String(body.body ?? ''),
          sentAt: '2030-01-07T09:31:00Z',
        };
        messages = [...messages, accepted];
        try {
          await route.fulfill({ status: 201, json: accepted, headers: privateHeaders });
        } finally {
          sendCompletions += 1;
        }
        return;
      }
    }
    await route.fulfill({ status: 200, json: {}, headers: privateHeaders });
  });

  await page.addInitScript(
    (locale) => localStorage.setItem('shifaa.patient.locale', locale),
    options.locale,
  );
  return {
    messageGets,
    messagePosts,
    sendCompletions: () => sendCompletions,
    setCompleted: () => {
      completed = true;
      messages = [];
      messageStatus = 403;
    },
    setMessageStatus: (status: number) => {
      messageStatus = status;
    },
    setMessages: (value: typeof messages) => {
      messages = value;
    },
    setEncounterStatus: (status: number) => {
      encounterStatus = status;
    },
    markStale: () => {
      updatedAt = '2030-01-07T09:35:00Z';
      nextCursor = null;
      stale = true;
    },
    markFresh: () => {
      updatedAt = '2030-01-07T09:40:00Z';
      nextCursor = 'synthetic-next-cursor';
      stale = false;
    },
    holdSend: () => {
      holdNextSend = true;
    },
    holdEncounter: () => {
      holdNextEncounter = true;
    },
    releaseEncounter: () => {
      releaseHeldEncounter?.();
      releaseHeldEncounter = null;
    },
    releaseSend: () => {
      releaseHeldSend?.();
      releaseHeldSend = null;
    },
    appendMessage: (body: string) => {
      messages = [
        ...messages,
        {
          id: messageIds[3],
          contextType: 'appointment',
          contextId: appointmentId,
          senderId: 'a1000000-0000-4000-8000-000000000014',
          body,
          sentAt: '2030-01-07T09:40:00Z',
        },
      ];
      updatedAt = '2030-01-07T09:40:00Z';
    },
  };
}

for (const locale of ['ar-EG', 'en-EG'] as const) {
  const words =
    locale === 'ar-EG'
      ? {
          title: 'تفاصيل الزيارة',
          open: 'الزيارة جارية',
          chatHeading: 'رسائل هذا الموعد',
          textbox: /اكتب رسالتك/,
          send: /إرسال الرسالة/,
          success: 'تم إرسال الرسالة',
          content: 'رسالة تجريبية من المريضة.',
          ended: 'انتهت رسائل هذا الموعد',
          empty: 'لا توجد رسائل بعد.',
          offline: 'لا يوجد اتصال. أعد الاتصال لتحميل السجل من جديد.',
          denied: 'تعذّر عرض الرسائل بسبب عدم توفر صلاحية حالية.',
          stale: 'قد تكون الرسائل قديمة. أعد التحقق من السجل قبل المتابعة.',
          reconnecting: 'جارٍ إعادة التحقق من صلاحية الرسائل…',
          refresh: 'إعادة التحقق',
          more: 'تحميل رسائل أقدم',
          updated: /آخر تحديث/,
          clinician: 'Synthetic clinician message.',
        }
      : {
          title: 'Encounter details',
          open: 'Encounter in progress',
          chatHeading: 'Appointment messages',
          textbox: /Write a message/i,
          send: /send message/i,
          success: 'Message sent',
          content: 'Synthetic patient message.',
          ended: 'Appointment messages ended',
          empty: 'There are no messages yet.',
          offline: 'You are offline. Reconnect to load the record again.',
          denied: 'Messages cannot be shown because current access is unavailable.',
          stale: 'Messages may be out of date. Recheck the record before continuing.',
          reconnecting: 'Rechecking message access…',
          refresh: 'Recheck access',
          more: 'Load older messages',
          updated: /Last updated/,
          clinician: 'Synthetic clinician message.',
        };

  for (const viewport of viewports) {
    test(`${locale} patient chat supports body send at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const api = await wireSyntheticApi(page, { locale });
      await openEncounter(page);
      await expect(page.getByRole('heading', { name: words.title })).toBeVisible();
      await expect(page.getByText(words.open)).toBeVisible();
      await expect(page.getByRole('heading', { name: words.chatHeading })).toBeVisible();
      await expect(page.getByText(words.clinician)).toBeVisible();
      const textbox = page.getByRole('textbox', { name: words.textbox });
      const send = page.getByRole('button', { name: words.send });
      await expect(textbox).toBeVisible();
      await expect(send).toBeVisible();
      await expect(page.getByRole('button', { name: /attach|مرفق|إرفاق/i })).toHaveCount(0);
      expect(await page.locator('html').getAttribute('dir')).toBe(
        locale === 'ar-EG' ? 'rtl' : 'ltr',
      );
      await expect.poll(() => api.messageGets.length).toBeGreaterThan(0);

      const missedHintMessage = {
        id: 'a1000000-0000-4000-8a00-000000000005',
        contextType: 'appointment',
        contextId: appointmentId,
        senderId: 'a1000000-0000-4000-8000-000000000014',
        body: 'Synthetic missed-hint clinician message.',
        sentAt: '2030-01-07T09:20:00Z',
      };
      const readsBeforeMissedHint = api.messageGets.length;
      api.setMessages([...syntheticMessages(), missedHintMessage]);
      await page.waitForTimeout(100);
      expect(await renderedMessageBodyCount(page, missedHintMessage.body)).toBe(0);
      expect(api.messageGets.length).toBe(readsBeforeMissedHint);
      await page.getByRole('button', { name: words.refresh }).click();
      await expect.poll(() => api.messageGets.length).toBeGreaterThan(readsBeforeMissedHint);
      await expect(page.getByText(missedHintMessage.body)).toBeVisible();
      api.setMessages(syntheticMessages());
      const readsBeforeRestore = api.messageGets.length;
      await page.getByRole('button', { name: words.refresh }).click();
      await expect.poll(() => api.messageGets.length).toBeGreaterThan(readsBeforeRestore);
      await expect(page.getByText(missedHintMessage.body)).toHaveCount(0);

      const initialReads = api.messageGets.length;
      await page.getByRole('button', { name: words.more }).click();
      await expect(page.getByText('Older synthetic clinician message.')).toBeVisible();
      expect(api.messageGets.some((query) => query.includes('cursor=synthetic-next-cursor'))).toBe(
        true,
      );
      const afterPagination = api.messageGets.length;
      await emitRefreshHint(page, '2');
      await expect.poll(() => api.messageGets.length).toBeGreaterThan(afterPagination);
      const afterFirstHint = api.messageGets.length;
      await emitRefreshHint(page, '1');
      await expect.poll(() => api.messageGets.length).toBeGreaterThan(afterFirstHint);
      const afterSecondHint = api.messageGets.length;
      await emitRefreshHint(page, '2');
      await page.waitForTimeout(100);
      expect(api.messageGets.length).toBe(afterSecondHint);
      expect(api.messageGets.length).toBeGreaterThan(initialReads);
      const afterHints = api.messageGets.length;
      await emitRefreshHint(page, '3', 'a1000000-0000-4000-8000-000000000077');
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: 'a1000000-0000-4000-8a00-000000000004',
              contextId: 'a1000000-0000-4000-8000-000000000013',
              version: 1,
              body: 'synthetic hint content must be ignored',
            },
          }),
        ),
      );
      await page.waitForTimeout(100);
      expect(api.messageGets.length).toBe(afterHints);

      api.setMessages([]);
      await emitRefreshHint(page, '5');
      await expect(page.getByText(words.empty)).toBeVisible();
      expect(await page.locator('body').innerText()).not.toContain(
        'synthetic hint content must be ignored',
      );
      api.setMessages(syntheticMessages());
      await emitRefreshHint(page, '6');
      await expect(page.getByText(words.clinician)).toBeVisible();

      api.markStale();
      await emitRefreshHint(page, '8');
      await expect(page.getByText(words.stale)).toBeVisible();
      await expect(page.getByText(words.updated)).toBeVisible();
      await expect(page.getByRole('heading', { name: words.success })).toHaveCount(0);
      api.markFresh();
      await emitRefreshHint(page, '9');
      await expect(page.getByText(words.clinician)).toBeVisible();

      await textbox.focus();
      await textbox.fill(words.content);
      api.holdSend();
      await page.keyboard.press('Tab');
      await expect(send).toBeFocused();
      const pendingResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/v1/contexts/appointment/${appointmentId}/messages`) &&
          response.request().method() === 'POST',
      );
      await page.keyboard.press('Enter');
      await expect.poll(() => api.messagePosts.length).toBe(1);
      expect(await renderedMessageBodyCount(page, words.content)).toBe(0);
      await expect(textbox).toHaveValue(words.content);
      expect(await page.getByRole('heading', { name: words.success }).count()).toBe(0);
      api.releaseSend();
      const accepted = await pendingResponse;
      expect(accepted.status()).toBe(201);
      await expect.poll(() => renderedMessageBodyCount(page, words.content)).toBe(1);
      const sentBodyBox = await page.getByText(words.content, { exact: true }).boundingBox();
      expect(sentBodyBox).not.toBeNull();
      expect(sentBodyBox!.y + sentBodyBox!.height).toBeLessThanOrEqual(viewport.height);
      const success = page.getByRole('heading', { name: words.success });
      await expect(success).toBeVisible();
      const canonicalMessageId = messageIds[api.messagePosts.length];
      expect(canonicalMessageId).toBeTruthy();
      await expect(page.getByText(canonicalMessageId!, { exact: true })).toBeVisible();
      expect(
        await page
          .getByText(canonicalMessageId!, { exact: true })
          .evaluate((element) => getComputedStyle(element).direction),
      ).toBe('ltr');
      expect(api.messagePosts).toHaveLength(1);
      expect(api.messagePosts[0]?.body).toEqual({ body: words.content });
      expect(api.messagePosts[0]?.idempotencyKey).toBeTruthy();
      expect(await page.locator('body').evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      const composerBox = await send.boundingBox();
      expect(composerBox).not.toBeNull();
      expect(composerBox!.height).toBeGreaterThanOrEqual(48);
      expect(composerBox!.x).toBeGreaterThanOrEqual(0);
      expect(composerBox!.x + composerBox!.width).toBeLessThanOrEqual(viewport.width);
      const successBox = await success.boundingBox();
      expect(successBox).not.toBeNull();
      expect(successBox!.y + successBox!.height).toBeLessThanOrEqual(viewport.height);
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: path.join(
          screenshotDir,
          `patient-chat-${locale}-success-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: false,
      });

      api.markStale();
      const readsAfterSend = api.messageGets.length;
      await emitRefreshHint(page, '10');
      await expect.poll(() => api.messageGets.length).toBeGreaterThan(readsAfterSend);
      await expect(page.getByText(words.stale)).toBeVisible();
      await expect(page.getByText(words.updated)).toBeVisible();
      await expect(page.getByRole('heading', { name: words.success })).toHaveCount(0);
      expect(await renderedMessageBodyCount(page, words.content)).toBe(0);
      api.markFresh();
      const readsAfterStale = api.messageGets.length;
      await emitRefreshHint(page, '12');
      await expect.poll(() => api.messageGets.length).toBeGreaterThan(readsAfterStale);
      await expect(page.getByText(words.stale)).toHaveCount(0);
      await expect.poll(() => renderedMessageBodyCount(page, words.content)).toBe(1);
      await expect(page.getByRole('heading', { name: words.success })).toHaveCount(0);

      // Exercise 200% text and narrow reflow on the loaded patient route.
      const scaledText = await page.getByRole('main').evaluate((main, bodyText) => {
        const descendants = Array.from(
          main.querySelectorAll<HTMLElement>('div,span,p,h1,h2,h3,textarea,button,label'),
        );
        const textLeaves = descendants.filter(
          (element) =>
            element.children.length === 0 &&
            (element.tagName === 'TEXTAREA' || Boolean(element.textContent?.trim())),
        );
        const baselines = textLeaves.map((element) => ({
          element,
          size: Number.parseFloat(getComputedStyle(element).fontSize),
        }));
        const chatBody = textLeaves.find((element) => element.textContent?.trim() === bodyText);
        const bodySizeBefore = chatBody
          ? Number.parseFloat(getComputedStyle(chatBody).fontSize)
          : Number.NaN;
        for (const { element, size } of baselines) {
          if (Number.isFinite(size)) element.style.fontSize = `${size * 2}px`;
        }
        const bodySizeAfter = chatBody
          ? Number.parseFloat(getComputedStyle(chatBody).fontSize)
          : Number.NaN;
        return { scaledCount: baselines.length, bodySizeBefore, bodySizeAfter };
      }, words.clinician);
      expect(scaledText.scaledCount).toBeGreaterThan(0);
      expect(scaledText.bodySizeBefore).toBeGreaterThan(0);
      expect(scaledText.bodySizeAfter).toBeGreaterThanOrEqual(scaledText.bodySizeBefore * 1.99);
      expect(await page.locator('body').evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      await page.setViewportSize({ width: 320, height: 800 });
      expect(await page.locator('body').evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
        320,
      );

      // Offline writes stay local-only; reconnect performs REST reads without replay.
      const draft = `${words.content} offline`;
      await textbox.fill(draft);
      const sendsBeforeOffline = api.messagePosts.length;
      const readsBeforeOffline = api.messageGets.length;
      await page.context().setOffline(true);
      await expect(page.getByText(words.offline)).toBeVisible();
      await expect(page.getByText(words.content)).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: words.textbox })).toHaveCount(0);
      expect(api.messagePosts).toHaveLength(sendsBeforeOffline);
      api.holdEncounter();
      await page.context().setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(page.getByText(words.reconnecting)).toBeVisible();
      await expect(page.getByRole('textbox', { name: words.textbox })).toHaveCount(0);
      api.releaseEncounter();
      await expect.poll(() => api.messageGets.length).toBeGreaterThan(readsBeforeOffline);
      await expect(page.getByText(draft)).toHaveCount(0);
      expect(api.messagePosts).toHaveLength(sendsBeforeOffline);

      // A new 403 after reconnect removes content and the composer immediately.
      api.setMessageStatus(403);
      const deniedReads = api.messageGets.length;
      await emitRefreshHint(page, '7');
      await expect.poll(() => api.messageGets.length).toBeGreaterThan(deniedReads);
      await expect(page.getByText(words.denied)).toBeVisible();
      await expect(page.getByText(words.clinician)).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: words.textbox })).toHaveCount(0);
      expect(api.messagePosts).toHaveLength(sendsBeforeOffline);
    });

    test(`${locale} completed context removes history and composer at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const api = await wireSyntheticApi(page, { locale, completed: true });
      await openEncounter(page);
      await expect(page.getByRole('heading', { name: words.title })).toBeVisible();
      await expect(page.getByText(words.ended)).toBeVisible();
      await expect(page.getByText(words.clinician)).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: words.textbox })).toHaveCount(0);
      await expect(page.getByRole('button', { name: words.send })).toHaveCount(0);
      expect(api.messagePosts).toHaveLength(0);
      expect(api.messageGets).toHaveLength(0);
      await emitRefreshHint(page, '41');
      await emitRefreshHint(page, '40');
      await expect(page.getByText(words.ended)).toBeVisible();
      await expect(page.getByText(words.clinician)).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: words.textbox })).toHaveCount(0);
      expect(api.messageGets).toHaveLength(0);
      expect(api.messagePosts).toHaveLength(0);
      expect(await page.locator('body').evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: path.join(
          screenshotDir,
          `patient-chat-${locale}-completed-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: false,
      });
    });

    for (const actor of ['GUA', 'DEL'] as const) {
      test(`${locale} ${actor} cannot read or compose chat at ${viewport.width}x${viewport.height}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const api = await wireSyntheticApi(page, { locale, actor });
        await openEncounter(page, actor);
        await expect(page.getByText(words.open)).toBeVisible();
        await expect(page.getByRole('heading', { name: words.chatHeading })).toHaveCount(0);
        await expect(page.getByText(words.clinician)).toHaveCount(0);
        await expect(page.getByRole('textbox', { name: words.textbox })).toHaveCount(0);
        await expect(page.getByRole('button', { name: words.send })).toHaveCount(0);
        expect(api.messagePosts).toHaveLength(0);
        expect(api.messageGets).toHaveLength(0);
        expect(await page.locator('body').evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
          viewport.width,
        );
      });
    }
  }
}

test('late send success cannot restore content after the context completes', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const api = await wireSyntheticApi(page, { locale: 'en-EG' });
  await openEncounter(page);
  const textbox = page.getByRole('textbox', { name: /write a message/i });
  await textbox.fill('Synthetic late completion send.');
  api.holdSend();
  await page.getByRole('button', { name: /send message/i }).click();
  await expect.poll(() => api.messagePosts.length).toBe(1);
  expect(await renderedMessageBodyCount(page, 'Synthetic late completion send.')).toBe(0);
  await expect(textbox).toHaveValue('Synthetic late completion send.');
  api.setCompleted();
  await emitRefreshHint(page, '11');
  await expect(page.getByText('Appointment messages ended')).toBeVisible();
  api.releaseSend();
  await expect.poll(() => api.sendCompletions()).toBe(1);
  expect(await renderedMessageBodyCount(page, 'Synthetic late completion send.')).toBe(0);
  await expect(page.getByRole('heading', { name: 'Message sent' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /write a message/i })).toHaveCount(0);
});

test('late patient send success cannot restore patient chat after the acting route changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const api = await wireSyntheticApi(page, { locale: 'en-EG' });
  await openEncounter(page);
  await page
    .getByRole('textbox', { name: /write a message/i })
    .fill('Synthetic route-change send.');
  api.holdSend();
  await page.getByRole('button', { name: /send message/i }).click();
  await expect.poll(() => api.messagePosts.length).toBe(1);
  await openEncounter(page, 'GUA');
  await expect(page.getByRole('heading', { name: 'Appointment messages' })).toHaveCount(0);
  api.releaseSend();
  await expect.poll(() => api.sendCompletions()).toBe(1);
  expect(await renderedMessageBodyCount(page, 'Synthetic route-change send.')).toBe(0);
  await expect(page.getByRole('heading', { name: 'Message sent' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /write a message/i })).toHaveCount(0);
});
