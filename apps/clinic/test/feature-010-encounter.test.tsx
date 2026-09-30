import { expect, test, type Page } from 'playwright/test';

const encounterId = '95000000-0000-4000-8000-000000000001';
const patientId = '92000000-0000-4000-8000-000000000001';
const facilityId = '90000000-0000-4000-8000-000000000001';
const appointmentId = '93000000-0000-4000-8000-000000000001';
const responsibleId = '96000000-0000-4000-8000-000000000001';
const consultantId = '96000000-0000-4000-8000-000000000002';
const startedAt = '2026-09-29T09:00:00+03:00';
const endedAt = '2026-09-29T09:20:00+03:00';

function encounter(
  status: 'open' | 'completed' = 'open',
  participants: 'responsible' | 'participants' = 'responsible',
) {
  return {
    id: encounterId,
    patientId,
    facilityId,
    appointmentId,
    encounterType: 'consultation',
    responsibleClinicianId: responsibleId,
    status,
    startedAt,
    ...(status === 'completed'
      ? { endedAt, completionSummary: 'Synthetic completion summary.' }
      : {}),
    version: status === 'completed' ? 3 : 1,
    notes: [],
    participants: [
      { personId: responsibleId, roleCode: 'responsible_clinician', startedAt },
      ...(participants === 'participants'
        ? [
            {
              personId: '96000000-0000-4000-8000-000000000003',
              roleCode: 'consultant',
              startedAt: '2026-09-29T09:05:00+03:00',
              endedAt: '2026-09-29T09:10:00+03:00',
            },
            { personId: consultantId, roleCode: 'consultant', startedAt },
          ]
        : []),
    ],
  };
}

