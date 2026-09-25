import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PatientClinicSchedulingApi } from '../src/clinic-scheduling-api.ts';

const route = fs.readFileSync(new URL('../app/appointments/[id].tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/clinic-scheduling-api.ts', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../src/ClinicSchedulingShell.tsx', import.meta.url), 'utf8');
const tokens = fs.readFileSync(
  new URL('../../../packages/design-system/src/tokens.ts', import.meta.url),
  'utf8',
);
const plan = fs.readFileSync(
  new URL('../../../specs/009-clinic-scheduling-appointments-queue/plan.md', import.meta.url),
  'utf8',
);
const spec = fs.readFileSync(
  new URL('../../../specs/009-clinic-scheduling-appointments-queue/spec.md', import.meta.url),
  'utf8',
);

const appointment = {
  id: '92000000-0000-4000-8000-000000000001',
  patientId: '91000000-0000-4000-8000-000000000003',
  facilityId: '90000000-0000-4000-8000-000000000001',
  doctorId: '91000000-0000-4000-8000-000000000001',
  startsAt: '2030-01-07T09:00:00Z',
  endsAt: '2030-01-07T09:30:00Z',
  timezone: 'Africa/Cairo',
  civilDate: '2030-01-07',
  status: 'confirmed' as const,
  feeMinorUnits: 35000,
  currency: 'EGP' as const,
  paymentMethod: 'cash_on_arrival' as const,
  version: 7,
};
const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('appointment route covers every canonical state and preserves producer boundaries', () => {
  const appointmentStates = [
    'requested',
    'confirmed',
    'checked_in',
    'in_queue',
    'in_consultation',
    'completed',
    'cancelled',
    'no_show',
    'reschedule_required',
  ];
  for (const state of appointmentStates) assert.match(spec, new RegExp(`\\b${state}\\b`));

  // The patient surface may read its own appointment/queue and can only produce
  // the three subject actions. Clinic-only transitions remain absent here.
  for (const method of [
    'getMyAppointment',
    'getMyQueuePosition',
    'cancelMyAppointment',
    'rescheduleMyAppointment',
    'checkInMyAppointment',
  ])
    assert.match(route + api, new RegExp(method));
  for (const forbidden of [
    'callQueueEntry',
    'completeQueueEntry',
    'reorderQueueEntry',
    'declareDoctorAbsence',
    'sendDoctorDelay',
  ])
    assert.doesNotMatch(route, new RegExp(forbidden));
  for (const producerless of ['requested', 'in_queue', 'in_consultation', 'completed', 'no_show'])
    assert.match(plan, new RegExp(`${producerless}[^\\n]{0,180}no Feature 009 producer`));
});

test('queue projection is private, own-only, and freshness-qualified', () => {
  assert.match(route, /getMyQueuePosition\(id\)/);
  assert.match(route, /own\.appointmentId === id/);
  assert.match(route, /accessibilityLiveRegion="polite"/);
  assert.match(route, /queue\.updatedAt/);
  assert.match(route, /queue\.stale/);
  assert.doesNotMatch(route, /patientId.*queue/);
  assert.doesNotMatch(route, /listQueue|getQueue\(/);
});

test('patient adapter executes appointment reads and mutations through generated routes with authoritative headers', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url.endsWith('/queue-position'))
      return response({
        appointmentId: appointment.id,
        state: 'waiting',
        queueNumber: 2,
        position: 2,
        estimatedServiceAt: '2030-01-07T10:00:00Z',
        queueVersion: 1,
        updatedAt: '2030-01-07T09:15:00Z',
        stale: false,
      });
    if (url.endsWith('/check-in'))
      return response({
        appointment: { ...appointment, status: 'checked_in' },
        queueEntry: {
          id: '93000000-0000-4000-8000-000000000001',
          appointmentId: appointment.id,
          facilityId: appointment.facilityId,
          doctorId: appointment.doctorId,
          civilDate: appointment.civilDate,
          queueNumber: 2,
          position: 2,
          state: 'waiting',
          version: 1,
        },
      });
    return response(appointment);
  };
  const api = new PatientClinicSchedulingApi({
    locale: 'en-EG',
    apiBaseUrl: 'https://synthetic.invalid',
    accessToken: 'synthetic-token',
    patientId: appointment.patientId,
    fetch: fetcher,
  });
  assert.deepEqual(await api.getMyAppointment(appointment.id), appointment);
  assert.equal((await api.getMyQueuePosition(appointment.id)).appointmentId, appointment.id);
  assert.equal(
    (await api.cancelMyAppointment(appointment.id, { reason: 'schedule changed' }, 7, 'cancel-key'))
      .status,
    'confirmed',
  );
  assert.equal(
    (
      await api.rescheduleMyAppointment(
        appointment.id,
        {
          startsAt: '2030-01-08T09:00:00Z',
          endsAt: '2030-01-08T09:30:00Z',
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-08',
          reason: 'schedule changed',
        },
        7,
        'reschedule-key',
      )
    ).id,
    appointment.id,
  );
  assert.equal(
    (await api.checkInMyAppointment(appointment.id, 7, 'checkin-key')).appointment.status,
    'checked_in',
  );
  const mutations = calls.filter(({ init }) => init.method === 'POST');
  assert.equal(mutations.length, 3);
  for (const { init } of mutations) {
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer synthetic-token');
    assert.equal(new Headers(init.headers).get('If-Match'), '"7"');
    assert.equal(new Headers(init.headers).get('Accept-Language'), 'en-EG');
  }
  assert.equal(JSON.parse(String(mutations[1].init.body)).reason, 'schedule changed');
});

