import { readFeature010SessionAal } from './feature-010-session.ts';
import { Feature010ApiError, createFeature010Client } from '@shifaa/api-client/feature-010';
import type { Feature010Client } from '@shifaa/api-client/feature-010';

type Encounter = Awaited<ReturnType<Feature010Client['getEncounter']>>;
type EncounterId = Parameters<Feature010Client['getEncounter']>[0];

export type PatientEncounterReadState =
  | 'idle'
  | 'loading'
  | 'empty'
  | 'visible'
  | 'completed'
  | 'denied'
  | 'offline'
  | 'stale'
  | 'error';

export interface PatientFeature010EncounterApiOptions {
  locale: 'ar-EG' | 'en-EG';
  accessToken: string | (() => string | undefined);
  apiBaseUrl?: string;
  fetch?: typeof globalThis.fetch;
  isOnline?: () => boolean;
}

/** Select only fields that the patient/representative subject projection may display. */
export function projectPatientEncounter(value: Encounter): Encounter {
  const source = value;
  return {
    id: source.id,
    patientId: source.patientId,
    facilityId: source.facilityId,
    appointmentId: source.appointmentId,
    encounterType: source.encounterType,
    responsibleClinicianId: source.responsibleClinicianId,
    status: source.status,
    startedAt: source.startedAt,
    ...(source.endedAt ? { endedAt: source.endedAt } : {}),
    ...(source.completionSummary !== undefined
      ? { completionSummary: source.completionSummary }
      : {}),
    version: source.version,
    ...(source.notes
      ? {
          notes: source.notes
            .filter((note) => note.visibility === 'patient_visible')
            .map((note) => ({
              id: note.id,
              encounterId: note.encounterId,
              authorId: note.authorId,
              noteType: note.noteType,
              visibility: 'patient_visible' as const,
              signedAt: note.signedAt,
              body: note.body,
            })),
        }
      : {}),
  };
}

export class PatientFeature010EncounterApi {
  public currentEncounter: Encounter | null = null;
  public readState: PatientEncounterReadState = 'idle';
  private readonly client;

  public constructor(private readonly options: PatientFeature010EncounterApiOptions) {
    this.client = createFeature010Client({
      baseUrl:
        options.apiBaseUrl ??
        (typeof location === 'undefined' ? 'http://127.0.0.1:3000' : location.origin),
      accessToken: () =>
        typeof options.accessToken === 'function' ? options.accessToken() : options.accessToken,
      acceptLanguage: options.locale,
      purpose: 'appointment.scheduling',
      sessionAal: () =>
        readFeature010SessionAal(
          typeof options.accessToken === 'function' ? options.accessToken() : options.accessToken,
        ),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  public async getEncounter(encounterId: EncounterId, signal?: AbortSignal): Promise<Encounter> {
    // Never retain clinical content across a refresh. Server authorization is live per request.
    this.currentEncounter = null;
    if (
      !(
        this.options.isOnline?.() ??
        (typeof navigator === 'undefined' || navigator.onLine !== false)
      )
    ) {
      this.readState = 'offline';
      throw new Error('offline-read-unavailable');
    }
    this.readState = 'loading';
    try {
      const response = await this.client.getEncounter(encounterId, {}, signal ? { signal } : {});
      if (signal?.aborted) throw new DOMException('Encounter read was superseded.', 'AbortError');
      const projection = projectPatientEncounter(response);
      if (signal?.aborted) throw new DOMException('Encounter read was superseded.', 'AbortError');
      this.currentEncounter = projection;
      this.readState = projection.status === 'completed' ? 'completed' : 'visible';
      return projection;
    } catch (error) {
      if (signal?.aborted) throw error;
      this.currentEncounter = null;
      this.readState =
        error instanceof TypeError
          ? 'offline'
          : error instanceof Feature010ApiError && (error.status === 401 || error.status === 403)
            ? 'denied'
            : error instanceof Feature010ApiError && error.status === 404
              ? 'empty'
              : error instanceof Feature010ApiError && error.status >= 500
                ? 'stale'
                : 'error';
      throw error;
    }
  }

  public markOffline(): void {
    this.currentEncounter = null;
    this.readState = 'offline';
  }
}

export { patientEncounterCopy } from '@shifaa/i18n';
