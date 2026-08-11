import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import {
  hashRequest,
  type IdempotencyStore,
  type StoredHttpResult,
} from '../../platform/idempotency.js';
import { PostgresIdentityRepository } from './identity-repository.js';

export class PostgresIdempotencyStore implements IdempotencyStore {
  public constructor(private readonly repository: PostgresIdentityRepository) {}

  public async execute<T, P = undefined>(input: {
    principal: string;
    method: string;
    route: string;
    key: string;
    body: unknown;
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
    if (input.prepare) {
      const reserved = await this.reserve<T>(input, requestHash);
      if (reserved) return reserved;
      let prepared: P;
      try {
        prepared = await input.prepare();
      } catch (error) {
        await this.removeReservation(input);
        throw error;
      }
      return this.complete(input, requestHash, prepared);
    }
    return this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.principal',${input.principal},true),set_config('statement_timeout','10000',true),set_config('lock_timeout','5000',true)`;
      await sql`
        insert into platform.idempotency_records(principal,method,route,idempotency_key,request_hash,state,expires_at)
        values(${input.principal},${input.method.toUpperCase()},${input.route},${input.key},${requestHash},'processing',now()+interval '24 hours')
        on conflict(principal,method,route,idempotency_key) do nothing`;
      const [record] = await sql<any[]>`
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
      if (record.state === 'completed') {
        return {
          status: record.response_status,
          headers: record.response_headers ?? {},
          body: record.response_body as T,
        };
      }
      const result = await input.work(undefined as P);
      await sql`
        update platform.idempotency_records set state='completed',response_status=${result.status},
          response_headers=${sql.json(result.headers)},response_body=${sql.json(result.body as any)},updated_at=now()
        where id=${record.id}::uuid`;
      return result;
    });
  }

  private async reserve<T>(
    input: { principal: string; method: string; route: string; key: string },
    requestHash: string,
  ): Promise<StoredHttpResult<T> | undefined> {
    const inserted = await this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.principal',${input.principal},true)`;
      const rows = await sql`
        insert into platform.idempotency_records(principal,method,route,idempotency_key,request_hash,state,expires_at)
        values(${input.principal},${input.method.toUpperCase()},${input.route},${input.key},${requestHash},'processing',now()+interval '24 hours')
        on conflict(principal,method,route,idempotency_key) do nothing returning id`;
      return rows.length > 0;
    });
    if (inserted) return undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      const record = await this.repository.withRawTransaction(async (sql) => {
        await sql`select set_config('shifaa.principal',${input.principal},true)`;
        const [row] = await sql<
          any[]
        >`select * from platform.idempotency_records where principal=${input.principal} and method=${input.method.toUpperCase()} and route=${input.route} and idempotency_key=${input.key}`;
        return row;
      });
      if (!record) return this.reserve(input, requestHash);
      if (record.request_hash !== requestHash)
        throw new ApiPolicyError(
          'idempotency-key-reused',
          409,
          'Use a new Idempotency-Key when the request changes.',
        );
      if (record.state === 'completed')
        return {
          status: record.response_status,
          headers: record.response_headers ?? {},
          body: record.response_body as T,
        };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new ApiPolicyError(
      'idempotency-in-progress',
      409,
      'The original request is still processing.',
    );
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
        any[]
      >`select * from platform.idempotency_records where principal=${input.principal} and method=${input.method.toUpperCase()} and route=${input.route} and idempotency_key=${input.key} and request_hash=${requestHash} for update`;
      if (!record) throw new Error('Prepared idempotency reservation was lost.');
      const result = await input.work(prepared);
      await sql`update platform.idempotency_records set state='completed',response_status=${result.status},response_headers=${sql.json(result.headers)},response_body=${sql.json(result.body as any)},updated_at=now() where id=${record.id}::uuid`;
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