async function openWorkspace(
  page: Page,
  locale: 'ar-EG' | 'en-EG' = 'en-EG',
  viewport: { width: number; height: number } = { width: 768, height: 1024 },
  participantState: 'responsible' | 'participants' = 'responsible',
) {
  let activeEncounter = encounter('open', participantState);
  let failNextEncounterRead = false;
  let encounterReadFailureStatus = 503;
  let omitParticipantsFromNextUpdate = false;
  let failNextCompletionConflict = false;
  let loseNextNoteResponse = false;
  const signedOperations = new Map<string, unknown>();
  const seen: Array<{
    path: string;
    method: string;
    query: URLSearchParams;
    body?: unknown;
    headers: Record<string, string>;
  }> = [];
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/v1/, '');
    const body = request.postDataJSON() as Record<string, unknown> | undefined;
    seen.push({
      path,
      method: request.method(),
      query: url.searchParams,
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
    if (path === '/auth/login')
      return json(200, { kind: 'challenge', challenge_id: 'synthetic-challenge' });
    if (path === '/auth/otp/verify')
      return json(200, { kind: 'session', access_token: 'synthetic-staff-token', aal: 2 });
    if (
      path === `/encounters/${encounterId}` &&
      request.method() === 'GET' &&
      failNextEncounterRead
    ) {
      failNextEncounterRead = false;
      return json(encounterReadFailureStatus, {
        type: 'about:blank',
        title: 'Unavailable',
        status: encounterReadFailureStatus,
      });
    }
    if (
      path.startsWith('/encounters/') &&
      (!request.headers()['x-purpose'] || request.headers()['x-aal'] !== '2')
    )
      return json(403, { status: 403 });
    if (path === `/encounters/${encounterId}` && request.method() === 'GET')
      return json(200, activeEncounter);
    if (path === `/encounters/${encounterId}` && request.method() === 'PATCH') {
      const end = (body?.participantIntervalsEnd as Array<{ personId: string }> | undefined)?.[0];
      if (end) {
        activeEncounter = {
          ...activeEncounter,
          version: 2,
          participants: [
            ...(activeEncounter.participants ?? []).map((participant) =>
              participant.personId === end.personId ? { ...participant, endedAt } : participant,
            ),
          ],
        };
      }
      const { notes: _notes, ...withParticipants } = activeEncounter;
      const { participants: _participants, ...withoutParticipants } = withParticipants;
      const updateProjection = omitParticipantsFromNextUpdate
        ? withoutParticipants
        : withParticipants;
      omitParticipantsFromNextUpdate = false;
      return json(200, updateProjection);
    }
    if (path === `/encounters/${encounterId}/notes` && request.method() === 'POST') {
      const key = request.headers()['idempotency-key']!;
      if (signedOperations.has(key)) return json(201, signedOperations.get(key));
      const note = {
        id: '97000000-0000-4000-8000-000000000001',
        encounterId,
        authorId: responsibleId,
        noteType: body?.noteType,
        visibility: body?.visibility,
        signedAt: endedAt,
        body: body?.body,
      };
      activeEncounter = {
        ...activeEncounter,
        version: (activeEncounter.version ?? 1) + 1,
        notes: [...(activeEncounter.notes ?? []), note],
      };
      signedOperations.set(key, note);
      if (loseNextNoteResponse) {
        loseNextNoteResponse = false;
        return route.abort('failed');
      }
      return json(201, note);
    }
    if (path === `/encounters/${encounterId}/complete` && request.method() === 'POST') {
      if (failNextCompletionConflict) {
        failNextCompletionConflict = false;
        return json(409, { type: 'about:blank', title: 'Conflict', status: 409 });
      }
      activeEncounter = {
        ...activeEncounter,
        status: 'completed',
        endedAt,
        completionSummary: body?.summary,
        version: 3,
      };
      return json(200, {
        encounter: activeEncounter,
        appointmentId,
        appointmentVersion: 4,
        appointmentStatus: 'completed',
        queueStatus: 'completed',
        queueEntryId: '94000000-0000-4000-8000-000000000001',
        queueVersion: 5,
        completedAt: endedAt,
      });
    }
    return json(404, { type: 'about:blank', title: 'Not found', status: 404 });
  });
  await page.setViewportSize(viewport);
  await page.goto(`/encounters/${encounterId}`);
  const en = locale === 'en-EG';
  const copy = en
    ? {
        toggle: 'English',
        handle: 'Sign-in handle',
        password: 'Password',
        next: 'Continue',
        otp: 'Verification code',
        verify: 'Verify',
      }
    : {
        toggle: 'العربية',
        handle: 'وسيلة الدخول',
        password: 'كلمة المرور',
        next: 'متابعة',
        otp: 'رمز التحقق',
        verify: 'تحقق',
      };
  if (en) await page.getByRole('button', { name: copy.toggle }).click();
  await page.getByLabel(copy.handle).fill('synthetic-clinic-staff');
  await page.getByLabel(copy.password).fill('synthetic-password');
  await page.getByRole('button', { name: copy.next }).click();
  await page.getByLabel(copy.otp).fill('123456');
  await page.getByRole('button', { name: copy.verify }).click();
  await expect(page.getByRole('main')).toBeVisible();
  return {
    seen,
    loseNextNoteResponse: () => {
      loseNextNoteResponse = true;
    },
    active: () => activeEncounter,
    failNextEncounterRead: (status = 503) => {
      failNextEncounterRead = true;
      encounterReadFailureStatus = status;
    },
    omitParticipantsFromNextUpdate: () => {
      omitParticipantsFromNextUpdate = true;
    },
    failNextCompletionConflict: () => {
      failNextCompletionConflict = true;
    },
  };
}

test('created encounter starts with one responsible participant and no notes or add picker', async ({
  page,
}) => {
  const { seen } = await openWorkspace(page);
  await expect(page.locator('div[lang="en-EG"][dir="ltr"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Encounter workspace' })).toBeVisible();
  await expect(page.getByText('Responsible clinician')).toBeVisible();
  await expect(page.getByText('No signed notes')).toBeVisible();
  await expect(page.getByRole('button', { name: /add participant/i })).toHaveCount(0);
  const get = seen.find(
    (item) => item.path === `/encounters/${encounterId}` && item.method === 'GET',
  );
  expect(get?.query.get('fields')?.split(',').sort()).toEqual([
    'conditions',
    'notes',
    'observations',
    'orders',
    'participants',
  ]);
  await expect(page.getByText(responsibleId)).toHaveCount(1);
  await expect(page.getByText('No signed notes.')).toBeVisible();
  await expect(page.getByText('Signed note body must never appear.')).toHaveCount(0);
});

