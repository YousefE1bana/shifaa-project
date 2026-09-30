import { Feature010ApiError, Feature010Client } from '@shifaa/api-client/feature-010';
import type {
  PendingSubjectReferralProjection,
  BookedAppointment,
  ReferralAcceptanceResult,
  ReferralPage,
  TargetSlot,
  AcceptedSubjectReferralProjection,
  AcceptReferralRequest,
} from '@shifaa/contracts';

export type PatientReferralActorRole = 'PAT' | 'GUA' | 'DEL';
export type EncounterTypeChoice = 'include' | 'exclude' | null;
export type PatientReferralReadState =
  | 'idle'
  | 'loading'
  | 'pending'
  | 'empty'
  | 'denied'
  | 'offline'
  | 'stale'
  | 'error';
export interface PatientPendingReferralPage {
  data: PendingSubjectReferralProjection[];
  meta: ReferralPage['meta'];
}

export interface PatientFeature010ReferralApiOptions {
  locale: 'ar-EG' | 'en-EG';
  actorRole: PatientReferralActorRole;
  patientId: string;
  accessToken: string | (() => string | undefined);
  apiBaseUrl?: string;
  fetch?: typeof globalThis.fetch;
  isOnline?: () => boolean;
}

export interface PatientReferralActingContext {
  actorRole: PatientReferralActorRole;
  patientId: string;
}

export function referralDisclosureFields(
  choice: EncounterTypeChoice,
): AcceptReferralRequest['authorizedFieldCodes'] {
  if (choice === null) throw new Error('An explicit encounter type choice is required.');
  return choice === 'include' ? ['reason_summary', 'encounter_type'] : ['reason_summary'];
}

function isOnline(options: PatientFeature010ReferralApiOptions): boolean {
  return options.isOnline?.() ?? (typeof navigator === 'undefined' || navigator.onLine !== false);
}

