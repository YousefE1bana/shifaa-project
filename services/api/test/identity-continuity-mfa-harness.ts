import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHmac, randomUUID } from 'node:crypto';

import Fastify, { type FastifyInstance } from 'fastify';

import { PostgresIdempotencyStore } from '../src/adapters/postgres/idempotency-store.js';
import { PostgresIdentityContinuityService } from '../src/adapters/postgres/identity-continuity-service.js';
import { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';
import { SupabaseAuthIssuer } from '../src/adapters/supabase-auth.js';
import { IdentityContinuityService } from '../src/modules/identity-continuity/service.js';
import { registerIdentityContinuityRoutes } from '../src/routes/identity-continuity.js';
import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';

const requireFromApi = createRequire(new URL('../package.json', import.meta.url));
const { createClient } = requireFromApi('@supabase/supabase-js') as {
  createClient(url: string, key: string, options: unknown): any;
};
const postgres = requireFromApi('postgres') as any;

export interface SupabaseStatus {
  API_URL: string;
  ANON_KEY: string;
  DB_URL: string;
  MAILPIT_URL: string;
}

export function supabaseStatus(): SupabaseStatus {
  const command = process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : 'corepack';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'corepack pnpm exec supabase status -o json']
      : ['pnpm', 'exec', 'supabase', 'status', '-o', 'json'];
  return JSON.parse(execFileSync(command, args, { encoding: 'utf8' })) as SupabaseStatus;
}

