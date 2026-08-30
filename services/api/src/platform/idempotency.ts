import { createHash, createHmac } from 'node:crypto';

import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';

export interface StoredHttpResult<T = unknown> {
  status: number;
  headers: Readonly<Record<string, string | string[]>>;
  body: T;
}

interface IdempotencyRecord<T> {
  requestHash: string;
  result: Promise<StoredHttpResult<T>>;
  expiresAt: number;
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

export function hashRequest(body: unknown): string {
  return createHash('sha256').update(stableJson(body)).digest('hex');
}

export function preauthPrincipal(handle: string, key: Uint8Array): string {
  return createHmac('sha256', key).update(handle.trim().toLowerCase()).digest('base64url');
}

export interface IdempotencyStore {
  execute<T, P = undefined>(input: {
    principal: string;
    method: string;
    route: string;
    key: string;
    body: unknown;
    retentionMs?: number;
    prepare?: () => Promise<P>;
    work: (prepared: P) => Promise<StoredHttpResult<T>>;
  }): Promise<StoredHttpResult<T>>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord<unknown>>();

  public constructor(private readonly now: () => number = Date.now) {}

  public async execute<T, P = undefined>(input: {
    principal: string;
    method: string;
    route: string;
    key: string;
    body: unknown;
    retentionMs?: number;
    prepare?: () => Promise<P>;
    work: (prepared: P) => Promise<StoredHttpResult<T>>;
  }): Promise<StoredHttpResult<T>> {
    if (input.key.length < 16 || input.key.length > 128) {
      throw new ApiPolicyError(
        'idempotency-key-invalid',
        400,
        'Idempotency-Key must contain between 16 and 128 characters.',
      );
    }
    const composite = [input.principal, input.method.toUpperCase(), input.route, input.key].join(
      '\u0000',
    );
    const requestHash = hashRequest(input.body);
    const timestamp = this.now();
    const retained = this.records.get(composite) as IdempotencyRecord<T> | undefined;
    if (retained && retained.expiresAt <= timestamp) this.records.delete(composite);
    const existing = this.records.get(composite) as IdempotencyRecord<T> | undefined;
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ApiPolicyError(
          'idempotency-key-reused',
          409,
          'Use a new Idempotency-Key when the request changes.',
        );
      }
      return existing.result;
    }

    const prepared = input.prepare ? await input.prepare() : (undefined as P);
    const result = input.work(prepared);
    this.records.set(composite, {
      requestHash,
      result,
      expiresAt: timestamp + (input.retentionMs ?? 24 * 60 * 60_000),
    });
    try {
      return await result;
    } catch (error) {
      this.records.delete(composite);
      throw error;
    }
  }
}
