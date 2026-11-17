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
    review.current &&
    review.person.length > 0 &&
    !otherPeople.includes(review.person)
  );
}

function presentField(field: string, value: string | readonly string[] | undefined): boolean {
  if (field === 'alternativesConsidered') {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 20 &&
      value.every(
        (entry) => typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 4000,
      )
    );
  }
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= (field === 'structuredReason' ? 200 : 4000)
  );
}

function simulate(probe: MechanismProbe): boolean {
  if (!currentScenario(probe) || !Object.hasOwn(contexts, probe.context)) return false;
  const { authority, state } = probe;
  const { fields, lane } = contexts[probe.context];
  if (
    !authority.currentAal2CareAndFacility ||
    !authority.prescriberPerson ||
    !state.separateSign ||
    state.alreadySigned ||
    Object.keys(probe.fields).some(
      (field) =>
        !fields.some((required) => required === field) &&
        !(probe.context === 'W-NA' && field === 'monitoringPlan'),
    ) ||
    !fields.every(
      (field) => Object.hasOwn(probe.fields, field) && presentField(field, probe.fields[field]),
    ) ||
    ('monitoringPlan' in probe.fields &&
      !presentField('monitoringPlan', probe.fields['monitoringPlan']))
  ) {
    return false;
  }
  if (lane === 'warning') return state.acknowledged;

  const expiryMs = Date.parse(String(probe.fields['expiresAt']));
  if (
    !state.requestLive ||
    !Number.isSafeInteger(state.nowSeconds) ||
    !(state.nowSeconds * 1000 < expiryMs)
  ) {
    return false;
  }
  const { pharmacist, secondPhysician, prescriberPerson } = authority;
  if (lane === 'normal') return independentReview(pharmacist, [prescriberPerson]);

  const activatedAt = state.secondApprovalSeconds;
  if (
    !independentReview(secondPhysician, [prescriberPerson]) ||
    !state.pharmacistObligationPersisted ||
    activatedAt === null ||
    !Number.isSafeInteger(activatedAt) ||
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