test('cancel, reschedule, and check-in enforce current-state eligibility and safe confirmation', () => {
  assert.match(route, /appointment\.status === 'reschedule_required'/);
  assert.match(route, /appointment\?\.status === 'confirmed'/);
  assert.match(route, /Date\.parse\(appointment\.startsAt\) > Date\.now\(\)/);
  assert.match(route, /const canCheckIn = appointment\?\.status === 'confirmed'/);
  assert.match(route, /action !== 'check-in'\s*&&\s*\(!reason\.trim\(\)/);
  assert.match(route, /reason\.trim\(\)\.length > 500/);
  assert.match(route, /\[\\r\\n\\t\]\/\.test\(reason\)/);
  assert.match(route, /reasonFocus\.current\?\.focus\(\)/);
  assert.match(route, /civilDate: selected!\.civilDate,\s+reason: reason\.trim\(\)/);
  assert.match(route, /سبب إعادة الجدولة/);
  assert.match(route, /Rescheduling reason/);
  assert.match(route, /action === 'reschedule' && \(!selected/);
  assert.match(route, /clinic\.result\.noSlotHeld/);
  assert.match(route, /confirm === 'cancel'/);
  assert.match(route, /confirm === 'reschedule'/);
  assert.match(route, /confirm === 'check-in'/);
  // No ordinary edit is exposed after check-in or for terminal states.
  assert.match(route, /canEdit && !confirm/);
  assert.doesNotMatch(
    route,
    /status === '(checked_in|in_queue|in_consultation|completed|cancelled|no_show)'[^\n]*setConfirm/,
  );
});

test('uncertain, stale, offline, conflict, and result states keep recovery authoritative', () => {
  for (const marker of [
    "state === 'offline'",
    "state === 'stale'",
    "state === 'conflict'",
    "state === 'uncertain'",
    "state === 'error'",
    "state === 'success'",
    'onAction={() => void load()}',
    'pendingKey.current',
    'appointment.version',
    'resultFocus.current?.focus?.()',
  ])
    assert.ok(route.includes(marker), `missing route recovery marker: ${marker}`);
  assert.match(route, /code === 409 \|\| code === 412/);
  assert.match(route, /uncertain\(error\)/);
  assert.match(route, /OfflineNoQueueBanner/);
  assert.match(route, /setState\('offline'\)/);
  assert.match(route, /state === 'uncertain'.*Refresh/s);
});

test('Arabic/English direction, focus, reflow, contrast, targets, and reduced motion are structural', () => {
  assert.match(route, /locale === 'ar-EG' \? 'rtl' : 'ltr'/);
  assert.match(shell, /direction: locale === 'ar-EG' \? 'rtl' : 'ltr'/);
  for (const marker of [
    'accessibilityRole="button"',
    'accessibilityLabel',
    'accessibilityLiveRegion',
    'focusable',
    'focus',
    'minHeight: 48',
    'maxWidth: 720',
    'ScrollView',
  ])
    assert.match(route + shell, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')));
  assert.match(tokens, /minimumTargetSize\s*=\s*44/);
  assert.match(tokens, /reducedMotionMs:\s*0/);
  assert.match(tokens, /safetyCriticalMs:\s*0/);
  // Pixel identity, screen readers, 200%/400% reflow, and forced-colors remain
  // live/manual evidence requirements; this test intentionally creates no PNGs.
});
