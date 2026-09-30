import { expect, test, type Page } from 'playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const encounterId = '95000000-0000-4000-8000-000000000001';
const otherEncounterId = '95000000-0000-4000-8000-000000000002';
const appointmentId = '93000000-0000-4000-8000-000000000001';
const otherAppointmentId = '93000000-0000-4000-8000-000000000002';
const patientId = '92000000-0000-4000-8000-000000000001';
const staffId = '96000000-0000-4000-8000-000000000001';
const messageId = '98000000-0000-4000-8000-000000000001';
const otherMessageId = '98000000-0000-4000-8000-000000000002';
const updatedAt = '2026-09-29T09:30:00+03:00';
const captures = path.join(os.tmpdir(), 'shifaa-f010-clinic-chat-captures');
type Locale = 'ar-EG' | 'en-EG';
type Mode =
  | 'active'
  | 'empty'
  | 'completed'
  | 'removed'
  | 'participant-ended'
  | 'forbidden'
  | 'unavailable'
  | 'conflict';
type Seen = { path: string; method: string; body?: unknown; headers: Record<string, string> };

function projection(id = messageId, body = 'Synthetic canonical history message.') {
  return {
    id,
    contextType: 'appointment',
    contextId: appointmentId,
    senderId: staffId,
    body,
    sentAt: updatedAt,
    privateNote: 'SYNTHETIC_PRIVATE_MESSAGE_CANARY',
    patientName: 'SYNTHETIC_PATIENT_NAME_CANARY',
  };
}

function page(data = [projection()], nextCursor: string | null = 'older-page') {
  return { data, meta: { nextCursor, lastUpdatedAt: updatedAt, stale: false } };
}

