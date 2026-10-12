import { randomBytes, randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { Feature011Allergies, type AllergyActor, type AllergyScope } from './allergies.js';
const patient = randomUUID(),
  person = randomUUID();
const actor: AllergyActor = {
  kind: 'PAT',
  subjectId: randomUUID(),
  personId: person,
  principal: person,
  aal: 2,
  requestId: randomUUID(),
  locale: 'ar-EG',
  purposes: ['care'],
};
const request = {
  substance: { identity: 'synthetic-neutral', display: 'Neutral synthetic substance' },
  source: { display: 'Self report' },
};
function fixture(role: AllergyScope['role'] = 'PAT') {
  const key = randomBytes(32),
    provider = {
      prepare: vi.fn(async () => ({
        key: Buffer.from(key),
        keyRef: 'synthetic/k11/versions/1',
        immutable: true,
        release() {},
      })),
    };
  const rows: Record<string, unknown>[] = [];
  const repository = {
    resolve: vi.fn(async (a: AllergyActor) => ({ actor: a, role })),
    read: vi.fn(async () => ({
      view: 'current',
      data: rows,
      meta: { nextCursor: null, lastUpdatedAt: new Date().toISOString(), stale: false },
    })),
    receipts: {
      probe: vi.fn(async () => undefined),
      replay: vi.fn(),
      mutate: vi.fn(async (scope, input, work) => {
        const prep = input.preparation;
        const row = {
          revisionId: prep.revisionId,
          allergyId: prep.allergyId,
          patientId: patient,
          version: 1,
          previousRevisionId: null,
          status: 'self_reported',
          facts: prep.protectedFacts,
          reason: null,
          recorderPersonId: person,
          recordedAt: new Date().toISOString(),
          actionActorPersonId: person,
          actionAt: new Date().toISOString(),
          verificationEvidenceRef: null,
          correctsAllergyId: prep.correctsAllergyId,
        };
        rows.push(row);
        const meta = {
          receiptId: randomUUID(),
          idempotencyRecordId: randomUUID(),
          operationId: 'createAllergy',
          targetResourceType: 'clinical.allergy_revision',
          targetResourceId: prep.allergyId,
          responseResourceVersion: 1,
          responseStatus: 201,
          responseETag: '"1"',
          responseLanguage: actor.locale,
          responseRequestId: actor.requestId,
        };
        return { value: work(meta, row).http };
      }),
    },
  };
  return { service: new Feature011Allergies({ repository, provider }), repository, provider, rows };
}
describe('Feature011 scoped report/read', () => {
  it('key preparation and SQL authorization do not overlap within a protected page', async () => {
    const f = fixture('CLN');
    for (let i = 0; i < 2; i++)
      await f.service.createAllergy(actor, patient, request, `k23-read-lock-boundary-${i}`);
    const read = f.repository.read.getMockImplementation()!;
    const prepare = f.provider.prepare;
    let activeReads = 0,
      activeExternal = 0;
    const yieldBoundary = () => new Promise<void>((resolve) => setImmediate(resolve));
    f.repository.read.mockImplementation(async () => {
      if (activeExternal) throw Error('SQL authorization overlapped external key preparation');
      activeReads++;
      try {
        await yieldBoundary();
        return await read();
      } finally {
        activeReads--;
      }
    });
    f.provider.prepare = vi.fn(async () => {
      if (activeReads) throw Error('External key preparation overlapped SQL authorization');
      activeExternal++;
      try {
        await yieldBoundary();
        return await prepare();
      } finally {
        activeExternal--;
      }
    });
    await expect(f.service.listAllergies(actor, patient)).resolves.toMatchObject({
      data: [{}, {}],
    });
    expect(activeReads).toBe(0);
    expect(activeExternal).toBe(0);
  });
  it('independent protected rows progress concurrently and retain their original page order', async () => {
    const f = fixture();
    for (let i = 0; i < 3; i++)
      await f.service.createAllergy(
        actor,
        patient,
        { ...request, substance: { ...request.substance, display: `Neutral ${i}` } },
        `k23-read-concurrency-key-${i}`,
      );
    const original = f.provider.prepare;
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      release();
    }, 500);
    f.provider.prepare = vi.fn(async () => {
      arrivals++;
      if (arrivals === 3) release();
      await barrier;
      return original();
    });
    try {
      const page = (await f.service.listAllergies(actor, patient)) as {
        data: { substance: { display: string } }[];
      };
      expect(arrivals).toBe(3);
      expect(page.data.map((row) => row.substance.display)).toEqual([
        'Neutral 0',
        'Neutral 1',
        'Neutral 2',
      ]);
      expect(timedOut).toBe(false);
    } finally {
      clearTimeout(timer);
    }
  });
  for (const role of ['PAT', 'CLN'] as const)
    it(`${role} creates self_reported and explicit unknown only`, async () => {
      const f = fixture(role),
        r = await f.service.createAllergy(actor, patient, request, 'k11-creation-key-0001');
      const body = JSON.parse(r.body.toString());
      expect(r.status).toBe(201);
      expect(body.status).toBe('self_reported');
      expect(body.coding).toEqual({ knowledge: 'unknown' });
      expect(body.verification).toBeNull();
      expect(r.headers['ETag']).toBe('"1"');
      expect(f.repository.receipts.mutate).toHaveBeenCalledOnce();
      const args = f.repository.receipts.mutate.mock.calls[0];
      expect(JSON.stringify(args?.[1])).not.toContain(request.substance.display);
    });
  it('empty read is explicitly empty, not allergy-free', async () => {
    const f = fixture();
    expect(await f.service.listAllergies(actor, patient)).toMatchObject({
      data: [],
      view: 'current',
    });
    expect(f.provider.prepare).not.toHaveBeenCalled();
  });
  it('authorized reconstruction returns exact source/facts without private fields', async () => {
    const f = fixture();
    await f.service.createAllergy(actor, patient, request, 'k11-creation-key-0002');
    const page = (await f.service.listAllergies(actor, patient)) as { data: any[] };
    expect(page.data[0].substance).toEqual(request.substance);
    expect(page.data[0].source).toEqual(request.source);
    expect(page.data[0]).not.toHaveProperty('facts');
    expect(page.data[0]).not.toHaveProperty('keyRef');
  });
  for (const role of ['GUA', 'DEL'] as const)
    it(`${role} read only; denies before protection`, async () => {
      const f = fixture(role);
      await expect(
        f.service.createAllergy(actor, patient, request, 'k11-creation-key-0003'),
      ).rejects.toThrow();
      expect(f.provider.prepare).not.toHaveBeenCalled();
      expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
      expect(await f.service.listAllergies(actor, patient)).toMatchObject({ data: [] });
    });
  it('allows native AAL1 patients to read their own allergies', async () => {
    const f = fixture('PAT');
    await expect(f.service.listAllergies({ ...actor, aal: 1 }, patient)).resolves.toMatchObject({
      data: [],
    });
    expect(f.repository.resolve).toHaveBeenCalledOnce();
  });
  it('allows native AAL1 patients to report for themselves', async () => {
    const f = fixture('PAT'),
      patientActor = { ...actor, aal: 1 as const };
    await expect(
      f.service.createAllergy(patientActor, patient, request, 'k11-patient-aal1-key-0001'),
    ).resolves.toMatchObject({ status: 201 });
    expect(f.repository.resolve).toHaveBeenCalled();
  });
  for (const role of ['GUA', 'DEL'] as const)
    it(`preserves authorized AAL1 ${role} reads`, async () => {
      const f = fixture(role);
      await expect(f.service.listAllergies({ ...actor, aal: 1 }, patient)).resolves.toMatchObject({
        data: [],
      });
      expect(f.repository.resolve).toHaveBeenCalledOnce();
    });
  it('resolves the authoritative workforce scope before requiring AAL2 for reads and reports', async () => {
    const f = fixture('CLN'),
      workforceActor = { ...actor, aal: 1 as const };
    await expect(f.service.listAllergies(workforceActor, patient)).rejects.toThrow(
      'Complete the required authentication.',
    );
    await expect(
      f.service.createAllergy(workforceActor, patient, request, 'k11-clinician-aal1-key-0001'),
    ).rejects.toThrow('Complete the required authentication.');
    expect(f.repository.resolve).toHaveBeenCalledTimes(2);
    expect(f.repository.read).not.toHaveBeenCalled();
    expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
  });
  it('continues to require AAL2 for allergy verification', async () => {
    const f = fixture();
    await expect(
      f.service.verifyAllergy(
        { ...actor, aal: 1 },
        randomUUID(),
        {
          targetStatus: 'refuted',
          reason: 'synthetic verification',
          verificationEvidenceRef: randomUUID(),
        },
        1,
        'k11-verification-aal1-key-0001',
      ),
    ).rejects.toThrow('Complete the required authentication.');
  });
  it('new known coding unavailable denies before SQL mutation', async () => {
    const f = fixture();
    await expect(
      f.service.createAllergy(
        actor,
        patient,
        {
          ...request,
          coding: {
            knowledge: 'known',
            value: { system: 'synthetic', code: 'X', display: 'Neutral' },
          },
        },
        'k11-creation-key-0004',
      ),
    ).rejects.toThrow();
    expect(f.provider.prepare).not.toHaveBeenCalled();
    expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
  });
  for (const bad of [{ purposes: [] }] as const)
    it(`denies missing native AAL/purpose ${JSON.stringify(bad)}`, async () => {
      const f = fixture();
      await expect(
        f.service.createAllergy({ ...actor, ...bad }, patient, request, 'k11-creation-key-0005'),
      ).rejects.toThrow();
      expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
    });
  it('lost current authority denies without decryption', async () => {
    const f = fixture();
    f.repository.resolve.mockRejectedValue(Error('authority revoked'));
    await expect(f.service.listAllergies(actor, patient)).rejects.toThrow('authority revoked');
    expect(f.provider.prepare).not.toHaveBeenCalled();
  });
});
