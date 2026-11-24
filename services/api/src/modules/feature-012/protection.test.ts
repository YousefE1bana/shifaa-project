import { describe, expect, it } from 'vitest';

const plaintext = 'SYNTHETIC_T018 Cafe\u0301 \u062f\u0641\u062a\u0631';
const surfaces = ['error', 'logs', 'outbox', 'receipt'] as const;

type BindingChange = 'field' | 'resource' | 'version';
type EnvelopeChange = 'nonce' | 'keyReference' | 'ciphertext' | 'tag';

// Bind these scenarios to the actual T019 subject and its captured output
// surfaces when they exist. Every trial creates its own synthetic record.
type ProtectionFixture = {
  read: (input?: { binding?: BindingChange; envelope?: EnvelopeChange }) => Promise<Uint8Array>;
  nonce: Uint8Array;
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
) {
  const open = () => create!(Buffer.from(plaintext, 'utf8'));
  describe.skipIf(!create)('F012 protected payloads through the T019 adapter', () => {
    it('preserves UTF-8 and uses a fresh nonce for the same payload', async () => {
      const first = await open();
      const second = await open();
      expect(Buffer.from(await first.read())).toEqual(Buffer.from(plaintext, 'utf8'));
      expect(Buffer.from(await second.read())).toEqual(Buffer.from(plaintext, 'utf8'));
      expect(first.nonce).not.toEqual(second.nonce);
    });

    it.each(rejectedInputs)('denies a mismatched binding or envelope %j', async (change) => {
      const fixture = await open();
      expect(Buffer.from(await fixture.read())).toEqual(Buffer.from(plaintext, 'utf8'));
      await expect(fixture.read(change)).rejects.toThrow();
    });

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

defineFeature012ProtectionCases();
