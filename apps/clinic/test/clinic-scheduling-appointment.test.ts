import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ClinicSchedulingApiError } from '@shifaa/api-client/clinic-scheduling';
import { schedulingFailure } from '../src/lib/clinic-scheduling-api.ts';

const route = fs.readFileSync(
  new URL('../src/app/appointments/[id]/page.tsx', import.meta.url),
  'utf8',
);
const api = fs.readFileSync(
  new URL('../src/lib/clinic-scheduling-api.ts', import.meta.url),
  'utf8',
);
const tokens = fs.readFileSync(
  new URL('../../../packages/design-system/src/tokens.ts', import.meta.url),
  'utf8',
);

test('clinic adapter classifies generated-client failures for observable route recovery', () => {
  assert.equal(schedulingFailure(new ClinicSchedulingApiError(401, {})), 'denied');
  assert.equal(schedulingFailure(new ClinicSchedulingApiError(403, {})), 'denied');
  assert.equal(schedulingFailure(new ClinicSchedulingApiError(404, {})), 'missing');
  assert.equal(schedulingFailure(new ClinicSchedulingApiError(409, {})), 'conflict');
  assert.equal(schedulingFailure(new ClinicSchedulingApiError(412, {})), 'conflict');
  assert.equal(schedulingFailure(new ClinicSchedulingApiError(503, {})), 'recoverable');
});

test('clinic appointment projection exposes every canonical state with read-only terminal actions', () => {
  for (const state of [
    'requested',
    'confirmed',
    'checked_in',
    'in_queue',
    'in_consultation',
    'completed',
    'cancelled',
    'no_show',
    'reschedule_required',
  ])
    assert.match(route, new RegExp(`\\b${state}\\b`));
  assert.match(route, /statusLabels: Record/);
  assert.match(route, /canChange/);
  assert.match(route, /canCheckIn = appointment\?\.status === 'confirmed'/);
  assert.match(route, /!canCancel && !canReschedule && !canCheckIn/);
  for (const method of [
    'getAppointment',
    'cancelAppointment',
    'rescheduleAppointment',
    'checkInAppointment',
  ])
    assert.match(api + route, new RegExp(method));
  assert.doesNotMatch(
    route,
    /callQueueEntry|completeQueueEntry|reorderQueueEntry|declareDoctorAbsence/,
  );
});

test('clinic actions require confirmation, current version, server-selected replacement, and no offline write', () => {
  assert.match(route, /role="dialog"/);
  assert.match(route, /aria-modal="true"/);
  assert.match(route, /pending === 'cancel'/);
  assert.match(route, /setPending\('reschedule'\)/);
  assert.match(route, /reason\.trim\(\)/);
  assert.match(route, /appointment\.version/);
  assert.match(route, /slotPage\?\.freshness !== 'fresh'/);
  assert.match(route, /selectedSlot\.facilityId !== appointment\.facilityId/);
  assert.match(route, /selectedSlot\.doctorId !== appointment\.doctorId/);
  assert.match(route, /startsAt: selectedSlot!\.startsAt/);
  assert.match(route, /endsAt: selectedSlot!\.endsAt/);
  assert.match(route, /timezone: selectedSlot!\.timezone/);
  assert.match(route, /civilDate: selectedSlot!\.civilDate/);
  assert.match(route, /if \(!client \|\| !appointment \|\| !available\) return/);
  assert.match(route, /rescheduleReason: 'سبب إعادة الجدولة'/);
  assert.match(route, /rescheduleReason: 'Rescheduling reason'/);
  assert.match(route, /reason\.trim\(\)\.length > 500/);
  assert.match(route, /\[\\r\\n\\t\]\/\.test\(reason\)/);
  assert.match(route, /reasonInput\.current\?\.focus\(\)/);
  assert.match(route, /civilDate: selectedSlot!\.civilDate,\s+reason: reason\.trim\(\)/);
  assert.doesNotMatch(route, /queueOffline|offlineQueue|enqueue.*mutation/);
});

test('conflicts refresh authoritative appointment and all failure/result states restore focus', () => {
  assert.match(route, /schedulingFailure\(error\)/);
  assert.match(route, /kind === 'conflict'/);
  assert.match(route, /await client\.getAppointment\(id\)/);
  assert.match(route, /summary\.current\?\.focus\(\)/);
  for (const failure of ['denied', 'missing', 'conflict', 'recoverable'])
    assert.match(api, new RegExp(`'${failure}'`));
  for (const marker of [
    'setResult({',
    'reference: updated.id',
    'observedAt:',
    'aria-live="polite"',
  ])
    assert.ok(route.includes(marker), `missing authoritative result marker: ${marker}`);
});

test('clinic appointment is Arabic-first with English parity, reflow, contrast, targets, and reduced motion', () => {
  assert.match(route, /locale === 'ar-EG' \? 'rtl' : 'ltr'/);
  assert.match(route, /lang=\{locale\}/);
  assert.match(route, /locale === 'ar-EG' \? 'ar' : 'en'/);
  assert.match(route, /maxWidth: 1100/);
  assert.match(route, /flexWrap: 'wrap'/);
  assert.match(route, /color\.canvas/);
  assert.match(route, /color\.ink/);
  assert.match(route, /minimumTargetSize/);
  assert.match(route, /<bdi dir="ltr">/);
  assert.match(route, /Escape/);
  assert.ok(route.includes("event.key !== 'Tab'"));
  assert.match(tokens, /minimumTargetSize\s*=\s*44/);
  assert.match(tokens, /reducedMotionMs:\s*0/);
  assert.match(tokens, /safetyCriticalMs:\s*0/);
  // Browser viewport, screen-reader, forced-colors, and 200%/400% reflow are
  // live/manual evidence requirements; no PNGs are produced by this suite.
});
