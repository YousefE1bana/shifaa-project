import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { ApiPolicyError } from '../identity-onboarding/errors.js';

export interface ReplayEnvelope {
  encoding: 'aes-256-gcm-v1';
  nonce: string;
  tag: string;
  ciphertext: string;
  expiresAt: string;
}

export class TransientReplayCipher {
  public constructor(private readonly key: Uint8Array) {
    if (key.byteLength !== 32)
      throw new Error('Transient replay encryption requires a 32-byte key.');
  }

  public seal(value: unknown, expiresAt: Date): ReplayEnvelope {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return {
      encoding: 'aes-256-gcm-v1',
      nonce: nonce.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      expiresAt: expiresAt.toISOString(),
    };
  }

  public open<T>(envelope: ReplayEnvelope, now: Date): T {
    if (now.getTime() >= Date.parse(envelope.expiresAt)) {
      throw new ApiPolicyError(
        'idempotency-replay-expired',
        410,
        'The replay envelope has expired.',
      );
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(envelope.nonce, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8'),
    ) as T;
  }
}

export function scopedPrincipal(namespace: string, secret: string, key: Uint8Array): string {
  return createHmac('sha256', key).update(`${namespace}\u0000${secret}`).digest('base64url');
}

export function hmacDigest(secret: string, key: Uint8Array): Uint8Array {
  return createHmac('sha256', key).update(secret).digest();
}

export function constantTimeMatch(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const leftDigest = createHmac('sha256', 'shifaa-csrf-compare').update(left).digest();
  const rightDigest = createHmac('sha256', 'shifaa-csrf-compare').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export class HmacRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  public constructor(
    private readonly key: Uint8Array,
    private readonly now: () => number,
  ) {}

  public consume(
    namespace: string,
    subject: string,
    limit: number,
    windowMs: number,
  ): number | null {
    const digest = scopedPrincipal(namespace, subject, this.key);
    const timestamp = this.now();
    const current = this.buckets.get(digest);
    const bucket =
      !current || current.resetAt <= timestamp
        ? { count: 0, resetAt: timestamp + windowMs }
        : current;
    bucket.count += 1;
    this.buckets.set(digest, bucket);
    return bucket.count <= limit
      ? null
      : Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1_000));
  }
}