export function authClient(runtime: SupabaseStatus) {
  return createClient(runtime.API_URL, runtime.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function confirmationCode(runtime: SupabaseStatus, email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await fetch(`${runtime.MAILPIT_URL}/api/v1/messages`).then(
      (response) => response.json() as Promise<any>,
    );
    const message = list.messages?.find((entry: any) =>
      entry.To?.some((recipient: any) => recipient.Address === email),
    );
    if (message) {
      const detail = await fetch(`${runtime.MAILPIT_URL}/api/v1/message/${message.ID}`).then(
        (response) => response.json() as Promise<any>,
      );
      const code = /\b\d{6}\b/.exec(detail.Text ?? '')?.[0];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Synthetic confirmation code was not delivered.');
}

export async function confirmedSignup(
  runtime: SupabaseStatus,
  email: string,
  password: string,
): Promise<{ userId: string; accessToken: string; refreshToken: string }> {
  const client = authClient(runtime);
  const signup = await client.auth.signUp({ email, password });
  if (signup.error) throw signup.error;
  const confirmation = await client.auth.verifyOtp({
    email,
    token: await confirmationCode(runtime, email),
    type: 'signup',
  });
  if (confirmation.error || !confirmation.data.session) {
    throw confirmation.error ?? new Error('Synthetic native session is missing.');
  }
  return {
    userId: confirmation.data.user.id,
    accessToken: confirmation.data.session.access_token,
    refreshToken: confirmation.data.session.refresh_token,
  };
}

export async function freshPasswordLogin(
  runtime: SupabaseStatus,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const login = await authClient(runtime).auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) {
    throw login.error ?? new Error('Fresh synthetic password session is missing.');
  }
  return {
    accessToken: login.data.session.access_token,
    refreshToken: login.data.session.refresh_token,
  };
}

function decodeBase32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of secret.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('TOTP secret contains an invalid Base32 character.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function currentTotp(secret: string, atMs = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, '0');
}

export interface MfaHarness {
  app: FastifyInstance;
  authAdapter: SupabaseAuthIssuer;
  service: IdentityContinuityService;
  setClockOffsetMs(offset: number): void;
  clockOffsetMs(): number;
  seedPerson(userId: string, email: string): Promise<string>;
  seedWorkforceGrant(personId: string): Promise<void>;
  ownerSql<T>(work: (sql: any) => Promise<T>): Promise<T>;
  inject: FastifyInstance['inject'];
  close(): Promise<void>;
}

export async function buildMfaHarness(runtime: SupabaseStatus): Promise<MfaHarness> {
  let offsetMs = 0;
  const apiUrl = new URL(runtime.DB_URL);
  apiUrl.username = 'shifaa_api';
  apiUrl.password = 'synthetic_api_only';
  const repository = new PostgresIdentityRepository(apiUrl.toString());
  await repository.ready();
  const continuityRepository = new PostgresIdentityContinuityService(
    repository,
    Buffer.alloc(32, 10),
  );
  const authAdapter = new SupabaseAuthIssuer({
    url: runtime.API_URL,
    anonKey: runtime.ANON_KEY,
    jwksUrl: `${runtime.API_URL}/auth/v1/.well-known/jwks.json`,
    issuer: `${runtime.API_URL}/auth/v1`,
    audience: 'authenticated',
  });
  await authAdapter.ready();
  const hmacKey = Buffer.alloc(32, 9);
  const service = new IdentityContinuityService({
    auth: authAdapter,
    repository: continuityRepository,
    allowedWebOrigins: new Set(['https://patient.synthetic.test']),
    hmacKey,
    now: () => new Date(Date.now() + offsetMs),
  });
  const app = Fastify({ logger: false, genReqId: () => randomUUID() });
  installIdentityErrorHandler(app);
  await registerIdentityContinuityRoutes(app, {
    service,
    idempotency: new PostgresIdempotencyStore(repository, Buffer.alloc(32, 10)),
    hmacKey,
    now: () => Date.now() + offsetMs,
  });
  await app.ready();

  const harness: MfaHarness = {
    app,
    authAdapter,
    service,
    setClockOffsetMs: (value) => {
      offsetMs = value;
    },
    clockOffsetMs: () => offsetMs,
    async seedPerson(userId: string, email: string) {
      const personId = randomUUID();
      const sql = postgres(runtime.DB_URL, { max: 1 });
      try {
        await sql`
          insert into identity.people(id,user_id,display_name,email_normalized,profile_status)
          values(${personId}::uuid,${userId}::uuid,'Synthetic 007 MFA Actor',${email},'active')`;
      } finally {
        await sql.end({ timeout: 5 });
      }
      return personId;
    },
    async seedWorkforceGrant(personId: string) {
      const sql = postgres(runtime.DB_URL, { max: 1 });
      try {
        const [proposer] = await sql<{ id: string }[]>`
          insert into identity.people(id,user_id,display_name,email_normalized,profile_status)
          values(gen_random_uuid(),gen_random_uuid(),'Synthetic Grant Proposer','proposer-'||gen_random_uuid()::text||'@synthetic.shifaa.test','active')
          returning id`;
        const [decider] = await sql<{ id: string }[]>`
          insert into identity.people(id,user_id,display_name,email_normalized,profile_status)
          values(gen_random_uuid(),gen_random_uuid(),'Synthetic Grant Decider','decider-'||gen_random_uuid()::text||'@synthetic.shifaa.test','active')
          returning id`;
        await sql.begin(async (tx: any) => {
          await tx`select set_config('shifaa.person_id',${proposer!.id},true)`;
          await tx`
            insert into identity.admin_role_grants(
              person_id,role_code,status,valid_from,proposed_by
            ) values(${personId}::uuid,'support_admin','pending',now(),${proposer!.id}::uuid)`;
        });
        await sql.begin(async (tx: any) => {
          await tx`select set_config('shifaa.person_id',${decider!.id},true)`;
          await tx`
            update identity.admin_role_grants
            set status='active',decided_by=${decider!.id}::uuid
            where person_id=${personId}::uuid and role_code='support_admin' and status='pending'`;
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    async ownerSql<T>(work: (sql: any) => Promise<T>): Promise<T> {
      const sql = postgres(runtime.DB_URL, { max: 1 });
      try {
        return await work(sql);
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    inject: app.inject.bind(app),
    close: async () => {
      await app.close();
      await repository.close();
    },
  };
  return harness;
}
