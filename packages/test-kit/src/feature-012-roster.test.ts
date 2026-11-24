import { describe, expect, it } from 'vitest';

const actionClock = '2030-04-05T08:00:00.000Z';

const current = {
  deployment: 'synthetic-deployment',
  rosterRevision: 2,
  manifestDigest: 'b'.repeat(64),
  ownerApproved: true,
  person: 'synthetic-reviewer',
  user: 'synthetic-reviewer-account',
  attendingPerson: 'synthetic-attending',
  attendingUser: 'synthetic-attending-account',
  otherReviewerPerson: 'synthetic-other-reviewer',
  otherReviewerUser: 'synthetic-other-reviewer-account',
  facility: 'synthetic-origin',
  lane: 'pharmacist',
  validFrom: '2030-04-05T07:00:00.000Z',
  validUntil: '2030-04-05T09:00:00.000Z',
  revokedAt: null,
};

type RosterInputs = Omit<typeof current, 'revokedAt'> & { revokedAt: string | null };
type Manifest = Pick<RosterInputs, 'rosterRevision' | 'manifestDigest' | 'ownerApproved'>;

type DesignationScope = Pick<RosterInputs, 'deployment' | 'person' | 'user' | 'facility' | 'lane'>;

// The T015 adapter supplies a fresh installed fixture per case. These are
// synthetic fixture values, with no package export or online admin operation.
type RosterFixture = {
  hasDesignation: (scope: DesignationScope) => Promise<boolean>;
  revokeDesignation: (at: string) => Promise<void>;
  approvedManifest: (revision: number) => Promise<Manifest>;
  activateManifest: (manifest: Manifest) => Promise<void>;
  activeRevision: () => Promise<number>;
};

const scope: DesignationScope = {
  deployment: current.deployment,
  person: current.person,
  user: current.user,
  facility: current.facility,
  lane: current.lane,
};

export function defineFeature012RosterCases(
  install?: (roster: RosterInputs, now: string) => Promise<RosterFixture>,
) {
  describe.skipIf(!install)('F012 installed designation authority', () => {
    it('admits the current trusted independent designation', async () => {
      const roster = await install!(current, actionClock);
      await expect(roster.hasDesignation(scope)).resolves.toBe(true);
    });

    it.each([
      ['another deployment', { deployment: 'synthetic-other-deployment' }],
      ['another person', { person: 'synthetic-other-person' }],
      ['another account', { user: 'synthetic-other-account' }],
      ['another facility', { facility: 'synthetic-other-facility' }],
      ['another lane', { lane: 'second_physician' }],
    ] as const)('denies designation substitution for %s', async (_name, substitution) => {
      const roster = await install!(current, actionClock);
      await expect(roster.hasDesignation(scope)).resolves.toBe(true);
      await expect(roster.hasDesignation({ ...scope, ...substitution })).resolves.toBe(false);
    });

    it.each([
      ['a future effective date', { validFrom: '2030-04-05T08:00:00.001Z' }],
      ['expiry equality', { validUntil: actionClock }],
      ['elapsed expiry', { validUntil: '2030-04-05T07:59:59.999Z' }],
      ['an alternate account of the attending person', { attendingPerson: current.person }],
      ['an alternate account of the other reviewer', { otherReviewerPerson: current.person }],
    ] as const)('denies %s', async (_name, designation) => {
      const roster = await install!({ ...current, ...designation }, actionClock);
      await expect(roster.hasDesignation(scope)).resolves.toBe(false);
    });

    it('denies the same scoped designation immediately after revocation', async () => {
      const roster = await install!(current, actionClock);
      await expect(roster.hasDesignation(scope)).resolves.toBe(true);
      await roster.revokeDesignation(actionClock);
      await expect(roster.hasDesignation(scope)).resolves.toBe(false);
    });

    it('activates a newer manifest with exact trusted approval', async () => {
      const roster = await install!(current, actionClock);
      const manifest = await roster.approvedManifest(3);
      await roster.activateManifest(manifest);
      await expect(roster.activeRevision()).resolves.toBe(3);
    });

    it.each([
      ['a rollback revision', 1, {}],
      ['an unapproved manifest', 3, { ownerApproved: false }],
      ['a substituted manifest digest', 3, { manifestDigest: '0'.repeat(64) }],
    ] as const)('rejects %s and preserves the active revision', async (_name, revision, change) => {
      const roster = await install!(current, actionClock);
      const manifest = await roster.approvedManifest(revision);
      await expect(roster.activeRevision()).resolves.toBe(current.rosterRevision);
      await expect(roster.activateManifest({ ...manifest, ...change })).rejects.toThrow();
      await expect(roster.activeRevision()).resolves.toBe(current.rosterRevision);
      await expect(roster.hasDesignation(scope)).resolves.toBe(true);
    });
  });
}

defineFeature012RosterCases();