async function installApi(pageView: Page) {
  const seen: Seen[] = [];
  let mode: Mode = 'active';
  let nextBody = 'Synthetic canonical history message.';
  let holdMessages = false;
  let listStarted: (() => void) | undefined;
  let releaseList: (() => void) | undefined;
  let holdPost = false;
  let postStarted: (() => void) | undefined;
  let releasePost: (() => void) | undefined;
  let postAttempts = 0;
  let getSequence = 0;
  let staleNextList = false;
  let actorId = staffId;

  await pageView.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestPath = url.pathname.replace(/^\/v1/, '');
    const body = request.postDataJSON() as unknown;
    seen.push({
      path: requestPath,
      method: request.method(),
      headers: request.headers(),
      ...(body ? { body } : {}),
    });
    const json = (status: number, value: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify(value),
      });
    if (requestPath === '/auth/login')
      return json(200, {
        kind: 'challenge',
        challenge_id: '96000000-0000-4000-8000-000000000099',
      });
    if (requestPath === '/auth/otp/verify')
      return json(200, { kind: 'session', access_token: 'synthetic-clinic-token', aal: 2 });
    if (requestPath === '/people/me') return json(200, { id: actorId, display_name: 'discarded' });
    if (requestPath === `/encounters/${encounterId}`) {
      return json(200, {
        id: encounterId,
        patientId,
        appointmentId,
        status: mode === 'completed' ? 'completed' : 'open',
        endedAt: mode === 'completed' ? updatedAt : null,
        participants:
          mode === 'removed'
            ? []
            : [
                {
                  personId: staffId,
                  roleCode: 'responsible_clinician',
                  startedAt: '2026-09-29T09:00:00+03:00',
                  endedAt: mode === 'participant-ended' ? updatedAt : null,
                },
              ],
        clinicalMetadata: 'SYNTHETIC_CLINICAL_CANARY',
      });
    }
    if (requestPath === `/encounters/${otherEncounterId}`)
      return json(200, {
        id: otherEncounterId,
        patientId,
        appointmentId: otherAppointmentId,
        status: 'open',
        endedAt: null,
        participants: [
          {
            personId: staffId,
            roleCode: 'responsible_clinician',
            startedAt: updatedAt,
            endedAt: mode === 'participant-ended' ? updatedAt : null,
          },
        ],
      });
    if (requestPath === `/contexts/appointment/${appointmentId}/messages`) {
      if (request.method() === 'POST') {
        postAttempts += 1;
        if (holdPost) {
          postStarted?.();
          await new Promise<void>((resolve) => {
            releasePost = resolve;
          });
          releasePost = undefined;
        }
        if (mode !== 'active') return json(403, { status: 403, detail: 'SYNTHETIC_DENIAL_CANARY' });
        const submitted = (body as { body?: string } | undefined)?.body ?? '';
        return json(201, { ...projection(otherMessageId, submitted), privateNote: undefined });
      }
      getSequence += 1;
      if (mode === 'forbidden')
        return json(403, { status: 403, detail: 'SYNTHETIC_DENIAL_CANARY' });
      if (mode === 'unavailable')
        return json(503, { status: 503, detail: 'SYNTHETIC_UNAVAILABLE_CANARY' });
      if (mode === 'conflict')
        return json(409, { status: 409, detail: 'SYNTHETIC_CONFLICT_CANARY' });
      if (!['active', 'empty'].includes(mode))
        return json(409, { status: 409, detail: 'SYNTHETIC_ENDED_CANARY' });
      if (staleNextList) {
        staleNextList = false;
        return json(200, {
          data: [],
          meta: { nextCursor: null, lastUpdatedAt: updatedAt, stale: true },
        });
      }
      if (holdMessages) {
        listStarted?.();
        await new Promise<void>((resolve) => {
          releaseList = resolve;
        });
        releaseList = undefined;
      }
      if (url.searchParams.has('cursor'))
        return json(200, page([projection(otherMessageId, 'Synthetic older page.')], null));
      return json(200, page(mode === 'empty' ? [] : [projection(messageId, nextBody)]));
    }
    return json(404, { type: 'about:blank', title: 'Not found', status: 404 });
  });

  return {
    seen,
    setMode(value: Mode) {
      mode = value;
    },
    setActor(value: 'staff' | 'patient') {
      actorId = value === 'staff' ? staffId : patientId;
    },
    setNextBody(value: string) {
      nextBody = value;
    },
    staleNextList() {
      staleNextList = true;
    },
    holdNextList() {
      holdMessages = true;
      return new Promise<void>((resolve) => {
        listStarted = resolve;
      });
    },
    releaseList() {
      holdMessages = false;
      if (!releaseList) throw new Error('No held message read');
      releaseList();
    },
    holdNextPost() {
      holdPost = true;
      return new Promise<void>((resolve) => {
        postStarted = resolve;
      });
    },
    releasePost() {
      holdPost = false;
      if (!releasePost) throw new Error('No held message send');
      releasePost();
    },
    get postAttempts() {
      return postAttempts;
    },
    get getSequence() {
      return getSequence;
    },
  };
}

function copy(locale: Locale) {
  return locale === 'en-EG'
    ? {
        lang: 'English',
        handle: 'Sign-in handle',
        password: 'Password',
        next: 'Continue',
        otp: 'Verification code',
        verify: 'Verify',
        encounter: 'Encounter ID',
        appointment: 'Appointment ID',
        confirm: 'Verify selected context',
        body: 'Write a message',
        send: 'Send message',
        retry: 'Recheck access',
        more: 'Load older messages',
        nav: 'Clinic navigation',
        messages: 'Appointment-context messages',
        sent: 'Message sent',
        empty: 'No messages for this appointment.',
        offline: 'You are offline.',
        reconnecting: 'Rechecking access against the authoritative record',
        conflict: 'The context changed or could not be confirmed.',
        denied: 'Current access to this context could not be confirmed.',
        unavailable: 'Messaging is currently unavailable.',
      }
    : {
        lang: 'English',
        handle: 'وسيلة الدخول',
        password: 'كلمة المرور',
        next: 'متابعة',
        otp: 'رمز التحقق',
        verify: 'تحقق',
        encounter: 'معرّف الزيارة',
        appointment: 'معرّف الموعد',
        confirm: 'تحقق من السياق المحدد',
        body: 'اكتب رسالة',
        send: 'إرسال الرسالة',
        retry: 'إعادة التحقق',
        more: 'تحميل رسائل أقدم',
        nav: 'تنقل العيادة',
        messages: 'رسائل سياق الموعد',
        sent: 'تم إرسال الرسالة',
        empty: 'لا توجد رسائل لهذا الموعد.',
        offline: 'لا يوجد اتصال.',
        reconnecting: 'جارٍ إعادة التحقق عبر السجل الموثوق',
        conflict: 'تغير السياق أو تعذر تأكيده.',
        denied: 'لا توجد صلاحية حالية لعرض هذا السياق.',
        unavailable: 'خدمة الرسائل غير متاحة حاليًا.',
      };
}

