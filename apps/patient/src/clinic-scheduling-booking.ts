import type { Appointment, AvailabilityPage, Slot } from '@shifaa/contracts';
import { clinicSchedulingArEG, clinicSchedulingEnEG, type Locale } from '@shifaa/i18n';

export function validateBookingSelection(
  page: AvailabilityPage,
  selected: Slot,
  priorFeeMinorUnits?: number,
): 'ready' | 'stale' | 'conflict' | 'invalid' {
  if (
    page.currency !== 'EGP' ||
    page.paymentMethod !== 'cash_on_arrival' ||
    !Number.isInteger(page.feeMinorUnits) ||
    page.feeMinorUnits < 0
  )
    return 'invalid';
  if (page.freshness !== 'fresh') return 'stale';
  if (priorFeeMinorUnits !== undefined && page.feeMinorUnits !== priorFeeMinorUnits)
    return 'conflict';
  return page.items.some(
    (slot) =>
      slot.facilityId === selected.facilityId &&
      slot.doctorId === selected.doctorId &&
      slot.startsAt === selected.startsAt &&
      slot.endsAt === selected.endsAt &&
      slot.civilDate === selected.civilDate &&
      slot.timezone === selected.timezone,
  )
    ? 'ready'
    : 'conflict';
}

export function isUncertainBookingError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && (status === 408 || status === 429 || status >= 500);
}

export class BookingAttemptGate {
  private busy = false;
  public enter(): boolean {
    if (this.busy) return false;
    this.busy = true;
    return true;
  }
  public leave(): void {
    this.busy = false;
  }
}

export function preservesUncertainBooking(
  previousSelection: string,
  currentSelection: string,
  uncertain: boolean,
): boolean {
  return uncertain && previousSelection === currentSelection;
}

export function bookingSuccessSnapshot(appointment: Appointment, locale: Locale) {
  const copy = locale === 'ar-EG' ? clinicSchedulingArEG : clinicSchedulingEnEG;
  return {
    fee: `${copy['clinic.discover.fee']}: ${appointment.feeMinorUnits / 100} ${appointment.currency}`,
    payment: copy['clinic.payment.cashInstruction'],
    nextStep: copy['clinic.book.nextStep'],
  };
}

export function bookingResultMatchesSelection(
  appointment: Appointment,
  selected: Slot,
  patientId: string,
): boolean {
  return (
    appointment.patientId === patientId &&
    appointment.facilityId === selected.facilityId &&
    appointment.doctorId === selected.doctorId &&
    appointment.startsAt === selected.startsAt &&
    appointment.endsAt === selected.endsAt &&
    appointment.civilDate === selected.civilDate &&
    appointment.timezone === selected.timezone &&
    appointment.status === 'confirmed' &&
    appointment.currency === 'EGP' &&
    appointment.paymentMethod === 'cash_on_arrival' &&
    Number.isInteger(appointment.feeMinorUnits) &&
    appointment.feeMinorUnits >= 0
  );
}
