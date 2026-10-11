import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';
export type Purpose = 'body' | 'allergy' | 'receipt';
export interface Envelope {
  contractId: string;
  keyRef: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
}
/** Trusted external boundary, never a public request or client attestation. */
export interface KeyProvider {
  prepare(
    purpose: Purpose,
    exactKeyRef?: string,
  ): Promise<{
    key: Buffer;
    keyRef: string;
    immutable: boolean;
    release(): void | Promise<void>;
  }>;
}
const protocols = {
  body: ['SHIFAA-F011-PROTECTED-BODY/1', 'SHIFAA-F011-PROTECTED-AAD/1;'],
  allergy: ['SHIFAA-F011-ALLERGY-PROTECTED/1', 'SHIFAA-F011-ALLERGY-AAD/1;'],
  receipt: ['SHIFAA-F011-RECEIPT-PROTECTED/1', 'SHIFAA-F011-RECEIPT-AAD/1;'],
} as const;
export function deny(): never {
  throw new Error('Feature 011 protection denied');
}
export function strictText(value: unknown, nonempty = false): string {
  if (typeof value !== 'string' || (nonempty && !value.length) || !value.isWellFormed()) deny();
  return value;
}
export function metadata(value: unknown): string {
  const text = strictText(value, true);
  if (text.includes('\0')) deny();
  return text;
}
export function uuid(value: unknown): string {
  const text = metadata(value);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(text))
    deny();
  return text;
}
export function version(value: unknown): string {
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text))) deny();
  return text;
}
function scalarOrder(a: string, b: string): number {
  const left = [...a],
    right = [...b];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = left[i]!.codePointAt(0)! - right[i]!.codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}
/** Handwritten serializer: schemas/generators do not encode protocol bytes. */
export function canonicalBytes(value: unknown): Buffer {
  const seen = new Set<object>();
  const encode = (item: unknown): string => {
    if (item === null) return 'null';
    if (typeof item === 'string') return JSON.stringify(strictText(item));
    if (typeof item === 'boolean') return String(item);
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) deny();
      return String(item);
    }
    if (typeof item !== 'object' || seen.has(item)) deny();
    seen.add(item);
    try {
      if (Array.isArray(item)) {
        if (
          Object.getOwnPropertySymbols(item).length ||
          Object.getOwnPropertyNames(item).length !== item.length + 1
        )
          deny();
        return (
          '[' +
          Array.from({ length: item.length }, (_, index) => {
            const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
            if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) deny();
            return encode(descriptor.value);
          }).join(',') +
          ']'
        );
      }
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)
        deny();
      if (Object.getOwnPropertySymbols(item).length) deny();
      return (
        '{' +
        Object.getOwnPropertyNames(item)
          .sort(scalarOrder)
          .map((key) => {
            strictText(key);
            const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
            if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) deny();
            return JSON.stringify(key) + ':' + encode(descriptor.value);
          })
          .join(',') +
        '}'
      );
    } finally {
      seen.delete(item);
    }
  };
  return Buffer.from(encode(value), 'utf8');
}
export function decodeCanonical(bytes: Buffer): unknown {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
    );
    const canonical = canonicalBytes(parsed);
    try {
      if (!canonical.equals(bytes)) deny();
    } finally {
      canonical.fill(0);
    }
    return parsed;
  } catch {
    return deny();
  }
}
export function frames(prefix: string, values: readonly string[]): Buffer {
  return Buffer.from(
    prefix +
      values
        .map((value) => {
          metadata(value);
          return `S${Buffer.byteLength(value, 'utf8')}:${value},`;
        })
        .join(''),
    'utf8',
  );
}
function keyReference(value: string): string {
  metadata(value);
  if (/(^|[/:])(?:current|latest)(?:$|[/:])/i.test(value)) deny();
  return value;
}
function closedEnvelope(value: Envelope, contract: string, keyRef: string): void {
  if (
    !value ||
    Object.keys(value).sort().join(',') !== 'authTag,ciphertext,contractId,keyRef,nonce' ||
    value.contractId !== contract ||
    value.keyRef !== keyRef ||
    !/^[a-f0-9]{24}$/.test(value.nonce) ||
    !/^[a-f0-9]{32}$/.test(value.authTag) ||
    !/^(?:[a-f0-9]{2})+$/.test(value.ciphertext)
  )
    deny();
}
export class LocalCapability {
  #key: Buffer;
  #disposed = false;
  #used = false;
  constructor(
    key: Buffer,
    readonly keyRef: string,
    private readonly purpose: Purpose,
    private readonly mode: 'encrypt' | 'decrypt',
  ) {
    this.#key = key;
    Object.freeze(this);
  }
  toJSON(): never {
    return deny();
  }
  [inspect.custom](): string {
    return '[Feature011 local capability: opaque]';
  }
  #check(mode: 'encrypt' | 'decrypt', aad: Buffer): void {
    if (
      this.#disposed ||
      this.mode !== mode ||
      !aad
        .subarray(0, Buffer.byteLength(protocols[this.purpose][1]))
        .equals(Buffer.from(protocols[this.purpose][1]))
    )
      deny();
  }
  encrypt(plaintext: Buffer, aad: Buffer): Envelope {
    this.#check('encrypt', aad);
    if (this.#used || !plaintext.length) deny();
    this.#used = true;
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.#key, nonce, { authTagLength: 16 });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      contractId: protocols[this.purpose][0],
      keyRef: this.keyRef,
      nonce: nonce.toString('hex'),
      ciphertext: ciphertext.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    };
  }
  decrypt(envelope: Envelope, aad: Buffer): Buffer {
    this.#check('decrypt', aad);
    closedEnvelope(envelope, protocols[this.purpose][0], this.keyRef);
    let partial: Buffer | undefined;
    try {
      const cipher = createDecipheriv(
        'aes-256-gcm',
        this.#key,
        Buffer.from(envelope.nonce, 'hex'),
        { authTagLength: 16 },
      );
      cipher.setAAD(aad);
      cipher.setAuthTag(Buffer.from(envelope.authTag, 'hex'));
      partial = cipher.update(Buffer.from(envelope.ciphertext, 'hex'));
      return Buffer.concat([partial, cipher.final()]);
    } catch {
      return deny();
    } finally {
      partial?.fill(0);
    }
  }
  dispose(): void {
    this.#disposed = true;
    this.#key.fill(0);
  }
}
export async function prepareCapability(
  provider: KeyProvider | undefined,
  purpose: Purpose,
  mode: 'encrypt' | 'decrypt',
  exactKeyRef?: string,
): Promise<LocalCapability> {
  if (!provider) deny();
  if (exactKeyRef !== undefined) keyReference(exactKeyRef);
  const lease = await provider.prepare(purpose, exactKeyRef);
  let key: Buffer | undefined;
  try {
    if (lease.immutable !== true || !Buffer.isBuffer(lease.key) || lease.key.length !== 32) deny();
    keyReference(lease.keyRef);
    if (exactKeyRef !== undefined && exactKeyRef !== lease.keyRef) deny();
    key = Buffer.from(lease.key);
  } finally {
    if (Buffer.isBuffer(lease.key)) lease.key.fill(0);
    try {
      await lease.release();
    } catch (error) {
      key?.fill(0);
      throw error;
    }
  }
  return new LocalCapability(key!, lease.keyRef, purpose, mode);
}
