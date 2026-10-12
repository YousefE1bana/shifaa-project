import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { canonicalBytes, decodeCanonical, prepareCapability } from './protection.js';
import { releaseAad, protectRelease } from './release-protection.js';
import {
  allergyAad,
  factsBytes,
  reasonBytes,
  protectAllergy,
  reconstructAllergy,
  creationFacts,
  correctedFacts,
} from './allergy-protection.js';
const base = new URL(
  '../../../../../specs/011-allergies-clinical-content-governance/contracts/',
  import.meta.url,
);
const vectors = (name: string) => JSON.parse(readFileSync(new URL(name, base), 'utf8'));
const allergy = vectors('allergy-protection-v1-vectors.json');
const release = vectors('trusted-release-handoff-v1-vectors.json');
const context = allergy.aadPositive[0].facts;
const facts = allergy.payloadPositive[0].logicalInput;
function provider(key = randomBytes(32), immutable = true) {
  return {
    async prepare(_purpose: string, exact?: string) {
      return { key: Buffer.from(key), keyRef: exact ?? context.keyRef, immutable, release() {} };
    },
  };
}
describe('K08 frozen protection contracts and real local AES', () => {
  for (const v of allergy.payloadPositive)
    it(v.id, () =>
      expect(
        (v.logicalInput.contractId.endsWith('REASON/1')
          ? reasonBytes(v.logicalInput)
          : factsBytes(v.logicalInput)
        ).toString('hex'),
      ).toBe(v.expectedBytes.hex),
    );
  for (const v of allergy.aadPositive)
    it(v.id, () => expect(allergyAad(v.facts).toString('hex')).toBe(v.expectedBytes.hex));
  for (const v of release.aad.positive)
    it(v.id, () => expect(releaseAad(v.facts).toString('hex')).toBe(v.aadHex));
  it('Unicode scalar ordering and exact strings', () =>
    expect(
      canonicalBytes({ '𐀀': 'é\u2028', '\ue000': 'اختبار', '2': 2, '10': 10 }).toString(),
    ).toBe('{"10":10,"2":2,"":"اختبار","𐀀":"é\u2028"}'));
  it.each([NaN, 0.5, undefined, '\ud800', { value: undefined }])(
    'rejects noncanonical input %s',
    (value) => expect(() => canonicalBytes(value)).toThrow(),
  );
  it('requires configured immutable external key boundary', async () => {
    await expect(prepareCapability(undefined, 'body', 'encrypt')).rejects.toThrow();
    await expect(
      prepareCapability(provider(randomBytes(32), false), 'body', 'encrypt'),
    ).rejects.toThrow();
    await expect(prepareCapability(provider(), 'body', 'encrypt', 'current')).rejects.toThrow();
  });
  it('real BODY roundtrip, intended association and opaque capability', async () => {
    const p = provider(),
      c = release.aad.positive[0].facts,
      bytes = Buffer.from('اختبار فقط\né');
    const protectedBody = await protectRelease(p, c, bytes, bytes);
    const cap = await prepareCapability(p, 'body', 'decrypt', protectedBody.keyRef);
    expect(
      cap.decrypt(protectedBody, releaseAad({ ...c, keyRef: protectedBody.keyRef })).equals(bytes),
    ).toBe(true);
    expect(() => JSON.stringify(cap)).toThrow();
    cap.dispose();
    expect(() => cap.decrypt(protectedBody, releaseAad(c))).toThrow();
    await expect(protectRelease(p, c, bytes, Buffer.from('different'))).rejects.toThrow();
  });
  it('fresh nonces, tag/cipher/key/version/context substitution deny', async () => {
    const p = provider(),
      c = release.aad.positive[0].facts,
      bytes = Buffer.from('neutral');
    const a = await protectRelease(p, c, bytes, bytes),
      b = await protectRelease(p, c, bytes, bytes);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.nonce).toHaveLength(24);
    expect(a.authTag).toHaveLength(32);
    const cap = await prepareCapability(p, 'body', 'decrypt', a.keyRef),
      aad = releaseAad({ ...c, keyRef: a.keyRef });
    for (const field of ['authTag', 'ciphertext', 'nonce'] as const) {
      const changed = { ...a, [field]: 'ff' + a[field].slice(2) };
      if (changed[field] === a[field]) changed[field] = '00' + a[field].slice(2);
      expect(() => cap.decrypt(changed, aad)).toThrow();
    }
    expect(() =>
      cap.decrypt(a, releaseAad({ ...c, keyRef: a.keyRef, artifactVersion: '2' })),
    ).toThrow();
    expect(() => cap.decrypt({ ...a, contractId: 'wrong' }, aad)).toThrow();
    expect(() => cap.decrypt({ ...a, keyRef: 'wrong' }, aad)).toThrow();
    const wrong = await prepareCapability(provider(), 'body', 'decrypt', a.keyRef);
    expect(() => wrong.decrypt(a, aad)).toThrow();
    wrong.dispose();
    cap.dispose();
  });
  it('separate fresh allergy facts/reason and authorized reconstruction', async () => {
    const p = provider(),
      input = { ...context, revisionVersion: '2' };
    const result = await protectAllergy(p, input, facts, {
      contractId: 'SHIFAA-F011-ALLERGY-REASON/1',
      reason: 'اختبار فقط',
    });
    expect(result.protectedFacts.nonce).not.toBe(result.protectedReason!.nonce);
    let authorized = 0;
    const plain = await reconstructAllergy(p, input, result, async () => {
      authorized++;
    });
    expect(authorized).toBe(1);
    expect(plain.facts).toEqual(facts);
    expect(plain.reason?.reason).toBe('اختبار فقط');
    await expect(
      reconstructAllergy(p, input, result, async () => {
        throw new Error('denied');
      }),
    ).rejects.toThrow();
    await expect(
      reconstructAllergy(p, { ...input, revisionVersion: '3' }, result, async () => {}),
    ).rejects.toThrow();
  });
  it('closed facts/reason reject unknown fields and unsafe payloads', () => {
    expect(() => factsBytes({ ...facts, head: 1 })).toThrow();
    expect(() => reasonBytes({ contractId: 'SHIFAA-F011-ALLERGY-REASON/1', reason: '' })).toThrow();
  });
  it.each(['{"a":1,"a":1}', ' {"a":1}', '{"a":1.0}', '\ufeff{"a":1}'])(
    'strict decrypted JSON denies duplicates/BOM/noncanonical bytes %s',
    (text) => expect(() => decodeCanonical(Buffer.from(text))).toThrow(),
  );
  it('invalid UTF-8 and hidden/getter/array members deny before access', () => {
    expect(() => decodeCanonical(Buffer.from([0xff]))).toThrow();
    let touched = 0;
    const getter = Object.defineProperty({}, 'a', {
      enumerable: true,
      get() {
        touched++;
        return 1;
      },
    });
    expect(() => canonicalBytes(getter)).toThrow();
    expect(touched).toBe(0);
    const array = Object.defineProperty([1], '0', {
      enumerable: true,
      get() {
        touched++;
        return 1;
      },
    });
    expect(() => canonicalBytes(array)).toThrow();
    expect(touched).toBe(0);
    expect(() => canonicalBytes(Array(1))).toThrow();
  });
  it('workflow/head changes are excluded; immutable context identities remain', () => {
    const c = release.aad.positive[0].facts;
    expect(releaseAad({ ...c, workflowVersion: 99 })).toEqual(releaseAad(c));
    expect(allergyAad({ ...context, headVersion: 99 })).toEqual(allergyAad(context));
  });
  it('creation normalizes unknown; correction preserves source and validates new known coding', async () => {
    const request = { substance: facts.substance, source: facts.source };
    const created = await creationFacts(request, async () => {
      throw Error('no source');
    });
    expect(created.coding).toEqual({ knowledge: 'unknown' });
    const corrected = await correctedFacts(
      created,
      { reaction: { knowledge: 'known', value: ' é\nاختبار ' } },
      async () => {
        throw Error('no source');
      },
    );
    expect(corrected.source).toEqual(created.source);
    expect(corrected.reaction).toEqual({ knowledge: 'known', value: ' é\nاختبار ' });
    await expect(
      correctedFacts(
        created,
        { coding: { knowledge: 'known', value: { system: 'neutral', code: 'neutral' } } },
        async () => {
          throw Error('no approved source');
        },
      ),
    ).rejects.toThrow('no approved source');
  });
  it('short key/tag/nonce, mutable alias and closed envelope substitution deny', async () => {
    const p = provider(),
      c = release.aad.positive[0].facts,
      bytes = Buffer.from('neutral'),
      envelope = await protectRelease(p, c, bytes, bytes),
      cap = await prepareCapability(p, 'body', 'decrypt', envelope.keyRef);
    const aad = releaseAad({ ...c, keyRef: envelope.keyRef });
    for (const change of [
      { nonce: '00' },
      { authTag: '00' },
      { ciphertext: '' },
      { plaintext: 'extra' },
    ])
      expect(() => cap.decrypt({ ...envelope, ...change }, aad)).toThrow();
    cap.dispose();
    await expect(prepareCapability(provider(randomBytes(16)), 'body', 'encrypt')).rejects.toThrow();
    const alias = {
      async prepare() {
        return { key: randomBytes(32), keyRef: 'kms/key/latest', immutable: true, release() {} };
      },
    };
    await expect(prepareCapability(alias, 'body', 'encrypt')).rejects.toThrow();
  });
});
