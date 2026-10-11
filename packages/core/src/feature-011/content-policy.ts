import { normalizeInstant } from './artifact.js';
export function nextArtifactVersion(
  predecessor: { sameSeries: boolean; published: boolean; version: number } | null,
): number {
  if (predecessor === null) return 1;
  if (
    !predecessor.sameSeries ||
    !predecessor.published ||
    !Number.isSafeInteger(predecessor.version) ||
    predecessor.version < 1 ||
    predecessor.version === Number.MAX_SAFE_INTEGER
  )
    throw Error('Invalid Feature 011 predecessor');
  return predecessor.version + 1;
}
export interface SigningFacts {
  contextAuthorized: boolean;
  creatorId: string;
  signerId: string;
  issuerIds: readonly string[];
  capacity: string;
  decision: string;
  artifactExact: boolean;
  basisCurrent: boolean;
  previousDecisions: readonly { personId: string; capacity: string }[];
}
export function canSignContent(input: SigningFacts): boolean {
  return (
    input.contextAuthorized &&
    input.artifactExact &&
    input.basisCurrent &&
    ['physician', 'pharmacist'].includes(input.capacity) &&
    ['approved', 'rejected'].includes(input.decision) &&
    input.signerId !== input.creatorId &&
    !input.issuerIds.includes(input.signerId) &&
    !input.previousDecisions.some(
      (d) => d.personId === input.signerId || d.capacity === input.capacity,
    )
  );
}
export interface PublicationFacts {
  contextAuthorized: boolean;
  publisherId: string;
  creatorId: string;
  artifactExact: boolean;
  admissionExactAndCurrent: boolean;
  lineageCurrent: boolean;
  approvals: readonly {
    personId: string;
    capacity: string;
    decision: string;
    exactAndCurrent: boolean;
  }[];
}
export function canPublishContent(input: PublicationFacts): boolean {
  if (
    !input.contextAuthorized ||
    input.publisherId === input.creatorId ||
    !input.artifactExact ||
    !input.admissionExactAndCurrent ||
    !input.lineageCurrent ||
    input.approvals.length !== 2
  )
    return false;
  const [first, second] = input.approvals;
  return (
    first!.personId !== second!.personId &&
    input.approvals.every(
      (a) => a.personId !== input.creatorId && a.decision === 'approved' && a.exactAndCurrent,
    ) &&
    ['physician', 'pharmacist'].every((capacity) =>
      input.approvals.some((a) => a.capacity === capacity),
    )
  );
}
export interface PublishedRelease {
  releaseId: string;
  supersedesReleaseId: string | null;
  published: boolean;
  effectiveAt: string;
  currentEligible: boolean;
}
/** Choose the time-qualified published chain first; never fallback for eligibility. */
export function selectEligibleContent(
  releases: readonly PublishedRelease[],
  now: string,
): string | null {
  const canonicalNow = normalizeInstant(now),
    published = releases.filter((r) => r.published);
  const roots = published.filter((r) => r.supersedesReleaseId === null);
  if (roots.length !== 1) return null;
  let selected = roots[0]!;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(selected.releaseId)) return null;
    visited.add(selected.releaseId);
    if (normalizeInstant(selected.effectiveAt) > canonicalNow) return null;
    const children = published.filter((r) => r.supersedesReleaseId === selected.releaseId);
    if (children.length > 1) return null;
    const child = children[0];
    if (!child || normalizeInstant(child.effectiveAt) > canonicalNow)
      return selected.currentEligible ? selected.releaseId : null;
    if (normalizeInstant(child.effectiveAt) < normalizeInstant(selected.effectiveAt)) return null;
    selected = child;
  }
}
export function exactCurrentBasis(historical: unknown, current: unknown): boolean {
  if (historical === current) return true;
  if (
    historical === null ||
    current === null ||
    typeof historical !== 'object' ||
    typeof current !== 'object'
  )
    return false;
  if (Array.isArray(historical) || Array.isArray(current)) return false;
  const old = historical as Record<string, unknown>,
    now = current as Record<string, unknown>,
    keys = Object.keys(old);
  return (
    keys.length === Object.keys(now).length &&
    keys.every((k) => Object.hasOwn(now, k) && exactCurrentBasis(old[k], now[k]))
  );
}
