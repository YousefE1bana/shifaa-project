import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

import type { EncryptedIdentity, IdentityCipher, IdentityType } from './types.js';

export interface NonceSource {
  bytes(length: number): Uint8Array;
}

export const secureNonceSource: NonceSource = {
  bytes: (length) => randomBytes(length),
};

export class AesGcmIdentityCipher implements IdentityCipher {
  public constructor(
    private readonly encryptionKey: Uint8Array,
    private readonly blindIndexKey: Uint8Array,
    private readonly keyVersion: number,
    private readonly nonceSource: NonceSource = secureNonceSource,
  ) {
    if (encryptionKey.byteLength !== 32 || blindIndexKey.byteLength < 32) {
      throw new Error('Identity encryption and blind-index keys must be at least 256 bits.');
    }
    if (Buffer.from(encryptionKey).equals(Buffer.from(blindIndexKey))) {
      throw new Error('Identity encryption and blind-index keys must be distinct.');
    }
  }

  public encrypt(value: string, type: IdentityType): EncryptedIdentity {
    const normalized = normalizeIdentity(value);
    const nonce = this.nonceSource.bytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, nonce);
    cipher.setAAD(Buffer.from(`shifaa:${type}:v${this.keyVersion}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    const blindIndex = createHmac('sha256', this.blindIndexKey)
      .update(`${type}:${normalized}`, 'utf8')
      .digest();
    return { ciphertext, nonce, authenticationTag, blindIndex, keyVersion: this.keyVersion };
  }

  public decrypt(value: EncryptedIdentity, type: IdentityType): string {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, value.nonce);
    decipher.setAAD(Buffer.from(`shifaa:${type}:v${value.keyVersion}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(value.authenticationTag));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext)),
      decipher.final(),
    ]).toString('utf8');
  }
}

export function normalizeIdentity(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '');
}

export class DeterministicNonceSource implements NonceSource {
  private counter = 0;

  public bytes(length: number): Uint8Array {
    this.counter += 1;
    const result = Buffer.alloc(length);
    result.writeUInt32BE(this.counter, length - 4);
    return result;
  }
}
