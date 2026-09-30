/**
 * Pure Feature 010 encounter and signed-note decisions.
 *
 * Callers remain responsible for authorization, persistence, locking, and
 * validating reference ownership against the authoritative data store.
 */

export type EncounterPolicyFailureCode =
  | 'state-transition-invalid'
  | 'responsible-clinician-required'
  | 'version-required'
  | 'version-conflict'
  | 'summary-required'
  | 'structural-confirmation-required'
  | 'references-invalid'
  | 'encounter-not-open'
  | 'treating-authority-required'
  | 'signer-required'
  | 'visibility-invalid'
  | 'supersession-invalid'
  | 'supersession-signer-invalid';

type Failure = { readonly allowed: false; readonly code: EncounterPolicyFailureCode };

type ClinicalReferences = {
  readonly conditionIds?: readonly string[];
  readonly observationIds?: readonly string[];
  readonly orderIds?: readonly string[];
};

type ReferenceProjection = {
  readonly conditionIds: readonly string[];
  readonly observationIds: readonly string[];
  readonly orderIds: readonly string[];
};

function normalizeReferences(
  value: ClinicalReferences | undefined,
): { readonly valid: true; readonly references: ReferenceProjection } | { readonly valid: false } {
  const conditionIds = normalizeIds(value?.conditionIds);
  const observationIds = normalizeIds(value?.observationIds);
  const orderIds = normalizeIds(value?.orderIds);
  if (!conditionIds || !observationIds || !orderIds) return { valid: false };
  return { valid: true, references: { conditionIds, observationIds, orderIds } };
}

function normalizeIds(ids: readonly string[] | undefined): readonly string[] | undefined {
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.trim() === ''))
    return undefined;
  return [...new Set(ids)];
}

/** Evaluate the sole Feature 010 appointment/queue producer into consultation. */
export function evaluateEncounterOpening(input: {
  readonly appointmentState: string;
  readonly queueState?: string;
  readonly responsibleClinicianId: string;
}):
  | {
      readonly allowed: true;
      readonly code: 'allowed';
      readonly encounterState: 'open';
      readonly appointmentState: 'in_consultation';
      readonly queueState: 'in_service';
      readonly responsibleClinicianId: string;
      readonly activeResponsibleIntervals: 1;
    }
  | Failure {
  if (input.appointmentState !== 'checked_in' || input.queueState !== 'called')
    return { allowed: false, code: 'state-transition-invalid' };
  if (!isNonBlank(input.responsibleClinicianId))
    return { allowed: false, code: 'responsible-clinician-required' };
  return {
    allowed: true,
    code: 'allowed',
    encounterState: 'open',
    appointmentState: 'in_consultation',
    queueState: 'in_service',
    responsibleClinicianId: input.responsibleClinicianId,
    activeResponsibleIntervals: 1,
  };
}

/** Validate optional existing same-patient references while an encounter is open. */
export function evaluateEncounterReferences(
  input: { readonly encounterState: string } & ClinicalReferences,
): (ReferenceProjection & { readonly allowed: true; readonly code: 'allowed' }) | Failure {
  if (input.encounterState !== 'open') return { allowed: false, code: 'encounter-not-open' };
  const result = normalizeReferences(input);
  if (!result.valid) return { allowed: false, code: 'references-invalid' };
  return { allowed: true, code: 'allowed', ...result.references };
}

/** Evaluate the atomic encounter/appointment/queue completion decision. */
export function evaluateEncounterCompletion(
  input: {
    readonly encounterState: string;
    readonly appointmentState: string;
    readonly queueState: string;
    readonly actorPersonId: string;
    readonly responsibleClinicianId: string;
    readonly expectedVersion: number;
    readonly currentVersion: number;
    readonly summary: string;
    readonly structurallyConfirmed: boolean;
  } & ClinicalReferences,
):
  | (ReferenceProjection & {
      readonly allowed: true;
      readonly code: 'allowed';
      readonly encounterState: 'completed';
      readonly appointmentState: 'completed';
      readonly queueState: 'completed';
      readonly contextAccessEnded: true;
    })
  | Failure {
  if (
    input.encounterState !== 'open' ||
    input.appointmentState !== 'in_consultation' ||
    input.queueState !== 'in_service'
  ) {
    return { allowed: false, code: 'state-transition-invalid' };
  }
  if (
    !isNonBlank(input.responsibleClinicianId) ||
    input.actorPersonId !== input.responsibleClinicianId
  ) {
    return { allowed: false, code: 'responsible-clinician-required' };
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
    return { allowed: false, code: 'version-required' };
  if (input.currentVersion !== input.expectedVersion)
    return { allowed: false, code: 'version-conflict' };
  if (!isNonBlank(input.summary)) return { allowed: false, code: 'summary-required' };
  if (input.structurallyConfirmed !== true)
    return { allowed: false, code: 'structural-confirmation-required' };
  const result = normalizeReferences(input);
  if (!result.valid) return { allowed: false, code: 'references-invalid' };
  return {
    allowed: true,
    code: 'allowed',
    encounterState: 'completed',
    appointmentState: 'completed',
    queueState: 'completed',
    contextAccessEnded: true,
    ...result.references,
  };
}

/** Evaluate append-only signing and same-encounter signed-note supersession. */
export function evaluateNoteSigning(input: {
  readonly encounterId: string;
  readonly encounterState: string;
  readonly signerPersonId: string;
  readonly responsibleClinicianId?: string;
  readonly authorizedTreatingClinician: boolean;
  readonly visibility: string;
  readonly supersedes?: {
    readonly id: string;
    readonly encounterId: string;
    readonly authorPersonId: string;
    readonly visibility: string;
    readonly signed: boolean;
  };
}):
  | {
      readonly allowed: true;
      readonly code: 'allowed';
      readonly visibility: 'private' | 'patient_visible';
      readonly appendOnly: true;
      readonly priorVersionPreserved: boolean;
      readonly priorVisibility?: 'private' | 'patient_visible';
    }
  | Failure {
  if (input.encounterState !== 'open') return { allowed: false, code: 'encounter-not-open' };
  if (!input.authorizedTreatingClinician)
    return { allowed: false, code: 'treating-authority-required' };
  if (!isNonBlank(input.signerPersonId)) return { allowed: false, code: 'signer-required' };
  if (input.visibility !== 'private' && input.visibility !== 'patient_visible')
    return { allowed: false, code: 'visibility-invalid' };

  const prior = input.supersedes;
  if (prior) {
    if (
      !isNonBlank(prior.id) ||
      prior.encounterId !== input.encounterId ||
      !prior.signed ||
      (prior.visibility !== 'private' && prior.visibility !== 'patient_visible')
    ) {
      return { allowed: false, code: 'supersession-invalid' };
    }
    if (
      input.signerPersonId !== prior.authorPersonId &&
      input.signerPersonId !== input.responsibleClinicianId
    ) {
      return { allowed: false, code: 'supersession-signer-invalid' };
    }
    return {
      allowed: true,
      code: 'allowed',
      visibility: input.visibility,
      appendOnly: true,
      priorVersionPreserved: true,
      priorVisibility: prior.visibility,
    };
  }

  return {
    allowed: true,
    code: 'allowed',
    visibility: input.visibility,
    appendOnly: true,
    priorVersionPreserved: false,
  };
}

function isNonBlank(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
