// Candidate for isolated engineering review. This module has no package export.
const contexts = {
  'W-M': { fields: ['structuredReason', 'justification', 'monitoringPlan'], lane: 'warning' },
  'W-NA': { fields: ['structuredReason', 'justification'], lane: 'warning' },
  N: {
    fields: ['rationale', 'alternativesConsidered', 'monitoringPlan', 'expiresAt'],
    lane: 'normal',
  },
  E: {
    fields: ['rationale', 'alternativesConsidered', 'monitoringPlan', 'expiresAt'],
    lane: 'emergency',
  },
} as const;

type Context = keyof typeof contexts;
const fixtureIds = ['SYNTHETIC_CASE_0001', 'SYNTHETIC_CASE_0002', 'SYNTHETIC_CASE_0003'] as const;
type FixtureId = (typeof fixtureIds)[number];

export type MechanismProbe = {
  // These are inputs to a pure fixture simulation, never an authorization carrier.
  origin: 'trusted-synthetic-fixture' | 'client' | 'research-match' | 'production';
  caseId: FixtureId;
  context: Context;
  evidence: {
    caseId: FixtureId;
    context: Context;
    fixtureSha256: string;
    scenarioVersion: 1;
    completeness: 'T0' | 'T1' | 'T2';
    state: 'current' | 'missing' | 'stale' | 'partial' | 'unavailable' | 'freshness-unknown';
    allergyHistory: 'declared-synthetic-zero' | 'query-empty' | 'missing';
    medicationHistory: 'declared-synthetic-zero' | 'query-empty' | 'missing';
  };
  fields: Readonly<Record<string, string | readonly string[]>>;
  authority: {
    prescriberPerson: string;
    currentAal2CareAndFacility: boolean;
    pharmacist: { decision: 'pending' | 'approved' | 'rejected'; person: string; current: boolean };
    secondPhysician: {
      decision: 'pending' | 'approved' | 'rejected';
      person: string;
      current: boolean;
    };
  };
  state: {
    separateSign: boolean;
    acknowledged: boolean;
    requestLive: boolean;
    pharmacistObligationPersisted: boolean;
    alreadySigned: boolean;
    nowSeconds: number;
    secondApprovalSeconds: number | null;
  };
};

function currentScenario(probe: MechanismProbe): boolean {
  const binding = probe.evidence;
  return (
    probe.origin === 'trusted-synthetic-fixture' &&
    fixtureIds.includes(probe.caseId) &&
    binding.caseId === probe.caseId &&
    binding.context === probe.context &&
    binding.scenarioVersion === 1 &&
    binding.fixtureSha256 === 'cff3d02db260e5b4d187ba16cf9f52af0afe60ee8d3129b09a538297032be1ae' &&
    binding.completeness === 'T2' &&
    binding.state === 'current' &&
    binding.allergyHistory === 'declared-synthetic-zero' &&
    binding.medicationHistory === 'declared-synthetic-zero'
  );
}

function independentReview(
  review: MechanismProbe['authority']['pharmacist'],
  otherPeople: readonly string[],
): boolean {
  return (
    review.decision === 'approved' &&
    review.current === true &&
    isSyntheticPerson(review.person) &&
    !otherPeople.includes(review.person)
  );
}

function isRecord<T>(value: T): value is T & Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        typeof key === 'string' && descriptor !== undefined && Object.hasOwn(descriptor, 'value')
      );
    })
  );
}

function isSyntheticPerson(value: unknown): value is string {
  return (
    typeof value === 'string' && value === value.trim() && /^SYNTHETIC_[A-Z0-9_]+$/.test(value)
  );
}

function validReview(review: MechanismProbe['authority']['pharmacist']): boolean {
  return (
    typeof review.current === 'boolean' &&
    (review.person === '' || isSyntheticPerson(review.person)) &&
    (review.decision === 'pending' ||
      review.decision === 'approved' ||
      review.decision === 'rejected')
  );
}

