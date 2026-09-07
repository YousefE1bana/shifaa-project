import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import type { ImmutableAuditObjectPort } from '../audit-export.ts';

const OBJECT_KEY = /^audit-exports\/[a-f0-9]{64}\.jsonl$/;
const SHA256 = /^[a-f0-9]{64}$/;

type StoredObject = Readonly<{
  iv: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
  digestSha256: string;
  verifiedAt: string;
}>;

export class ImmutableObjectConflictError extends Error {
  public constructor() {
    super('Immutable synthetic audit object mismatch.');
    this.name = 'ImmutableObjectConflictError';
  }
}

export class LocalSyntheticAuditObjectAdapter implements ImmutableAuditObjectPort {
  private readonly objects = new Map<string, StoredObject>();
  private readonly encryptionKey: Uint8Array;
  private readonly now: () => Date;

  public constructor(encryptionKey: Uint8Array, now: () => Date = () => new Date()) {
    if (encryptionKey.byteLength !== 32)
      throw new TypeError('Synthetic audit object encryption key must be 32 bytes.');
    this.encryptionKey = new Uint8Array(encryptionKey);
    this.now = now;
  }

  public async createIfAbsent(
    objectKey: string,
    canonicalBytes: Uint8Array,
    expectedDigest?: string,
  ) {
    this.validateObjectKey(objectKey);
    const digestSha256 = createHash('sha256').update(canonicalBytes).digest('hex');
    if (
      expectedDigest !== undefined &&
      (!SHA256.test(expectedDigest) || expectedDigest !== digestSha256)
    )
      throw new ImmutableObjectConflictError();
    const existing = this.objects.get(objectKey);
    if (existing) {
      const existingBytes = this.decrypt(objectKey, existing);
      if (
        existing.digestSha256 !== digestSha256 ||
        existingBytes.byteLength !== canonicalBytes.byteLength ||
        !timingSafeEqual(existingBytes, canonicalBytes)
      )
        throw new ImmutableObjectConflictError();
      return this.receipt(objectKey, existing);
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(objectKey, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(canonicalBytes), cipher.final()]);
    const stored: StoredObject = {
      iv,
      ciphertext,
      tag: cipher.getAuthTag(),
      digestSha256,
      verifiedAt: this.now().toISOString(),
    };
    this.objects.set(objectKey, stored);
    return this.receipt(objectKey, stored);
  }

  public async readForVerification(objectKey: string): Promise<Uint8Array> {
    this.validateObjectKey(objectKey);
    const stored = this.objects.get(objectKey);
    if (!stored) throw new Error('Synthetic audit object is unavailable.');
    return new Uint8Array(this.decrypt(objectKey, stored));
  }

  private decrypt(objectKey: string, stored: StoredObject): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, stored.iv);
    decipher.setAAD(Buffer.from(objectKey, 'utf8'));
    decipher.setAuthTag(stored.tag);
    return Buffer.concat([decipher.update(stored.ciphertext), decipher.final()]);
  }

  private receipt(objectKey: string, stored: StoredObject) {
    return {
      objectKey,
      digestSha256: stored.digestSha256,
      retentionProof: {
        proof_version: 1 as const,
        proof_class: 'synthetic_write_once' as const,
        verified_at: stored.verifiedAt,
      },
    };
  }

  private validateObjectKey(objectKey: string): void {
    if (!OBJECT_KEY.test(objectKey)) throw new TypeError('Invalid synthetic audit object key.');
  }
}
