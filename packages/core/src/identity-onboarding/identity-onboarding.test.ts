import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  AesGcmIdentityCipher,
  DeterministicNonceSource,
  DomainPolicyError,
  appendConsentDecision,
  assertLoginHandle,
  maskIdentity,
  transitionVerification,
  withdrawConsent,
} from './index.js';

describe('identity crypto and masking', () => {
  it('uses randomized ciphertext with a stable separately keyed blind index', () => {
    const cipher = new AesGcmIdentityCipher(randomBytes(32), randomBytes(32), 1);
    const first = cipher.encrypt('29913991234567', 'egyptian_national_id');
    const second = cipher.encrypt('29913991234567', 'egyptian_national_id');

    expect(Buffer.from(first.nonce).equals(Buffer.from(second.nonce))).toBe(false);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
    expect(Buffer.from(first.blindIndex).equals(Buffer.from(second.blindIndex))).toBe(true);
    expect(cipher.decrypt(first, 'egyptian_national_id')).toBe('29913991234567');
    expect(maskIdentity('egyptian_national_id', '29913991234567')).toBe('••••••••••4567');
  });

  it('offers deterministic nonces only through an injected test adapter', () => {
    const source = new DeterministicNonceSource();
    expect(Buffer.from(source.bytes(12)).toString('hex')).toBe('000000000000000000000001');
  });
});

describe('verification and consent policy', () => {
  it('allows documented transitions and makes terminal states immutable', () => {
    const manual = transitionVerification(
      { id: randomUUID(), state: 'pending', version: 1 },
      'manual_review',
      1,
    );
    const approved = transitionVerification(manual, 'verified', 2, 'synthetic-review-complete');
    expect(approved).toMatchObject({ state: 'verified', version: 3 });
    expect(() => transitionVerification(approved, 'rejected', 3, 'changed')).toThrowError(
      expect.objectContaining({ code: 'state-transition-invalid' }),
    );
  });

  it('records granular decisions and append-only withdrawal', () => {
    const granted = appendConsentDecision({
      id: randomUUID(),
      personId: randomUUID(),
      purposeCode: 'identity_proofing',
      purposeVersion: '1.0.0',
      noticeVersion: '1.0.0',
      decision: 'granted',
      occurredAt: '2026-08-09T00:00:00.000Z',
    });
    const withdrawn = withdrawConsent({
      id: randomUUID(),
      current: granted,
      occurredAt: '2026-08-10T00:00:00.000Z',
    });
    expect(withdrawn).toMatchObject({
      decision: 'withdrawn',
      supersedesId: granted.id,
      version: 2,
    });
    expect(granted.decision).toBe('granted');
  });

  it('rejects government identifiers as login handles', () => {
    expect(() => assertLoginHandle('29913991234567')).toThrowError(DomainPolicyError);
    expect(() => assertLoginHandle('patient@synthetic.shifaa.test')).not.toThrow();
  });
});
