import { isUtf8 } from 'node:buffer';
import { createCipheriv, createDecipheriv, createSecretKey, randomBytes } from 'node:crypto';

const contractId = 'F012_PAYLOAD_AES_256_GCM_V1';
const nonceBytes = 12;
const tagBytes = 16;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Feature012PayloadBinding = {
  readonly field: string;
  readonly resourceId: string;
  readonly resourceVersion: number;
  readonly retentionClass: 'CLINICAL_RECORD' | 'PRESCRIPTION_DISPENSE';
};

export type Feature012PayloadEnvelope = {
  readonly contractId: string;
  readonly keyRef: string;
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly authTag: Uint8Array;
};

export interface Feature012PayloadProtection {
  seal(binding: Feature012PayloadBinding, plaintext: Uint8Array): Feature012PayloadEnvelope;
  open(binding: Feature012PayloadBinding, envelope: Feature012PayloadEnvelope): Uint8Array;
}

class Feature012PayloadUnavailable extends Error {
  constructor() {
    super('Protected payload is unavailable.');
    this.name = 'Feature012PayloadUnavailable';
  }
}

function authenticatedBinding(binding: Feature012PayloadBinding, keyRef: string): Buffer {
  const { field, resourceId, resourceVersion, retentionClass } = binding;
  if (
    !/^[a-z][a-z0-9_]*$/.test(field) ||
    !uuid.test(resourceId) ||
    !Number.isInteger(resourceVersion) ||
    resourceVersion < 1 ||
    resourceVersion > 2_147_483_647 ||
    (retentionClass !== 'CLINICAL_RECORD' && retentionClass !== 'PRESCRIPTION_DISPENSE')
  ) {
    throw new Feature012PayloadUnavailable();
  }
  return Buffer.from(
    JSON.stringify([contractId, keyRef, field, resourceId, resourceVersion, retentionClass]),
    'utf8',
  );
}

// Local synthetic key material is supplied explicitly. This module performs
// no key lookup, production custody, storage, or retention scheduling.
export function createLocalFeature012PayloadProtection(
  keyRef: string,
  keyMaterial: Uint8Array,
): Feature012PayloadProtection {
  if (!keyRef.trim() || keyMaterial.byteLength !== 32) throw new Feature012PayloadUnavailable();
  const key = createSecretKey(keyMaterial);

  return {
    seal(binding, plaintext) {
      const aad = authenticatedBinding(binding, keyRef);
      if (!isUtf8(plaintext)) throw new Feature012PayloadUnavailable();
      try {
        const nonce = randomBytes(nonceBytes);
        const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: tagBytes });
        cipher.setAAD(aad);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return { contractId, keyRef, nonce, ciphertext, authTag: cipher.getAuthTag() };
      } catch {
        throw new Feature012PayloadUnavailable();
      }
    },
    open(binding, envelope) {
      if (
        envelope.contractId !== contractId ||
        envelope.keyRef !== keyRef ||
        envelope.nonce.byteLength !== nonceBytes ||
        envelope.authTag.byteLength !== tagBytes
      ) {
        throw new Feature012PayloadUnavailable();
      }
      const aad = authenticatedBinding(binding, keyRef);
      let plaintext: Buffer | undefined;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, envelope.nonce, {
          authTagLength: tagBytes,
        });
        decipher.setAAD(aad);
        decipher.setAuthTag(envelope.authTag);
        plaintext = decipher.update(envelope.ciphertext);
        // GCM has emitted all plaintext from update, but it authenticates at final.
        decipher.final();
        if (!isUtf8(plaintext)) throw new Feature012PayloadUnavailable();
        return Buffer.from(plaintext);
      } catch {
        // Authentication failures must not expose provider errors or evidence.
        throw new Feature012PayloadUnavailable();
      } finally {
        plaintext?.fill(0);
      }
    },
  };
}
