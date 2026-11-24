import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createLocalFeature012PayloadProtection,
  type Feature012PayloadBinding,
  type Feature012PayloadEnvelope,
} from './protection.js';

const plaintext = 'SYNTHETIC_T018 Cafe\u0301 \u062f\u0641\u062a\u0631';
const surfaces = ['error', 'logs', 'outbox', 'receipt'] as const;

type BindingChange = 'field' | 'resource' | 'version';
type EnvelopeChange = 'nonce' | 'keyReference' | 'ciphertext' | 'tag';

// Bind these scenarios to the actual T019 subject and its captured output
// surfaces when they exist. Every trial creates its own synthetic record.
type EnvelopeFixture = {
  read: (input?: { binding?: BindingChange; envelope?: EnvelopeChange }) => Promise<Uint8Array>;
  nonce: Uint8Array;
};

type ProtectionFixture = EnvelopeFixture & {
  forbiddenValues: readonly string[];
  surfaces: Partial<Record<(typeof surfaces)[number], unknown>>;
  readWithF011Executor: () => Promise<Uint8Array>;
  expireValidity: () => Promise<void>;
  readRetained: () => Promise<Uint8Array>;
};

const rejectedInputs = [
  { binding: 'field' },
  { binding: 'resource' },
  { binding: 'version' },
  { envelope: 'nonce' },
  { envelope: 'keyReference' },
  { envelope: 'ciphertext' },
  { envelope: 'tag' },
] as const;

export function defineFeature012ProtectionCases(
  create?: (payload: Uint8Array) => Promise<ProtectionFixture>,
  createEnvelope: ((payload: Uint8Array) => Promise<EnvelopeFixture>) | undefined = create,
) {
  const open = () => create!(Buffer.from(plaintext, 'utf8'));
  const openEnvelope = () => createEnvelope!(Buffer.from(plaintext, 'utf8'));
  describe.skipIf(!createEnvelope)('F012 protected payload envelopes', () => {
    it('preserves UTF-8 and uses a fresh nonce for the same payload', async () => {
      const first = await openEnvelope();
      const second = await openEnvelope();
      expect(Buffer.from(await first.read())).toEqual(Buffer.from(plaintext, 'utf8'));
      expect(Buffer.from(await second.read())).toEqual(Buffer.from(plaintext, 'utf8'));
      expect(first.nonce).not.toEqual(second.nonce);
    });

    it.each(rejectedInputs)('denies a mismatched binding or envelope %j', async (change) => {
      const fixture = await openEnvelope();
      expect(Buffer.from(await fixture.read())).toEqual(Buffer.from(plaintext, 'utf8'));
      await expect(fixture.read(change)).rejects.toThrow();
    });
  });

  describe.skipIf(!create)('F012 protected payload persistence and disclosure', () => {
    it('denies a separately authorized F011 protected executor access to the F012 record', async () => {
      const fixture = await open();
      expect(Buffer.from(await fixture.read())).toEqual(Buffer.from(plaintext, 'utf8'));
      await expect(fixture.readWithF011Executor()).rejects.toThrow();
    });

    it('keeps protected values out of observable outputs', async () => {
      const fixture = await open();
      await expect(fixture.read({ envelope: 'tag' })).rejects.toThrow();
      expect(fixture.forbiddenValues.length).toBeGreaterThan(0);
      for (const surface of surfaces) {
        expect(fixture.surfaces).toHaveProperty(surface);
        const output = JSON.stringify(fixture.surfaces[surface]);
        expect(output).toBeDefined();
        for (const value of [plaintext, ...fixture.forbiddenValues]) {
          expect(value).not.toBe('');
          expect(output).not.toContain(value);
        }
      }
    });

    it('preserves retained bytes when a validity period expires', async () => {
      const fixture = await open();
      const before = Buffer.from(await fixture.readRetained());
      expect(before.length).toBeGreaterThan(0);
      await fixture.expireValidity();
      expect(Buffer.from(await fixture.readRetained())).toEqual(before);
    });
  });
}

const binding: Feature012PayloadBinding = {
  field: 'protected_justification',
  resourceId: '00000000-0000-4000-8000-000000000012',
  resourceVersion: 1,
  retentionClass: 'CLINICAL_RECORD',
};
const bindingChanges = {
  field: { field: 'protected_monitoring' },
  resource: { resourceId: '00000000-0000-4000-8000-000000000013' },
  version: { resourceVersion: 2 },
} as const;

function changedBytes(bytes: Uint8Array): Uint8Array {
  const altered = Uint8Array.from(bytes);
  altered[0] = altered[0]! ^ 1;
  return altered;
}

function changeEnvelope(
  envelope: Feature012PayloadEnvelope,
  change: EnvelopeChange,
): Feature012PayloadEnvelope {
  switch (change) {
    case 'keyReference':
      return { ...envelope, keyRef: 'synthetic-other-key' };
    case 'nonce':
      return { ...envelope, nonce: changedBytes(envelope.nonce) };
    case 'ciphertext':
      return { ...envelope, ciphertext: changedBytes(envelope.ciphertext) };
    case 'tag':
      return { ...envelope, authTag: changedBytes(envelope.authTag) };
  }
}

const localProtection = createLocalFeature012PayloadProtection(
  'synthetic-f012-key',
  randomBytes(32),
);
defineFeature012ProtectionCases(undefined, async (payload) => {
  const envelope = localProtection.seal(binding, payload);
  return {
    nonce: envelope.nonce,
    read: async (change) =>
      localProtection.open(
        change?.binding ? { ...binding, ...bindingChanges[change.binding] } : binding,
        change?.envelope ? changeEnvelope(envelope, change.envelope) : envelope,
      ),
  };
});

it('rejects a changed retention class with a payload-free error', () => {
  const envelope = localProtection.seal(binding, Buffer.from(plaintext, 'utf8'));
  expect(() =>
    localProtection.open({ ...binding, retentionClass: 'PRESCRIPTION_DISPENSE' }, envelope),
  ).toThrow(/^Protected payload is unavailable\.$/);
});