async function openMessages(
  page: Page,
  api: Awaited<ReturnType<typeof installApi>>,
  locale: Locale,
  viewport: { width: number; height: number },
) {
  const words = copy(locale);
  await page.setViewportSize(viewport);
  await page.goto('/messages');
  await switchMessagesLocale(page, locale);
  await page.getByLabel(words.handle).fill('synthetic-clinic-staff');
  await page.getByLabel(words.password).fill('synthetic-password');
  await page.getByRole('button', { name: words.next }).click();
  await page.getByLabel(words.otp).fill('123456');
  await page.getByRole('button', { name: words.verify }).click();
  await expect(page.getByRole('heading', { name: words.messages })).toBeVisible();
  await page.getByLabel(words.encounter).fill(encounterId);
  await page.getByLabel(words.appointment).fill(appointmentId);
  await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
  await expect(page.getByRole('button', { name: words.send })).toHaveCount(0);
  await page.getByRole('button', { name: words.confirm }).click();
  await expect(page.getByRole('textbox', { name: words.body })).toBeVisible();
  await expect(page.getByText('Synthetic canonical history message.')).toBeVisible();
  return words;
}

async function switchMessagesLocale(page: Page, locale: Locale) {
  // Next can paint a client-navigation destination before its click handlers hydrate.
  // Verify the toggle's semantic state; if the SSR click was dropped, retry after that
  // state check rather than accepting the unchanged locale.
  const englishHeading = page.getByRole('heading', { name: 'Clinic staff sign-in' });
  const arabicToggle = page.getByRole('button', { name: 'العربية' });
  await page.getByRole('button', { name: 'English' }).click();
  try {
    await expect(arabicToggle).toBeVisible({ timeout: 750 });
  } catch {
    await page.getByRole('button', { name: 'English' }).click();
    await expect(arabicToggle).toBeVisible();
  }
  await expect(englishHeading).toBeVisible();
  if (locale === 'ar-EG') {
    const englishToggle = page.getByRole('button', { name: 'English' });
    await arabicToggle.click();
    try {
      await expect(englishToggle).toBeVisible({ timeout: 750 });
    } catch {
      await page.getByRole('button', { name: 'العربية' }).click();
      await expect(englishToggle).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'دخول موظف العيادة' })).toBeVisible();
  }
}

