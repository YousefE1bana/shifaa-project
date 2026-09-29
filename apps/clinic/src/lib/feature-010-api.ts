import {
  createClinicSchedulingClient,
  ClinicSchedulingApiError,
} from '@shifaa/api-client/clinic-scheduling';
import { createFeature010Client, Feature010ApiError } from '@shifaa/api-client/feature-010';

export type ClinicLocale = 'ar-EG' | 'en-EG';
export type EncounterStartClients = ReturnType<typeof createEncounterStartClients>;
type Appointment = Awaited<
  ReturnType<EncounterStartClients['scheduling']['listAppointments']>
>['items'][number];
type Queue = Awaited<ReturnType<EncounterStartClients['scheduling']['getQueue']>>;

export function createEncounterStartClients(accessToken: string, locale: ClinicLocale) {
  const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  if (!baseUrl) throw new Error('feature-010-api-unconfigured');
  return {
    scheduling: createClinicSchedulingClient({ baseUrl, accessToken, acceptLanguage: locale }),
    encounters: createFeature010Client({
      baseUrl,
      accessToken: () => accessToken,
      acceptLanguage: locale,
    }),
  };
}

export type EncounterStartEligibility =
  | { kind: 'eligible'; appointment: Appointment; queueEntry: Queue['entries'][number] }
  | { kind: 'missing' | 'stale' | 'denied' | 'recoverable' };

/** Current-patient appointment and matching called-queue reads fail closed. */
export async function getEncounterStartEligibility(
  clients: EncounterStartClients,
  patientId: string,
): Promise<EncounterStartEligibility> {
  const appointmentItems: Appointment[] = [];
  const appointmentCursors = new Set<string>();
  let appointmentCursor: string | undefined;
  let appointmentListComplete = false;
  try {
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const appointments = await clients.scheduling.listAppointments({
        patientId,
        status: 'checked_in',
        ...(appointmentCursor ? { cursor: appointmentCursor } : {}),
      });
      if (appointments.freshness !== 'fresh') return { kind: 'stale' };
      appointmentItems.push(...appointments.items);
      if (!appointments.nextCursor) {
        appointmentListComplete = true;
        break;
      }
      if (appointmentCursors.has(appointments.nextCursor)) return { kind: 'recoverable' };
      appointmentCursors.add(appointments.nextCursor);
      appointmentCursor = appointments.nextCursor;
    }
  } catch (error) {
    return readFailure(error);
  }
  if (!appointmentListComplete) return { kind: 'recoverable' };
  const scoped = appointmentItems.filter(
    (appointment) => appointment.patientId === patientId && appointment.status === 'checked_in',
  );
  if (!scoped.length) return { kind: 'missing' };

  const called: Array<{ appointment: Appointment; queueEntry: Queue['entries'][number] }> = [];
  for (const appointment of scoped) {
    const queueResult = await findQueueEntry(clients, appointment);
    if (queueResult.kind !== 'found') {
      if (queueResult.kind === 'stale') return { kind: 'stale' };
      if (queueResult.kind === 'denied') return { kind: 'denied' };
      if (queueResult.kind === 'recoverable') return { kind: 'recoverable' };
      continue;
    }
    if (queueResult.queueEntry.state === 'called')
      called.push({ appointment, queueEntry: queueResult.queueEntry });
  }
  if (called.length !== 1) return { kind: 'missing' };
  return { kind: 'eligible', ...called[0]! };
}

async function findQueueEntry(
  clients: EncounterStartClients,
  appointment: Appointment,
): Promise<
  | { kind: 'found'; queueEntry: Queue['entries'][number] }
  | { kind: 'missing' | 'stale' | 'denied' | 'recoverable' }
> {
  const seen = new Set<string>();
  let cursor: string | undefined;
  try {
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const page = await clients.scheduling.getQueue(appointment.facilityId, {
        doctorId: appointment.doctorId,
        date: appointment.civilDate,
        ...(cursor ? { cursor } : {}),
      });
      if (
        page.facilityId !== appointment.facilityId ||
        page.doctorId !== appointment.doctorId ||
        page.civilDate !== appointment.civilDate
      )
        return { kind: 'recoverable' };
      if (page.freshness !== 'fresh') return { kind: 'stale' };
      const queueEntry = page.entries.find((entry) => entry.appointmentId === appointment.id);
      if (queueEntry) {
        if (
          queueEntry.facilityId !== appointment.facilityId ||
          queueEntry.doctorId !== appointment.doctorId ||
          queueEntry.civilDate !== appointment.civilDate
        )
          return { kind: 'recoverable' };
        return { kind: 'found', queueEntry };
      }
      if (!page.nextCursor) return { kind: 'missing' };
      if (seen.has(page.nextCursor)) return { kind: 'recoverable' };
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  } catch (error) {
    return readFailure(error);
  }
  return { kind: 'recoverable' };
}

function readFailure(error: unknown): { kind: 'denied' | 'recoverable' } {
  if (
    (error instanceof ClinicSchedulingApiError || error instanceof Feature010ApiError) &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  )
    return { kind: 'denied' };
  return { kind: 'recoverable' };
}

export function encounterStartFailure(error: unknown): 'denied' | 'conflict' | 'recoverable' {
  if (error instanceof Feature010ApiError) {
    if (error.status === 401 || error.status === 403 || error.status === 404) return 'denied';
    if (error.status === 409 || error.status === 412) return 'conflict';
  }
  return 'recoverable';
}