function makeIdempotencyKey(): string {
  return `patient-ui-010-referral-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function projectPendingReferral(
  referral: PendingSubjectReferralProjection,
): PendingSubjectReferralProjection {
  return {
    id: referral.id,
    sourceEncounterId: referral.sourceEncounterId,
    status: 'pending',
    version: referral.version,
    targetSpecialty: referral.targetSpecialty,
    ...(referral.targetFacilityId ? { targetFacilityId: referral.targetFacilityId } : {}),
    ...(referral.targetDoctorId ? { targetDoctorId: referral.targetDoctorId } : {}),
    reasonSummary: referral.reasonSummary,
    ...(referral.encounterType !== undefined ? { encounterType: referral.encounterType } : {}),
  };
}

function projectAcceptedReferral(
  referral: AcceptedSubjectReferralProjection,
): AcceptedSubjectReferralProjection {
  const includeEncounterType = referral.acceptedFieldCodes.length === 2;
  return {
    id: referral.id,
    sourceEncounterId: referral.sourceEncounterId,
    status: 'accepted',
    version: referral.version,
    targetSpecialty: referral.targetSpecialty,
    ...(referral.targetFacilityId ? { targetFacilityId: referral.targetFacilityId } : {}),
    ...(referral.targetDoctorId ? { targetDoctorId: referral.targetDoctorId } : {}),
    reasonSummary: referral.reasonSummary,
    ...(includeEncounterType && referral.encounterType !== undefined
      ? { encounterType: referral.encounterType }
      : {}),
    acceptedFieldCodes: referralDisclosureFields(includeEncounterType ? 'include' : 'exclude'),
    resultingAppointmentId: referral.resultingAppointmentId,
  };
}

function projectBookedAppointment(appointment: BookedAppointment): BookedAppointment {
  return {
    id: appointment.id,
    sourceReferralId: appointment.sourceReferralId,
    status: 'confirmed',
    facilityId: appointment.facilityId,
    doctorId: appointment.doctorId,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    feeMinorUnits: appointment.feeMinorUnits,
    currency: 'EGP',
    paymentMethod: 'cash_on_arrival',
    version: appointment.version,
  };
}

/**
 * Referral subject reads and acceptance are always server-authorized. actorRole is
 * display context only; it is never sent as an authorization claim or used to
 * infer a grant.
 */
export class PatientFeature010ReferralApi {
  public currentReferrals: PendingSubjectReferralProjection[] = [];
  public readState: PatientReferralReadState = 'idle';
  public readonly actingContext: PatientReferralActingContext;
  private readonly options: PatientFeature010ReferralApiOptions;
  private readonly client: Feature010Client;
  private requestGeneration = 0;
  private pendingAccept: { signature: string; key: string } | null = null;

  public constructor(options: PatientFeature010ReferralApiOptions) {
    this.options = options;
    this.actingContext = { actorRole: options.actorRole, patientId: options.patientId };
    this.client = new Feature010Client({
      baseUrl:
        options.apiBaseUrl ??
        (typeof location === 'undefined' ? 'http://127.0.0.1:3000' : location.origin),
      accessToken: () =>
        typeof options.accessToken === 'function' ? options.accessToken() : options.accessToken,
      acceptLanguage: options.locale,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  public async listPendingReferrals(signal?: AbortSignal): Promise<PatientPendingReferralPage> {
    this.clearProtectedState();
    const generation = ++this.requestGeneration;
    if (!isOnline(this.options)) {
      this.readState = 'offline';
      throw new Error('offline-referrals-unavailable');
    }
    if (!this.readToken() || !this.actingContext.patientId) {
      this.readState = 'denied';
      throw new Error('referral-authority-unavailable');
    }
    this.readState = 'loading';
    try {
      const page = await this.client.listReferrals(
        { patientId: this.actingContext.patientId, status: 'pending', limit: 100 },
        signal ? { signal } : {},
      );
      if (signal?.aborted || generation !== this.requestGeneration)
        throw new DOMException('Referral read was superseded.', 'AbortError');
      if (page.meta.stale || !Number.isFinite(Date.parse(page.meta.lastUpdatedAt))) {
        this.readState = 'stale';
        throw new Error('stale-referral-projection');
      }
      const pending = page.data
        .filter((value): value is PendingSubjectReferralProjection => value.status === 'pending')
        .map(projectPendingReferral);
      this.currentReferrals = pending;
      this.readState = pending.length ? 'pending' : 'empty';
      return {
        data: pending,
        meta: {
          nextCursor: page.meta.nextCursor,
          lastUpdatedAt: page.meta.lastUpdatedAt,
          stale: false,
        },
      };
    } catch (error) {
      if (signal?.aborted || generation !== this.requestGeneration) throw error;
      this.clearProtectedState();
      if (this.readState === 'stale') throw error;
      this.readState =
        error instanceof TypeError
          ? 'offline'
          : error instanceof Feature010ApiError && (error.status === 401 || error.status === 403)
            ? 'denied'
            : error instanceof Feature010ApiError && error.status >= 500
              ? 'stale'
              : 'error';
      throw error;
    }
  }

  public async acceptReferral(
    referral: PendingSubjectReferralProjection,
    authorizeReasonSummary: boolean,
    encounterTypeChoice: EncounterTypeChoice,
    targetSlot: TargetSlot,
  ): Promise<ReferralAcceptanceResult> {
    if (!authorizeReasonSummary)
      throw new Error('Reason summary disclosure must be explicitly authorized.');
    const authorizedFieldCodes = referralDisclosureFields(encounterTypeChoice);
    if (!referral.reasonSummary.trim()) throw new Error('A non-empty referral reason is required.');
    if (
      referral.status !== 'pending' ||
      !Number.isInteger(referral.version) ||
      referral.version < 1
    )
      throw new Error('A current pending referral version is required.');
    if (
      !this.currentReferrals.some(
        (current) => current.id === referral.id && current.version === referral.version,
      )
    )
      throw new Error('Read current referral authority before acceptance.');
    if (!isOnline(this.options)) {
      this.readState = 'offline';
      throw new Error('offline-referral-acceptance-blocked');
    }
    if (!this.readToken() || !this.actingContext.patientId) {
      this.clearProtectedState();
      this.readState = 'denied';
      throw new Error('referral-authority-unavailable');
    }
    const request = { authorizedFieldCodes, targetSlot };
    const signature = JSON.stringify({
      referralId: referral.id,
      version: referral.version,
      request,
    });
    if (this.pendingAccept && this.pendingAccept.signature !== signature)
      throw new Error('Resolve the previous referral acceptance before changing the selection.');
    if (!this.pendingAccept) this.pendingAccept = { signature, key: makeIdempotencyKey() };
    try {
      const result = await this.client.acceptReferral(referral.id, request, {
        version: referral.version,
        idempotencyKey: this.pendingAccept.key,
      });
      if (
        result.referral.status !== 'accepted' ||
        result.referral.id !== referral.id ||
        result.referral.version <= referral.version ||
        result.referral.sourceEncounterId !== referral.sourceEncounterId ||
        result.referral.targetSpecialty !== referral.targetSpecialty ||
        result.referral.reasonSummary !== referral.reasonSummary ||
        (referral.targetFacilityId !== undefined &&
          result.referral.targetFacilityId !== referral.targetFacilityId) ||
        (referral.targetDoctorId !== undefined &&
          result.referral.targetDoctorId !== referral.targetDoctorId) ||
        result.referral.resultingAppointmentId !== result.appointment.id ||
        result.appointment.sourceReferralId !== referral.id ||
        result.appointment.status !== 'confirmed' ||
        result.appointment.currency !== 'EGP' ||
        result.appointment.paymentMethod !== 'cash_on_arrival' ||
        !Number.isInteger(result.appointment.feeMinorUnits) ||
        result.appointment.feeMinorUnits < 0 ||
        result.appointment.facilityId !== targetSlot.facilityId ||
        result.appointment.doctorId !== targetSlot.doctorId ||
        result.appointment.startsAt !== targetSlot.startsAt ||
        result.appointment.endsAt !== targetSlot.endsAt ||
        JSON.stringify(result.referral.acceptedFieldCodes) !== JSON.stringify(authorizedFieldCodes)
      ) {
        this.clearProtectedState();
        throw new Error('Referral acceptance result did not match the selected booking.');
      }
      const projected: ReferralAcceptanceResult = {
        referral: projectAcceptedReferral(result.referral),
        appointment: projectBookedAppointment(result.appointment),
      };
      this.pendingAccept = null;
      this.currentReferrals = this.currentReferrals.filter((item) => item.id !== referral.id);
      this.readState = 'empty';
      return projected;
    } catch (error) {
      if (error instanceof Feature010ApiError && (error.status === 401 || error.status === 403)) {
        this.clearProtectedState();
        this.pendingAccept = null;
        this.readState = 'denied';
      } else if (
        error instanceof Feature010ApiError &&
        (error.status === 409 || error.status === 412)
      ) {
        this.clearProtectedState();
        this.pendingAccept = null;
      } else if (
        !(error instanceof TypeError) &&
        !(
          error instanceof Feature010ApiError &&
          (error.status === 408 || error.status === 429 || error.status >= 500)
        )
      ) {
        this.pendingAccept = null;
      }
      throw error;
    }
  }

  public markOffline(): void {
    this.requestGeneration += 1;
    this.clearProtectedState();
    this.readState = 'offline';
  }

  private readToken(): string | undefined {
    return typeof this.options.accessToken === 'function'
      ? this.options.accessToken()
      : this.options.accessToken;
  }

  public clearProtectedState(): void {
    this.currentReferrals = [];
  }
}

export { referralRecordsCopy } from '@shifaa/i18n';