test('appointment-context messages stay REST-authorized and readable in Arabic and English at required viewports', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await fs.mkdir(captures, { recursive: true });
  const api = await installApi(page);
  for (const [locale, viewport] of [
    ['ar-EG', { width: 768, height: 1024 }],
    ['en-EG', { width: 768, height: 1024 }],
    ['ar-EG', { width: 1440, height: 900 }],
    ['en-EG', { width: 1440, height: 900 }],
  ] as const) {
    api.setMode('active');
    api.setNextBody('Synthetic canonical history message.');
    const words = await openMessages(page, api, locale, viewport);
    const en = locale === 'en-EG';
    const main = page.getByRole('main');
    const localizedRoot = main.locator('xpath=..');
    await expect(localizedRoot).toHaveAttribute('lang', locale);
    await expect(localizedRoot).toHaveAttribute('dir', en ? 'ltr' : 'rtl');
    const headingFont = await main
      .locator('h1')
      .evaluate((element) => getComputedStyle(element).fontFamily);
    expect(headingFont).toContain(en ? 'Inter' : 'IBM Plex Sans Arabic');
    await expect(page.getByText('SYNTHETIC_PRIVATE_MESSAGE_CANARY')).toHaveCount(0);
    await expect(page.getByText('SYNTHETIC_PATIENT_NAME_CANARY')).toHaveCount(0);
    await expect(page.getByRole('button', { name: words.more })).toBeVisible();

    const textarea = page.getByRole('textbox', { name: words.body });
    await textarea.fill('Synthetic draft held until server confirmation.');
    const heldPost = api.holdNextPost();
    await textarea.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: words.send })).toBeFocused();
    await page.keyboard.press('Enter');
    await heldPost;
    await expect(
      page.locator('main p').filter({ hasText: 'Synthetic draft held until server confirmation.' }),
    ).toHaveCount(0);
    await expect(page.getByText(/Message sent|تم إرسال الرسالة/)).toHaveCount(0);
    api.releasePost();
    const receipt = page.getByRole('heading', { name: words.sent }).locator('xpath=..');
    const sentBody = receipt
      .locator('p')
      .filter({ hasText: 'Synthetic draft held until server confirmation.' });
    await expect(sentBody).toBeVisible();
    await expect(page.getByText(otherMessageId)).toBeVisible();
    await expect(page.getByRole('heading', { name: words.sent })).toBeVisible();
    await expect(page.getByRole('heading', { name: words.sent })).toBeFocused();
    await expect(page.getByText(otherMessageId)).toHaveAttribute('dir', 'ltr');
    await expect(textarea).toHaveValue('');
    const bodyBox = await sentBody.boundingBox();
    expect(bodyBox).not.toBeNull();
    expect(bodyBox!.y + bodyBox!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({
      path: path.join(captures, `c25-${locale}-${viewport.width}x${viewport.height}-success.png`),
      fullPage: true,
    });

    // A missed hint does not synthesize content. Explicit refresh obtains new REST history.
    api.setNextBody('REST-only update without a hint.');
    await expect(page.getByText('REST-only update without a hint.', { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByText('REST-only update without a hint.', { exact: true })).toBeVisible();

    // Matching hints only invalidate; duplicate and foreign-context hints are inert.
    const beforeMalformedHint = api.getSequence;
    await page.evaluate(
      ({ appointmentId }) => {
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: '97000000-0000-4000-8000-000000000001',
              contextId: appointmentId,
              version: 1,
              body: 'HINT_BODY_MUST_NOT_RENDER',
            },
          }),
        );
      },
      { appointmentId },
    );
    await expect.poll(() => api.getSequence).toBe(beforeMalformedHint);
    await page.evaluate(
      ({ appointmentId }) => {
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: '97000000-0000-4000-8000-000000000003',
              contextId: appointmentId,
              version: 1,
            },
          }),
        );
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: '97000000-0000-4000-8000-000000000002',
              contextId: '93000000-0000-4000-8000-000000000002',
              version: 1,
            },
          }),
        );
      },
      { appointmentId },
    );
    await expect.poll(() => api.getSequence).toBeGreaterThan(beforeMalformedHint);
    const afterFreshHint = api.getSequence;
    await page.evaluate(
      ({ appointmentId }) => {
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: '97000000-0000-4000-8000-000000000005',
              contextId: appointmentId,
              version: 1,
            },
          }),
        );
      },
      { appointmentId },
    );
    await expect.poll(() => api.getSequence).toBeGreaterThan(afterFreshHint);
    const afterOutOfOrder = api.getSequence;
    await page.evaluate(
      ({ appointmentId }) => {
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: '97000000-0000-4000-8000-000000000005',
              contextId: appointmentId,
              version: 1,
            },
          }),
        );
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: '97000000-0000-4000-8000-000000000003',
              contextId: appointmentId,
              version: 1,
            },
          }),
        );
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: '97000000-0000-4000-8000-000000000004',
              contextId: '93000000-0000-4000-8000-000000000002',
              version: 1,
            },
          }),
        );
      },
      { appointmentId },
    );
    await expect(page.getByText('HINT_BODY_MUST_NOT_RENDER')).toHaveCount(0);
    await expect.poll(() => api.getSequence).toBe(afterOutOfOrder);

    // Closed history and composer while stale; a fresh hint triggers authoritative REST again.
    api.staleNextList();
    const staleBefore = api.getSequence;
    await page.getByRole('button', { name: words.retry }).click();
    await expect.poll(() => api.getSequence).toBeGreaterThan(staleBefore);
    await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
    await expect(page.getByText('Synthetic canonical history message.')).toHaveCount(0);
    await expect(page.getByText('REST-only update without a hint.', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText(/out of date|قد تكون الرسائل قديمة/i)).toBeVisible();
    await page.screenshot({
      path: path.join(captures, `c25-${locale}-${viewport.width}x${viewport.height}-stale.png`),
      fullPage: true,
    });
    await page.evaluate(
      ({ appointmentId }) => {
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: '97000000-0000-4000-8000-000000000006',
              contextId: appointmentId,
              version: 1,
            },
          }),
        );
      },
      { appointmentId },
    );
    await expect(page.getByRole('textbox', { name: words.body })).toBeVisible();
    api.setNextBody('Synthetic canonical history message.');

    // Empty history is explicit and never materializes a fabricated message.
    api.setMode('empty');
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByText(new RegExp(words.empty))).toBeVisible();
    await expect(page.getByText('Synthetic canonical history message.')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: words.body })).toBeVisible();
    api.setMode('active');
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByText('Synthetic canonical history message.')).toBeVisible();

    // The offline event clears protected UI and drafts; reconnect re-reads REST without queueing a send.
    const beforeOfflinePosts = api.postAttempts;
    await page.getByRole('textbox', { name: words.body }).fill('Draft removed while offline.');
    await page.context().setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(page.getByText(new RegExp(words.offline))).toBeVisible();
    await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
    await expect(page.getByText('Synthetic canonical history message.')).toHaveCount(0);
    expect(api.postAttempts).toBe(beforeOfflinePosts);
    await page.context().setOffline(false);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
    await expect(page.getByRole('textbox', { name: words.body })).toBeVisible();
    await expect(page.getByText('Synthetic canonical history message.')).toBeVisible();
    await expect(page.getByText('Draft removed while offline.')).toHaveCount(0);

    // Held reauthorization shows reconnecting with no protected history, then restores only a fresh REST page.
    const heldRead = api.holdNextList();
    await page.getByRole('button', { name: words.retry }).click();
    await heldRead;
    await expect(page.getByText(new RegExp(words.reconnecting))).toBeVisible();
    await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
    await expect(page.getByText('Synthetic canonical history message.')).toHaveCount(0);
    api.releaseList();
    await expect(page.getByRole('textbox', { name: words.body })).toBeVisible();
    await expect(page.getByText('Synthetic canonical history message.')).toBeVisible();

    // A held success from the old request cannot win after an explicit newer preflight denies this actor.
    const overlapList = api.holdNextList();
    await page.getByRole('button', { name: words.retry }).click();
    await overlapList;
    api.setActor('patient');
    await page.getByRole('button', { name: words.confirm }).click();
    await expect(page.getByText(new RegExp(words.denied))).toBeVisible();
    await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
    api.releaseList();
    await expect(page.getByText(new RegExp(words.denied))).toBeVisible();
    await expect(page.getByText('Synthetic canonical history message.')).toHaveCount(0);
    api.setActor('staff');
    await page.getByRole('button', { name: words.confirm }).click();
    await expect(page.getByRole('textbox', { name: words.body })).toBeVisible();

    // Conflict, temporary service failure and a PAT identity each fail closed before content returns.
    api.setMode('conflict');
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByText(new RegExp(words.conflict))).toBeVisible();
    await expect(page.getByText('Synthetic canonical history message.')).toHaveCount(0);
    api.setMode('unavailable');
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByText(new RegExp(words.unavailable))).toBeVisible();
    api.setMode('active');
    api.setActor('patient');
    const beforePatientDenied = api.getSequence;
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByText(new RegExp(words.denied))).toBeVisible();
    await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
    expect(api.getSequence).toBe(beforePatientDenied);
    api.setActor('staff');
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByRole('textbox', { name: words.body })).toBeVisible();

    // Pagination binds to this appointment context only.
    await page.getByRole('button', { name: words.more }).click();
    await expect(page.getByText('Synthetic older page.')).toBeVisible();
    const messageReads = api.seen.filter(
      (item) => item.path.includes('/contexts/appointment/') && item.method === 'GET',
    );
    expect(messageReads.length).toBeGreaterThan(2);
    expect(
      messageReads.every((item) => item.path === `/contexts/appointment/${appointmentId}/messages`),
    ).toBe(true);
    expect(
      messageReads.some((item) => item.headers['x-purpose'] === 'appointment.scheduling'),
    ).toBe(true);

    // Actual 2x computed text size and 320px narrow reflow; measure rendered leaf text, not inherited parents.
    const scaling = await main.evaluate((root) => {
      const candidates = [
        ...root.querySelectorAll<HTMLElement>(
          'h1,h2,h3,p,small,label,button,textarea,a,article,div,span',
        ),
      ];
      const visibleLeaves = candidates.filter((element) => {
        const text = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        const rect = element.getBoundingClientRect();
        return text && rect.width > 0 && rect.height > 0;
      });
      const measured = visibleLeaves.map((element) => ({
        element,
        before: parseFloat(getComputedStyle(element).fontSize),
      }));
      const body = [...root.querySelectorAll<HTMLElement>('article p')].find((element) =>
        element.textContent?.includes('Synthetic older page.'),
      );
      const bodyBefore = body ? parseFloat(getComputedStyle(body).fontSize) : 0;
      for (const item of measured)
        item.element.style.setProperty('font-size', `${item.before * 2}px`, 'important');
      const bodyAfter = body ? parseFloat(getComputedStyle(body).fontSize) : 0;
      return {
        count: measured.length,
        bodyBefore,
        bodyAfter,
      };
    });
    expect(scaling.count).toBeGreaterThan(0);
    expect(scaling.bodyBefore).toBeGreaterThan(0);
    expect(scaling.bodyAfter).toBeCloseTo(scaling.bodyBefore * 2, 1);
    await page.setViewportSize({ width: 320, height: 800 });
    const narrow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      textarea: (() => {
        const box = document.querySelector('textarea')?.getBoundingClientRect();
        return box ? { left: box.left, right: box.right } : null;
      })(),
    }));
    expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.clientWidth);
    expect(narrow.textarea).not.toBeNull();
    expect(narrow.textarea!.right).toBeLessThanOrEqual(narrow.clientWidth);
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await expect(page.getByRole('button', { name: words.retry })).toBeVisible();
    await textarea.fill('Keyboard accessibility draft.');
    await textarea.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: words.send })).toBeFocused();
    await textarea.fill('');
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });

    await page.setViewportSize(viewport);
    api.setMode('active');
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByText('Synthetic canonical history message.')).toBeVisible();
    api.setMode('completed');
    const getCount = api.seen.filter(
      (item) => item.method === 'GET' && item.path.endsWith('/messages'),
    ).length;
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
    await expect(page.getByText('Synthetic older page.')).toHaveCount(0);
    await expect(page.getByText('REST-only update without a hint.', { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText(/encounter ended|انتهت الزيارة|لم تعد الرسائل متاحة/i),
    ).toBeVisible();
    expect(
      api.seen.filter((item) => item.method === 'GET' && item.path.endsWith('/messages')).length,
    ).toBe(getCount);
    await page.evaluate(
      ({ appointmentId }) => {
        window.dispatchEvent(
          new CustomEvent('shifaa:feature-010-refresh-hint', {
            detail: {
              eventId: '97000000-0000-4000-8000-000000000009',
              contextId: appointmentId,
              version: 1,
            },
          }),
        );
      },
      { appointmentId },
    );
    await expect(
      page.getByText(/encounter ended|انتهت الزيارة|لم تعد الرسائل متاحة/i),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
    expect(
      api.seen.filter((item) => item.method === 'GET' && item.path.endsWith('/messages')).length,
    ).toBe(getCount);
    await page.screenshot({
      path: path.join(captures, `c25-${locale}-${viewport.width}x${viewport.height}-completed.png`),
      fullPage: true,
    });
  }
});

