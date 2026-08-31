import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';

import { latestQualifyingFactorAt, SupabaseJwtVerifier } from '@shifaa/auth';
import { hasFreshQualifyingMfa } from '@shifaa/core';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { SupabaseAuthIssuer } from '../src/adapters/supabase-auth.js';

type SupabaseStatus = {
  API_URL: string;
  ANON_KEY: string;
  MAILPIT_URL: string;
};
type MailpitRecipient = { Address: string };
type MailpitSummary = { ID: string; Subject?: string; To?: MailpitRecipient[] };
type MailpitList = { messages: MailpitSummary[] };
type MailpitMessage = { Text?: string };

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_AUTH'] === 'true';
const password = 'Synthetic-007-Native-Auth!';
let status: SupabaseStatus;
let adapter: SupabaseAuthIssuer;

function readSupabaseStatus(): SupabaseStatus {
  const command =
    process.platform === 'win32'
      ? {
          file: process.env['ComSpec'] ?? 'cmd.exe',
          args: ['/d', '/s', '/c', 'corepack pnpm exec supabase status -o json'],
        }
      : { file: 'corepack', args: ['pnpm', 'exec', 'supabase', 'status', '-o', 'json'] };
  return JSON.parse(
    execFileSync(command.file, command.args, { encoding: 'utf8' }),
  ) as SupabaseStatus;
}

async function mailpitMessageIds(recipient: string): Promise<Set<string>> {
  const response = await fetch(`${status.MAILPIT_URL}/api/v1/messages`);
  if (!response.ok) throw new Error('Mailpit message list is unavailable.');
  const list = (await response.json()) as MailpitList;
  return new Set(
    list.messages
      .filter((message) => message.To?.some((address) => address.Address === recipient))
      .map((message) => message.ID),
  );
}

async function readMailpitCode(
  recipient: string,
  excludedIds = new Set<string>(),
): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listResponse = await fetch(`${status.MAILPIT_URL}/api/v1/messages`);
    if (!listResponse.ok) throw new Error('Mailpit message list is unavailable.');
    const list = (await listResponse.json()) as MailpitList;
    const summary = list.messages.find(
      (message) =>
        !excludedIds.has(message.ID) &&
        message.To?.some((address) => address.Address === recipient),
    );
    if (summary) {
      const messageResponse = await fetch(`${status.MAILPIT_URL}/api/v1/message/${summary.ID}`);
      if (!messageResponse.ok) throw new Error('Mailpit message is unavailable.');
      const message = (await messageResponse.json()) as MailpitMessage;
      const code = /\b\d{6}\b/.exec(message.Text ?? '')?.[0];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Mailpit confirmation code was not delivered.');
}

async function readMailpitMessage(
  recipient: string,
  excludedIds: ReadonlySet<string>,
): Promise<{ summary: MailpitSummary; message: MailpitMessage }> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listResponse = await fetch(`${status.MAILPIT_URL}/api/v1/messages`);
    if (!listResponse.ok) throw new Error('Mailpit message list is unavailable.');
    const list = (await listResponse.json()) as MailpitList;
    const summary = list.messages.find(
      (message) =>
        !excludedIds.has(message.ID) &&
        message.To?.some((address) => address.Address === recipient),
    );
    if (summary) {
      const messageResponse = await fetch(`${status.MAILPIT_URL}/api/v1/message/${summary.ID}`);
      if (!messageResponse.ok) throw new Error('Mailpit message is unavailable.');
      return { summary, message: (await messageResponse.json()) as MailpitMessage };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Mailpit recovery message was not delivered.');
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

function currentTotp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, '0');
}

