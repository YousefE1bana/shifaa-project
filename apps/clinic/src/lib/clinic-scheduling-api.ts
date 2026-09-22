import {
  createClinicSchedulingClient,
  ClinicSchedulingApiError,
} from '@shifaa/api-client/clinic-scheduling';

export { ClinicSchedulingApiError };

/** The generated client is the sole transport boundary for this clinic route. */
export function clinicSchedulingApi(accessToken: string, locale: 'ar-EG' | 'en-EG') {
  const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  if (!baseUrl) throw new Error('clinic-scheduling-api-unconfigured');
  return createClinicSchedulingClient({
    baseUrl,
    accessToken,
    acceptLanguage: locale,
  });
}

type Client = ReturnType<typeof clinicSchedulingApi>;
type Appointment = Awaited<ReturnType<Client['getAppointment']>>;
type QueueEntry = Awaited<ReturnType<Client['getQueue']>>['entries'][number];

/** Return only the requested appointment's staff-authorized queue projection. */
export async function appointmentQueueProjection(
  client: Client,
  appointment: Appointment,
): Promise<
  | {
      kind: 'found';
      entry: Pick<QueueEntry, 'state' | 'queueNumber' | 'position' | 'estimatedServiceAt'>;
      stale: boolean;
    }
  | { kind: 'empty' | 'unavailable' | 'denied' }
> {
  const date = appointment.civilDate;
  const seen = new Set<string>();
  let cursor: string | undefined;
  try {
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const page = await client.getQueue(appointment.facilityId, {
        doctorId: appointment.doctorId,
        date,
        ...(cursor ? { cursor } : {}),
      });
      if (
        page.facilityId !== appointment.facilityId ||
        page.doctorId !== appointment.doctorId ||
        page.civilDate !== date
      )
        return { kind: 'unavailable' };
      const entry = page.entries.find((item) => item.appointmentId === appointment.id);
      if (entry) {
        if (
          entry.facilityId !== appointment.facilityId ||
          entry.doctorId !== appointment.doctorId ||
          entry.civilDate !== date
        )
          return { kind: 'unavailable' };
        return {
          kind: 'found',
          entry: {
            state: entry.state,
            queueNumber: entry.queueNumber,
            position: entry.position,
            estimatedServiceAt: entry.estimatedServiceAt,
          },
          stale: page.freshness !== 'fresh',
        };
      }
      if (!page.nextCursor) return { kind: 'empty' };
      if (seen.has(page.nextCursor)) return { kind: 'unavailable' };
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  } catch (error) {
    if (schedulingFailure(error) === 'denied') return { kind: 'denied' };
    return { kind: 'unavailable' };
  }
  return { kind: 'unavailable' };
}

export function schedulingFailure(
  error: unknown,
): 'denied' | 'missing' | 'conflict' | 'recoverable' {
  if (error instanceof ClinicSchedulingApiError) {
    if (error.status === 401 || error.status === 403) return 'denied';
    if (error.status === 404) return 'missing';
    if (error.status === 409 || error.status === 412) return 'conflict';
  }
  return 'recoverable';
}