test('the real Today navigation exposes Messages and protected content clears on participant/access loss', async ({
  page,
}) => {
  const api = await installApi(page);
  for (const [locale, viewport] of [
    ['ar-EG', { width: 768, height: 1024 }],
    ['en-EG', { width: 768, height: 1024 }],
    ['ar-EG', { width: 1440, height: 900 }],
    ['en-EG', { width: 1440, height: 900 }],
  ] as const) {
    const words = copy(locale);
    api.setMode('active');
    await page.setViewportSize(viewport);
    await page.goto('/today');
    if (locale === 'en-EG') await page.getByRole('button', { name: 'English' }).click();
    await expect(
      page.getByRole('link', { name: /Appointment messages|رسائل المواعيد/ }),
    ).toBeVisible();
    await page.getByRole('link', { name: /Appointment messages|رسائل المواعيد/ }).click();
    await expect(
      page.getByRole('heading', { name: /Clinic staff sign-in|دخول موظف العيادة/i }),
    ).toBeVisible();
    await switchMessagesLocale(page, locale);
    await expect(
      page.getByRole('heading', { name: /Clinic staff sign-in|دخول موظف العيادة/i }),
    ).toBeVisible();
    await page.getByLabel(words.handle).fill('synthetic-clinic-staff');
    await page.getByLabel(words.password).fill('synthetic-password');
    await expect(page.getByLabel(words.handle)).toHaveValue('synthetic-clinic-staff');
    await expect(page.getByLabel(words.password)).toHaveValue('synthetic-password');
    await expect(page.getByRole('button', { name: words.next })).toBeEnabled();
    await page.getByRole('button', { name: words.next }).click();
    await page.getByLabel(words.otp).fill('123456');
    await page.getByRole('button', { name: words.verify }).click();
    await expect(
      page.getByRole('link', { name: locale === 'en-EG' ? 'Today' : 'اليوم' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: words.messages })).toBeVisible();
    await page.getByLabel(words.encounter).fill(encounterId);
    await page.getByLabel(words.appointment).fill(appointmentId);
    await page.getByRole('button', { name: words.confirm }).click();
    await expect(page.getByText('Synthetic canonical history message.')).toBeVisible();
    api.setMode('removed');
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
    await expect(page.getByText('Synthetic canonical history message.')).toHaveCount(0);
    await expect(
      page.getByText(
        /participation ended|workforce participation ended|انتهت مشاركة|انتهت صلاحية المشاركة/i,
      ),
    ).toBeVisible();
    const protectedCalls = api.seen.filter((item) => item.path.includes('/contexts/appointment/'));
    expect(
      protectedCalls.every((item) => item.path.endsWith(`/appointment/${appointmentId}/messages`)),
    ).toBe(true);
    await page.screenshot({
      path: path.join(captures, `c25-${locale}-${viewport.width}x${viewport.height}-removed.png`),
      fullPage: true,
    });
    api.setMode('active');
    await page.getByRole('button', { name: words.confirm }).click();
    await expect(page.getByText('Synthetic canonical history message.')).toBeVisible();
    api.setMode('participant-ended');
    const beforeEndedParticipant = api.seen.filter(
      (item) => item.method === 'GET' && item.path.endsWith('/messages'),
    ).length;
    await page.getByRole('button', { name: words.retry }).click();
    await expect(page.getByRole('textbox', { name: words.body })).toHaveCount(0);
    await expect(page.getByText('Synthetic canonical history message.')).toHaveCount(0);
    await expect(
      page.getByText(/participation ended|workforce participation ended|انتهت مشاركة/i),
    ).toBeVisible();
    expect(
      api.seen.filter((item) => item.method === 'GET' && item.path.endsWith('/messages')).length,
    ).toBe(beforeEndedParticipant);
  }
});
