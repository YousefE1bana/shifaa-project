import type {
  Appointment,
  AvailabilityPage,
  DoctorSearchPage,
  ReadFreshness,
} from '@shifaa/contracts';

export type ClinicSchedulingReadStatus =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'stale'
  | 'unknown'
  | 'offline'
  | 'error';

type ReadDataState<T> = {
  status: Exclude<ClinicSchedulingReadStatus, 'loading' | 'offline' | 'error'>;
  data: T;
  freshness: ReadFreshness;
};

type ReadUnavailableState =
  | { status: 'loading' }
  | { status: 'offline'; error: unknown }
  | { status: 'error'; error: unknown };

export type DiscoveryViewState = ReadDataState<DoctorSearchPage> | ReadUnavailableState;

export type AvailabilityViewState = ReadDataState<AvailabilityPage> | ReadUnavailableState;

export type BookingViewState =
  | { status: 'success'; data: Appointment }
  | { status: 'conflict'; error: unknown }
  | { status: 'uncertain'; error: unknown }
  | { status: 'offline'; error: unknown }
  | { status: 'error'; error: unknown };

export const discoveryLoadingState = (): DiscoveryViewState => ({ status: 'loading' });
export const availabilityLoadingState = (): AvailabilityViewState => ({ status: 'loading' });

export function readFailureState(error: unknown): ReadUnavailableState {
  return error instanceof Error && error.message === 'offline-no-queue'
    ? { status: 'offline', error }
    : { status: 'error', error };
}

function readStatus(
  freshness: ReadFreshness,
  itemCount: number,
): Exclude<ClinicSchedulingReadStatus, 'loading' | 'offline' | 'error'> {
  if (freshness === 'stale') return 'stale';
  if (freshness === 'unknown') return 'unknown';
  return itemCount === 0 ? 'empty' : 'ready';
}

/** Reconcile discovery only from the API response; no local availability is inferred. */
export function reconcileDiscovery(page: DoctorSearchPage): DiscoveryViewState {
  return {
    status: readStatus(page.freshness, page.items.length),
    data: page,
    freshness: page.freshness,
  };
}

/** Reconcile slots only from the API response; a stale/unknown page is never confirmed. */
export function reconcileAvailability(page: AvailabilityPage): AvailabilityViewState {
  return {
    status: readStatus(page.freshness, page.items.length),
    data: page,
    freshness: page.freshness,
  };
}

/** Reject any response that would claim a non-MVP currency or payment method. */
export function reconcileBooking(appointment: Appointment): BookingViewState {
  if (appointment.currency !== 'EGP' || appointment.paymentMethod !== 'cash_on_arrival') {
    return { status: 'error', error: new Error('booking-response-invalid') };
  }
  return { status: 'success', data: appointment };
}

export function bookingFailureState(error: unknown): BookingViewState {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 409) return { status: 'conflict', error };
    if (status === 401 || status === 403) return { status: 'error', error };
  }
  if (error instanceof Error && error.message === 'offline-no-queue') {
    return { status: 'offline', error };
  }
  if (error instanceof TypeError) return { status: 'uncertain', error };
  return { status: 'error', error };
}

// Explicit aliases keep route code descriptive without duplicating reconciliation logic.
export const reconcileDoctorSearch = reconcileDiscovery;
export const reconcileDoctorAvailability = reconcileAvailability;
