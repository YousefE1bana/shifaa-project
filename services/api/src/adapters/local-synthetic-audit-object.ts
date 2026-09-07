import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import type { ObjectProofPort } from '../modules/audit-admin/types.js';

const OBJECT_KEY = /^audit-exports\/[a-f0-9]{64}\.jsonl$/;
type Stored = { iv: Buffer; ciphertext: Buffer; tag: Buffer; digest: string; verifiedAt: string };

export class LocalSyntheticAuditObjectStore implements ObjectProofPort {
  private readonly objects = new Map<string, Stored>();

  public constructor(private readonly key: Uint8Array) {
    if (key.byteLength !== 32) throw new TypeError('Audit object key must be 32 bytes.');
  }

  public async createIfAbsent(objectKey: string, content: Uint8Array) {
    this.validate(objectKey);
    const digest = createHash('sha256').update(content).digest('hex');
    const existing = this.objects.get(objectKey);
    if (existing) {
      const bytes = this.decrypt(objectKey, existing);
      if (
        existing.digest !== digest ||
        bytes.length !== content.length ||
        !timingSafeEqual(bytes, content)
      )
        throw new Error('Immutable audit object conflict.');
      return this.receipt(objectKey, existing);
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(objectKey));
    const stored: Stored = {
      iv,
      ciphertext: Buffer.concat([cipher.update(content), cipher.final()]),
      tag: cipher.getAuthTag(),
      digest,
      verifiedAt: new Date().toISOString(),
    };
    this.objects.set(objectKey, stored);
    return this.receipt(objectKey, stored);
  }

  public async readForVerification(objectKey: string): Promise<Uint8Array> {
    this.validate(objectKey);
    const stored = this.objects.get(objectKey);
    if (!stored) throw new Error('Audit object unavailable.');
    return this.decrypt(objectKey, stored);
  }

  private receipt(objectKey: string, stored: Stored) {
    return {
      objectKey,
      digestSha256: stored.digest,
      retentionProof: {
        proof_version: 1 as const,
        proof_class: 'synthetic_write_once' as const,
        verified_at: stored.verifiedAt,
      },
    };
  }

  private decrypt(objectKey: string, stored: Stored): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', this.key, stored.iv);
    decipher.setAAD(Buffer.from(objectKey));
    decipher.setAuthTag(stored.tag);
    return Buffer.concat([decipher.update(stored.ciphertext), decipher.final()]);
  }

  private validate(objectKey: string): void {
    if (!OBJECT_KEY.test(objectKey)) throw new TypeError('Invalid audit object key.');
  }
}