function validClock(seconds: unknown): seconds is number {
  return (
    typeof seconds === 'number' &&
    Number.isSafeInteger(seconds * 1000) &&
    Number.isSafeInteger(seconds) &&
    Math.abs(seconds) <= 8_640_000_000_000
  );
}

function strictUtcTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value))
    return null;
  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds)) return null;
  const canonical = new Date(milliseconds).toISOString().replace('.000Z', 'Z');
  return canonical === value ? milliseconds : null;
}

function presentField(field: string, value: string | readonly string[] | undefined): boolean {
  if (field === 'alternativesConsidered') {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 20 &&
      Array.from({ length: value.length }, (_, index) => {
        const entry: unknown = Object.getOwnPropertyDescriptor(value, index)?.value;
        return typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 4000;
      }).every(Boolean)
    );
  }
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= (field === 'structuredReason' ? 200 : 4000)
  );
}

function simulate(probe: MechanismProbe): boolean {
  if (
    !isRecord(probe) ||
    !isRecord(probe.fields) ||
    !isRecord(probe.evidence) ||
    !isRecord(probe.authority) ||
    !isRecord(probe.authority.pharmacist) ||
    !isRecord(probe.authority.secondPhysician) ||
    !isRecord(probe.state)
  )
    return false;
  if (
    typeof probe.context !== 'string' ||
    !Object.hasOwn(contexts, probe.context) ||
    !currentScenario(probe)
  )
    return false;
  const { authority, state } = probe;
  const { fields, lane } = contexts[probe.context];
  if (
    authority.currentAal2CareAndFacility !== true ||
    !isSyntheticPerson(authority.prescriberPerson) ||
    !validReview(authority.pharmacist) ||
    !validReview(authority.secondPhysician) ||
    state.separateSign !== true ||
    state.alreadySigned !== false ||
    typeof state.acknowledged !== 'boolean' ||
    typeof state.requestLive !== 'boolean' ||
    typeof state.pharmacistObligationPersisted !== 'boolean' ||
    !validClock(state.nowSeconds) ||
    (lane !== 'emergency' && state.secondApprovalSeconds !== null) ||
    Object.keys(probe.fields).some(
      (field) =>
        !fields.some((required) => required === field) &&
        !(probe.context === 'W-NA' && field === 'monitoringPlan'),
    ) ||
    !fields.every(
      (field) => Object.hasOwn(probe.fields, field) && presentField(field, probe.fields[field]),
    ) ||
    (Object.hasOwn(probe.fields, 'monitoringPlan') &&
      !presentField('monitoringPlan', probe.fields['monitoringPlan']))
  ) {
    return false;
  }
  if (lane === 'warning') return state.acknowledged === true;

  const expiryMs = strictUtcTimestamp(probe.fields['expiresAt']);
  if (state.requestLive !== true || expiryMs === null || !(state.nowSeconds * 1000 < expiryMs)) {
    return false;
  }
  const { pharmacist, secondPhysician, prescriberPerson } = authority;
  if (lane === 'normal') return independentReview(pharmacist, [prescriberPerson]);

  const activatedAt = state.secondApprovalSeconds;
  if (
    !independentReview(secondPhysician, [prescriberPerson]) ||
    state.pharmacistObligationPersisted !== true ||
    !validClock(activatedAt) ||
    activatedAt > state.nowSeconds
  ) {
    return false;
  }
  if (pharmacist.decision === 'approved') {
    return independentReview(pharmacist, [prescriberPerson, secondPhysician.person]);
  }
  return pharmacist.decision === 'pending' && state.nowSeconds - activatedAt < 60;
}

// A later approved binding needs verified deployment and exact file bytes. There
// is deliberately no switch, mock override, environment variable or allowlist.
function admittedForExecution(): boolean {
  return false;
}

export function runF012MechanismCandidate(probe: MechanismProbe) {
  if (!admittedForExecution()) throw new Error('F012_T003_EXACT_BYTE_ACCEPTANCE_REQUIRED');
  return {
    simulatedSignEligible: simulate(probe),
    clinicalAssessment: 'not_fully_checked' as const,
  };
}