function authClient(): SupabaseClient {
  return createClient(status.API_URL, status.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function createConfirmedSession(prefix: string): Promise<{
  client: SupabaseClient;
  email: string;
  session: Session;
}> {
  const email = `${prefix}-${randomUUID()}@synthetic.shifaa.test`;
  const client = authClient();
  const signup = await client.auth.signUp({ email, password });
  if (signup.error) throw signup.error;
  const confirmation = await client.auth.verifyOtp({
    email,
    token: await readMailpitCode(email),
    type: 'signup',
  });
  if (confirmation.error || !confirmation.data.session) {
    throw confirmation.error ?? new Error('Confirmed native session is missing.');
  }
  return { client, email, session: confirmation.data.session };
}

async function createVerifiedTotpSession(prefix: string) {
  const native = await createConfirmedSession(prefix);
  const enrollment = await adapter.enrollTotp(
    native.session.access_token,
    'Synthetic authenticator',
  );
  const verification = await adapter.verifyTotp(
    native.session.access_token,
    enrollment.enrollmentId,
    currentTotp(enrollment.secret),
  );
  return {
    native,
    enrollment,
    factor: verification.factor,
    verified: {
      access_token: verification.session.accessToken,
      refresh_token: verification.session.refreshToken!,
    },
  };
}

beforeAll(async () => {
  status = readSupabaseStatus();
  adapter = new SupabaseAuthIssuer({
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    jwksUrl: `${status.API_URL}/auth/v1/.well-known/jwks.json`,
    issuer: `${status.API_URL}/auth/v1`,
    audience: 'authenticated',
  });
  await adapter.ready();
});

describe.skipIf(!enabled).sequential('007 native Supabase Auth adapter', () => {
  it('rotates refresh tokens while accepting benign reuse inside the native interval', async () => {
    const first = await createConfirmedSession('native-session');
    const rotated = await adapter.refresh(first.session.refresh_token);
    expect(rotated.refreshToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(first.session.refresh_token);

    const benignReuse = await adapter.refresh(first.session.refresh_token);
    expect(benignReuse.sessionId).toBe(rotated.sessionId);
  });

  it('revokes only the current session locally and all sessions globally', async () => {
    const first = await createConfirmedSession('native-logout');
    const secondClient = authClient();
    const secondLogin = await secondClient.auth.signInWithPassword({
      email: first.email,
      password,
    });
    if (secondLogin.error || !secondLogin.data.session) {
      throw secondLogin.error ?? new Error('Second native session is missing.');
    }

    await adapter.logout(first.session.access_token, 'local');
    await expect(adapter.refresh(first.session.refresh_token)).rejects.toMatchObject({
      code: 'session-expired',
    });
    const secondRefresh = await adapter.refresh(secondLogin.data.session.refresh_token);
    await adapter.logout(secondRefresh.accessToken, 'global');
    await expect(adapter.refresh(secondRefresh.refreshToken!)).rejects.toMatchObject({
      code: 'session-expired',
    });
  });

  it('projects one verified TOTP factor without its native secret', async () => {
    const { native, enrollment, factor, verified } = await createVerifiedTotpSession('native-mfa');

    expect(factor).toMatchObject({
      id: enrollment.enrollmentId,
      type: 'totp',
      status: 'verified',
      friendlyName: 'Synthetic authenticator',
    });
    expect(factor).not.toHaveProperty('secret');
    expect(factor).not.toHaveProperty('qrUri');
    expect(await adapter.listFactors(native.session.access_token)).toEqual([factor]);

    const verifier = new SupabaseJwtVerifier(
      `${status.API_URL}/auth/v1/.well-known/jwks.json`,
      `${status.API_URL}/auth/v1`,
      'authenticated',
    );
    const claims = await verifier.verify(verified.access_token);
    const factorAt = claims ? latestQualifyingFactorAt(claims.amr) : undefined;
    expect(claims?.aal).toBe(2);
    expect(factorAt).toBeTypeOf('number');
    expect(hasFreshQualifyingMfa(299, 'aal2')).toBe(true);
    expect(hasFreshQualifyingMfa(300, 'aal2')).toBe(true);
    expect(hasFreshQualifyingMfa(301, 'aal2')).toBe(false);
  });

  it('recomputes assurance after a verified factor is removed', async () => {
    const { enrollment, verified } = await createVerifiedTotpSession('native-removal');

    await adapter.unenrollFactor(verified.access_token, enrollment.enrollmentId);
    const downgraded = await adapter.refresh(verified.refresh_token);
    expect(downgraded.assurance).toBe('aal1');
    expect(await adapter.listFactors(downgraded.accessToken)).toEqual([]);
  });

  it('uses only public recovery and user-context credential replacement', async () => {
    const native = await createConfirmedSession('native-recovery');
    const existingMessageIds = await mailpitMessageIds(native.email);

    await expect(adapter.startRecovery(native.email)).resolves.toBeUndefined();
    await expect(
      adapter.startRecovery(`missing-${randomUUID()}@synthetic.shifaa.test`),
    ).resolves.toBeUndefined();

    const recovery = await readMailpitMessage(native.email, existingMessageIds);
    const recoveryOtp = /\b\d{6}\b/.exec(recovery.message.Text ?? '')?.[0];
    expect(recoveryOtp).toBeTruthy();
    expect(recovery.message.Text).not.toContain('/auth/v1/verify');
    const recoverySession = await adapter.redeemRecoveryOtp(native.email, recoveryOtp!);
    expect(recoverySession.subjectId).toBe(native.session.user.id);
    expect(recoverySession.handle).toBe(native.email);
    await expect(adapter.redeemRecoveryOtp(native.email, recoveryOtp!)).rejects.toMatchObject({
      code: 'recovery-challenge-invalid',
      status: 401,
    });

    const replacement = 'Synthetic-007-Recovered-Auth!';
    await adapter.updateRecoveredCredential(recoverySession.session.accessToken, replacement);

    const fresh = await adapter.signInWithPassword(native.email, replacement);
    expect(fresh.accessToken).not.toBe(recoverySession.session.accessToken);
  });
});
