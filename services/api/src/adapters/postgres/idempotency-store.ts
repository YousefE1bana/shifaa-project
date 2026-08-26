import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import {
  hashRequest,
  type IdempotencyStore,
  type StoredHttpResult,
} from '../../platform/idempotency.js';
import { PostgresIdentityRepository } from './identity-repository.js';

interface ProtectedEnvelope {
  encoding: 'aes-256-gcm-v1';
  nonce: string;
  tag: string;
  ciphertext: string;
}

interface IdempotencyRow {
  id: string;
  request_hash: string;
  state: 'processing' | 'completed' | 'failed';
  response_status: number | null;
  response_headers: Record<string, string> | null;
  response_body: unknown;
  resource_type: string | null;
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  public constructor(
    private readonly repository: PostgresIdentityRepository,
    private readonly responseEncryptionKey: Uint8Array,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private protect(value: unknown) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.responseEncryptionKey, nonce);
    const payload =
      value instanceof Uint8Array
        ? { kind: 'bytes', value: Buffer.from(value).toString('base64') }
        : { kind: 'json', value };
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return {
      encoding: 'aes-256-gcm-v1',
      nonce: nonce.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    };
  }

  private unprotect<T>(value: unknown): T {
    if (!value || typeof value !== 'object')
      throw new Error('Stored idempotency response is not a protected envelope.');
    const candidate = value as Partial<ProtectedEnvelope>;
    if (
      candidate.encoding !== 'aes-256-gcm-v1' ||
      typeof candidate.nonce !== 'string' ||
      typeof candidate.tag !== 'string' ||
      typeof candidate.ciphertext !== 'string'
    ) {
      throw new Error('Stored idempotency response is not a protected envelope.');
    }
    const envelope = candidate as ProtectedEnvelope;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.responseEncryptionKey,
      Buffer.from(envelope.nonce, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    const decoded: unknown = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8'),
    );
    if (decoded && typeof decoded === 'object') {
      const payload = decoded as Record<string, unknown>;
      if (payload['kind'] === 'bytes' && typeof payload['value'] === 'string') {
        return new Uint8Array(Buffer.from(payload['value'], 'base64')) as T;
      }
      if (payload['kind'] === 'json') return payload['value'] as T;
    }
    return decoded as T;
  }

  private completedResult<T>(record: IdempotencyRow): StoredHttpResult<T> {
    if (record.state !== 'completed' || typeof record.response_status !== 'number') {
      throw new Error('Completed idempotency result is incomplete.');
    }
    return {
      status: record.response_status,
      headers: record.response_headers ?? {},
      body: this.unprotect<T>(record.response_body),
    };
  }

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
    const requestHash = hashRequest(input.body);
    const expiresAt = new Date(
      this.now().getTime() + (input.retentionMs ?? 24 * 60 * 60_000),
    ).toISOString();
    if (input.prepare) {
      const reservation = await this.reserve<T, P>(input, requestHash, expiresAt);
      if (reservation.kind === 'result') return reservation.result;
      let prepared: P;
      if (reservation.kind === 'prepared') prepared = reservation.prepared;
      else {
        try {
          prepared = await input.prepare();
          await this.storePrepared(input, requestHash, prepared);
        } catch (error) {
          await this.removeReservation(input);
          throw error;
        }
      }
      return this.complete(input, requestHash, prepared);
    }
    return this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.principal',${input.principal},true),set_config('statement_timeout','10000',true),set_config('lock_timeout','5000',true)`;
      await sql`delete from platform.idempotency_records where principal=${input.principal} and expires_at<=${this.now().toISOString()}::timestamptz`;
      await sql`
        insert into platform.idempotency_records(principal,method,route,idempotency_key,request_hash,state,expires_at)
        values(${input.principal},${input.method.toUpperCase()},${input.route},${input.key},${requestHash},'processing',${expiresAt}::timestamptz)
        on conflict(principal,method,route,idempotency_key) do nothing`;
      const [record] = await sql<IdempotencyRow[]>`
        select * from platform.idempotency_records
        where principal=${input.principal} and method=${input.method.toUpperCase()} and route=${input.route} and idempotency_key=${input.key}
        for update`;
      if (!record) throw new Error('Idempotency record could not be locked.');
      if (record.request_hash !== requestHash)
        throw new ApiPolicyError(
          'idempotency-key-reused',
          409,
          'Use a new Idempotency-Key when the request changes.',
        );
      if (record.state === 'completed') return this.completedResult<T>(record);
      const result = await input.work(undefined as P);
      await sql`
        update platform.idempotency_records set state='completed',response_status=${result.status},
          response_headers=${sql.json(result.headers)},response_body=${sql.json(this.protect(result.body))},updated_at=now()
        where id=${record.id}::uuid`;
      return result;
    });
  }

  private async reserve<T, P>(
    input: { principal: string; method: string; route: string; key: string },
    requestHash: string,
    expiresAt: string,
  ): Promise<
    | { kind: 'new' }
    | { kind: 'prepared'; prepared: P }
    | { kind: 'result'; result: StoredHttpResult<T> }
  > {
    const inserted = await this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.principal',${input.principal},true)`;
      await sql`delete from platform.idempotency_records where principal=${input.principal} and expires_at<=${this.now().toISOString()}::timestamptz`;
      const rows = await sql`
        insert into platform.idempotency_records(principal,method,route,idempotency_key,request_hash,state,expires_at)
        values(${input.principal},${input.method.toUpperCase()},${input.route},${input.key},${requestHash},'processing',${expiresAt}::timestamptz)
        on conflict(principal,method,route,idempotency_key) do nothing returning id`;
      return rows.length > 0;
    });
    if (inserted) return { kind: 'new' };
    for (let attempt = 0; attempt < 100; attempt++) {
      const record = await this.repository.withRawTransaction(async (sql) => {
        await sql`select set_config('shifaa.principal',${input.principal},true)`;
        const [row] = await sql<
          IdempotencyRow[]
        >`select * from platform.idempotency_records where principal=${input.principal} and method=${input.method.toUpperCase()} and route=${input.route} and idempotency_key=${input.key}`;
        return row;
      });
      if (!record) return this.reserve<T, P>(input, requestHash, expiresAt);
      if (record.request_hash !== requestHash)
        throw new ApiPolicyError(
          'idempotency-key-reused',
          409,
          'Use a new Idempotency-Key when the request changes.',
        );
      if (record.state === 'completed')
        return { kind: 'result', result: this.completedResult<T>(record) };
      if (record.resource_type === 'staged-native-completed' && record.response_body) {
        return { kind: 'prepared', prepared: this.unprotect<P>(record.response_body) };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new ApiPolicyError(
      'idempotency-in-progress',
      409,
      'The original request is still processing.',
    );
  }

  private async storePrepared<P>(
    input: { principal: string; method: string; route: string; key: string },
    requestHash: string,
    prepared: P,
  ): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.principal',${input.principal},true)`;
      const rows = await sql`
        update platform.idempotency_records
        set resource_type='staged-native-completed',response_body=${sql.json(this.protect(prepared))},updated_at=now()
        where principal=${input.principal} and method=${input.method.toUpperCase()}
          and route=${input.route} and idempotency_key=${input.key}
          and request_hash=${requestHash} and state='processing'
        returning id`;
      if (rows.length !== 1) throw new Error('Prepared native command checkpoint was lost.');
    });
  }

  private async complete<T, P>(
    input: {
      principal: string;
      method: string;
      route: string;
      key: string;
      work: (prepared: P) => Promise<StoredHttpResult<T>>;
    },
    requestHash: string,
    prepared: P,
  ): Promise<StoredHttpResult<T>> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.principal',${input.principal},true)`;
      const [record] = await sql<
        IdempotencyRow[]
      >`select * from platform.idempotency_records where principal=${input.principal} and method=${input.method.toUpperCase()} and route=${input.route} and idempotency_key=${input.key} and request_hash=${requestHash} for update`;
      if (!record) throw new Error('Prepared idempotency reservation was lost.');
      const result = await input.work(prepared);
      await sql`update platform.idempotency_records set state='completed',resource_type=null,response_status=${result.status},response_headers=${sql.json(result.headers)},response_body=${sql.json(this.protect(result.body))},updated_at=now() where id=${record.id}::uuid`;
      return result;
    });
  }

  private async removeReservation(input: {
    principal: string;
    method: string;
    route: string;
    key: string;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.principal',${input.principal},true)`;
      await sql`delete from platform.idempotency_records where principal=${input.principal} and method=${input.method.toUpperCase()} and route=${input.route} and idempotency_key=${input.key} and state='processing'`;
    });
  }
}