test('private note draft requires sign review and uses the Core API', async ({ page }) => {
  const { seen } = await openWorkspace(page);
  await page.getByLabel('Note type').fill('Consultation');
  await page.getByLabel('Note body').fill('Synthetic private note body.');
  await page.getByLabel('Note visibility').selectOption('private');
  await page.getByRole('button', { name: 'Review note' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review signed note' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Private', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign note' }).click();
  await expect(
    page.getByText('Synthetic private note body.', { exact: true }).last(),
  ).toBeVisible();
  const signing = seen.find(
    (item) => item.path === `/encounters/${encounterId}/notes` && item.method === 'POST',
  );
  expect(signing?.body).toEqual({
    noteType: 'Consultation',
    body: 'Synthetic private note body.',
    visibility: 'private',
  });
  expect(signing?.headers['idempotency-key']).toBeTruthy();
});

test('patient-visible note draft is disclosed explicitly in sign review', async ({ page }) => {
  const { seen } = await openWorkspace(page);
  await page.getByLabel('Note type').fill('Consultation');
  await page.getByLabel('Note body').fill('Synthetic patient-visible note body.');
  await page.getByLabel('Note visibility').selectOption('patient_visible');
  await page.getByRole('button', { name: 'Review note' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review signed note' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Patient-visible', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign note' }).click();
  await expect(
    page.getByText('Synthetic patient-visible note body.', { exact: true }).last(),
  ).toBeVisible();
  const signing = seen.find(
    (item) => item.path === `/encounters/${encounterId}/notes` && item.method === 'POST',
  );
  expect(signing?.body).toEqual({
    noteType: 'Consultation',
    body: 'Synthetic patient-visible note body.',
    visibility: 'patient_visible',
  });
  expect(signing?.headers['idempotency-key']).toBeTruthy();
});

test('a signed note stays successful when refresh fails and blocks writes until refresh', async ({
  page,
}) => {
  const { seen, failNextEncounterRead } = await openWorkspace(page);
  await page.getByLabel('Note type').fill('Consultation');
  await page.getByLabel('Note body').fill('Signed before refresh failure.');
  await page.getByLabel('Note visibility').selectOption('private');
  await page.getByRole('button', { name: 'Review note' }).click();
  failNextEncounterRead();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign note' }).click();
  await expect(page.getByText('Note signed and added to the encounter record.')).toBeVisible();
  await expect(
    page
      .getByRole('alert')
      .getByText(
        'The change succeeded, but the encounter could not be refreshed. Reload before making another change.',
      ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review note' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit participants' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review completion' })).toHaveCount(0);
  expect(
    seen.filter((item) => item.path.endsWith('/notes') && item.method === 'POST'),
  ).toHaveLength(1);
  expect(
    seen.filter((item) => item.method === 'PATCH' || item.path.endsWith('/complete')),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Refresh encounter from source' }).click();
  await expect(
    page.getByText(
      'The change succeeded, but the encounter could not be refreshed. Reload before making another change.',
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh encounter from source' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit participants' })).toBeEnabled();
  await expect(
    page.getByText('Signed before refresh failure.', { exact: true }).last(),
  ).toBeVisible();
});

test('active participant can be ended only after confirmation while responsible is protected', async ({
  page,
}) => {
  const { seen } = await openWorkspace(page, 'en-EG', { width: 768, height: 1024 }, 'participants');
  await page.getByLabel('Note type').fill('Consultation');
  await page.getByLabel('Note body').fill('Signed before participant change.');
  await page.getByLabel('Note visibility').selectOption('private');
  await page.getByRole('button', { name: 'Review note' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign note' }).click();
  await expect(
    page.getByText('Signed before participant change.', { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit participants' }).click();
  const participantReview = page.getByRole('dialog', { name: 'Review participants' });
  await expect(participantReview.getByText('Historical participant').first()).toBeVisible();
  await expect(participantReview.getByText('Active participant').first()).toBeVisible();
  await expect(
    participantReview.getByRole('button', { name: /remove responsible clinician/i }),
  ).toHaveCount(0);
  await participantReview.getByRole('button', { name: 'End participant interval' }).click();
  const dialog = page.getByRole('dialog', { name: 'End participant interval' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(consultantId)).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm end interval' }).click();
  await expect(page.getByText('Historical participant').first()).toBeVisible();
  await expect(
    page.getByText('Signed before participant change.', { exact: true }).last(),
  ).toBeVisible();
  const update = seen.find(
    (item) => item.path === `/encounters/${encounterId}` && item.method === 'PATCH',
  );
  expect(update?.body).toEqual({
    participantIntervalsEnd: [{ personId: consultantId, roleCode: 'consultant', startedAt }],
  });
  expect(update?.headers['if-match']).toBe('"2"');
  expect(update?.headers['idempotency-key']).toBeTruthy();
});

test('participant update hides stale intervals until authoritative refresh succeeds', async ({
  page,
}) => {
  const { seen, failNextEncounterRead, omitParticipantsFromNextUpdate } = await openWorkspace(
    page,
    'en-EG',
    { width: 768, height: 1024 },
    'participants',
  );
  await page.getByRole('button', { name: 'Edit participants' }).click();
  await page
    .getByRole('dialog', { name: 'Review participants' })
    .getByRole('button', { name: 'End participant interval' })
    .click();
  omitParticipantsFromNextUpdate();
  failNextEncounterRead();
  await page
    .getByRole('dialog', { name: 'End participant interval' })
    .getByRole('button', { name: 'Confirm end interval' })
    .click();

  await expect(
    page
      .getByRole('alert')
      .getByText(
        'The change succeeded, but the encounter could not be refreshed. Reload before making another change.',
      ),
  ).toBeVisible();
  await expect(page.getByText(consultantId, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review note' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review completion' })).toHaveCount(0);
  expect(
    seen.filter((item) => item.path === `/encounters/${encounterId}` && item.method === 'PATCH'),
  ).toHaveLength(1);

  await page.getByRole('button', { name: 'Refresh encounter from source' }).click();
  await expect(page.getByText('Historical participant').first()).toBeVisible();
  await expect(page.getByText(consultantId, { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'The change succeeded, but the encounter could not be refreshed. Reload before making another change.',
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit participants' })).toBeEnabled();
  expect(
    seen.filter((item) => item.path === `/encounters/${encounterId}` && item.method === 'PATCH'),
  ).toHaveLength(1);
});

test('participant refresh denial hides encounter content and write actions', async ({ page }) => {
  const { failNextEncounterRead } = await openWorkspace(
    page,
    'en-EG',
    { width: 768, height: 1024 },
    'participants',
  );
  await page.getByRole('button', { name: 'Edit participants' }).click();
  await page
    .getByRole('dialog', { name: 'Review participants' })
    .getByRole('button', { name: 'End participant interval' })
    .click();
  failNextEncounterRead(403);
  await page
    .getByRole('dialog', { name: 'End participant interval' })
    .getByRole('button', { name: 'Confirm end interval' })
    .click();

  await expect(
    page
      .getByRole('alert')
      .getByText(
        'You are not authorized to view this encounter, or access could not be confirmed.',
      ),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Encounter context' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review note' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh encounter from source' })).toHaveCount(0);
});

test('completion reviews a nonblank summary and structural confirmation then locks completed writes', async ({
  page,
}) => {
  const { seen } = await openWorkspace(page, 'en-EG', { width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Review completion' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review encounter completion' });
  await expect(dialog).toBeVisible();
  const completeButton = dialog.getByRole('button', { name: 'Complete encounter' });
  await expect(completeButton).toBeDisabled();
  await dialog.getByLabel('Completion summary').fill('Synthetic completion summary.');
  await expect(completeButton).toBeDisabled();
  await dialog.getByLabel('I confirm this encounter is structurally complete').check();
  await completeButton.click();
  await expect(
    page.getByText('The linked encounter, appointment, and queue are complete.'),
  ).toBeVisible();
  await expect(page.getByText('Completed').first()).toBeVisible();
  await expect(page.getByText('Appointment reference')).toBeVisible();
  await expect(page.getByText(appointmentId).last()).toBeVisible();
  await expect(page.getByText('Appointment version')).toBeVisible();
  await expect(page.getByText('Queue entry reference')).toBeVisible();
  await expect(page.getByText('94000000-0000-4000-8000-000000000001')).toBeVisible();
  await expect(page.getByText('Queue version')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /sign note|review completion|end .* interval/i }),
  ).toHaveCount(0);
  const completion = seen.find(
    (item) => item.path === `/encounters/${encounterId}/complete` && item.method === 'POST',
  );
  expect(completion?.body).toEqual({
    summary: 'Synthetic completion summary.',
    structuralConfirmation: true,
  });
  expect(completion?.headers['if-match']).toBe('"1"');
  expect(completion?.headers['idempotency-key']).toBeTruthy();
  expect(seen.filter((item) => item.method === 'PATCH')).toHaveLength(0);
  expect(
    seen.filter((item) => item.path.endsWith('/notes') && item.method === 'POST'),
  ).toHaveLength(0);
});

test('completion conflict does not report success or lock the open encounter', async ({ page }) => {
  const { seen, failNextCompletionConflict } = await openWorkspace(page);
  await page.getByRole('button', { name: 'Review completion' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review encounter completion' });
  await dialog.getByLabel('Completion summary').fill('Synthetic completion summary.');
  await dialog.getByLabel('I confirm this encounter is structurally complete').check();
  failNextCompletionConflict();
  await dialog.getByRole('button', { name: 'Complete encounter' }).click();

  await expect(
    page.getByText('Encounter could not be completed. Review the current state.'),
  ).toBeVisible();
  await expect(
    page.getByText('The linked encounter, appointment, and queue are complete.'),
  ).toHaveCount(0);
  const context = page.getByRole('region', { name: 'Encounter context' });
  await expect(context.getByText('Open')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review completion' })).toBeEnabled();
  await expect(page.getByText('Appointment reference')).toHaveCount(0);
  expect(
    seen.filter(
      (item) => item.path === `/encounters/${encounterId}/complete` && item.method === 'POST',
    ),
  ).toHaveLength(1);
});

test('Arabic completion statuses stay localized human text in RTL rows', async ({ page }) => {
  await openWorkspace(page, 'ar-EG', { width: 768, height: 1024 });
  await page.getByRole('button', { name: 'مراجعة الإكمال' }).click();
  const dialog = page.getByRole('dialog', { name: 'مراجعة إكمال الزيارة' });
  await dialog.getByLabel('ملخص الإكمال').fill('ملخص اصطناعي للإكمال.');
  await dialog.getByLabel('أؤكد اكتمال البنية المطلوبة للزيارة.').check();
  await dialog.getByRole('button', { name: 'إكمال الزيارة' }).click();

  for (const label of ['حالة الموعد بعد الإكمال', 'حالة الدور بعد الإكمال']) {
    const row = page.getByText(label, { exact: true }).locator('..');
    await expect(row.getByText('مكتملة', { exact: true })).toBeVisible();
    await expect(row.locator('bdi[dir="ltr"]')).toHaveCount(0);
  }
  await expect(page.getByText('completed', { exact: true })).toHaveCount(0);
});

test('Arabic RTL and English LTR keep encounter actions keyboard accessible at clinic viewports', async ({
  page,
}) => {
  for (const [locale, viewport] of [
    ['ar-EG', { width: 768, height: 1024 }],
    ['en-EG', { width: 768, height: 1024 }],
    ['ar-EG', { width: 1440, height: 900 }],
    ['en-EG', { width: 1440, height: 900 }],
  ] as const) {
    await openWorkspace(page, locale, viewport);
    await expect(
      page.locator(`div[lang="${locale}"][dir="${locale === 'ar-EG' ? 'rtl' : 'ltr'}"]`),
    ).toBeVisible();
    const action =
      locale === 'ar-EG'
        ? page.getByRole('button', { name: 'مراجعة الإكمال' })
        : page.getByRole('button', { name: 'Review completion' });
    await action.focus();
    await expect(action).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(action).toBeFocused();
  }
});

test('committed note with lost response replays one immutable signing operation; changed payload gets a new key', async ({
  page,
}) => {
  const api = await openWorkspace(page);
  await page.getByLabel('Note type').fill('Consultation');
  await page.getByLabel('Note body').fill('Synthetic response lost note.');
  await page.getByLabel('Note visibility').selectOption('private');
  api.loseNextNoteResponse();
  await page.getByRole('button', { name: 'Review note' }).click();
  await page.getByRole('button', { name: 'Sign note', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Review note' }).click();
  await page.getByRole('button', { name: 'Sign note', exact: true }).click();
  await expect(page.getByLabel('Note body')).toHaveValue('');
  const posts = () =>
    api.seen.filter((item) => item.path.endsWith('/notes') && item.method === 'POST');
  expect(posts()).toHaveLength(2);
  expect(posts()[1]!.headers['idempotency-key']).toBe(posts()[0]!.headers['idempotency-key']);
  expect(api.active().notes).toHaveLength(1);
  await page.getByLabel('Note type').fill('Consultation');
  await page.getByLabel('Note body').fill('Synthetic changed note.');
  await page.getByLabel('Note visibility').selectOption('private');
  api.loseNextNoteResponse();
  await page.getByRole('button', { name: 'Review note' }).click();
  await page.getByRole('button', { name: 'Sign note', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Note body').fill('Synthetic revised signing payload.');
  await page.getByRole('button', { name: 'Review note' }).click();
  await page.getByRole('button', { name: 'Sign note', exact: true }).click();
  await expect(page.getByLabel('Note body')).toHaveValue('');
  expect(posts()[3]!.headers['idempotency-key']).not.toBe(posts()[2]!.headers['idempotency-key']);
});
