import type {
  ConsentDecision,
  ConsentRecord,
  IdentityType,
  VerificationCaseState,
  VerificationState,
} from './types.js';

export class DomainPolicyError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainPolicyError';
  }
}

const transitions: Readonly<Record<VerificationState, readonly VerificationState[]>> = {
  pending: ['verified', 'manual_review', 'failed', 'expired'],
  manual_review: ['verified', 'rejected'],
  verified: [],
  rejected: [],
  failed: [],
  expired: [],
};

export function transitionVerification(
  current: VerificationCaseState,
  next: VerificationState,
  expectedVersion: number,
  reasonCode?: string,
): VerificationCaseState {
  if (current.version !== expectedVersion) {
    throw new DomainPolicyError('version-conflict', 'Verification case version is stale.');
  }
  if (!transitions[current.state].includes(next)) {
    throw new DomainPolicyError(
      'state-transition-invalid',
      `Verification cannot transition from ${current.state} to ${next}.`,
    );
  }
  if (current.state === 'manual_review' && !reasonCode?.trim()) {
    throw new DomainPolicyError('review-reason-required', 'A reviewer decision requires a reason.');
  }
  return {
    id: current.id,
    state: next,
    version: current.version + 1,
    ...(reasonCode ? { reasonCode } : {}),
  };
}

export function appendConsentDecision(input: {
  id: string;
  personId: string;
  purposeCode: string;
  purposeVersion: string;
  noticeVersion: string;
  decision: Exclude<ConsentDecision, 'withdrawn'>;
  occurredAt: string;
}): ConsentRecord {
  if (!input.purposeCode || !input.purposeVersion || !input.noticeVersion) {
    throw new DomainPolicyError(
      'processing-purpose-disabled',
      'An active purpose and notice version are required.',
    );
  }
  return { ...input, version: 1 };
}

export function withdrawConsent(input: {
  id: string;
  current: ConsentRecord;
  occurredAt: string;
}): ConsentRecord {
  if (input.current.decision !== 'granted') {
    throw new DomainPolicyError(
      'consent-not-withdrawable',
      'Only a granted consent can be withdrawn.',
    );
  }
  return {
    ...input.current,
    id: input.id,
    decision: 'withdrawn',
    occurredAt: input.occurredAt,
    supersedesId: input.current.id,
    version: input.current.version + 1,
  };
}

export function maskIdentity(type: IdentityType, value: string): string {
  const visible = type === 'egyptian_national_id' ? 4 : 3;
  const tail = value.slice(-visible);
  return `${'•'.repeat(Math.max(4, value.length - visible))}${tail}`;
}

export function assertLoginHandle(handle: string): void {
  const normalized = handle.replace(/\s/g, '');
  if (/^\d{14}$/.test(normalized)) {
    throw new DomainPolicyError(
      'validation-failed',
      'A government identifier cannot be used as a login handle.',
    );
  }
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(handle);
  const isPhone = /^\+[1-9]\d{7,14}$/.test(handle);
  if (!isEmail && !isPhone) {
    throw new DomainPolicyError(
      'validation-failed',
      'Use a valid email address or E.164 phone number.',
    );
  }
}
