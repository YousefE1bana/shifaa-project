import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { LocalSyntheticMessagingAdapter } from '../../services/worker/src/adapters/local-synthetic-messaging.ts';
import { PostgresIdentityNotificationProcessor } from '../../services/worker/src/identity-continuity.ts';
import {
  authClient,
  buildMfaHarness,
  confirmedSignup,
  currentTotp,
  supabaseStatus,
} from '../../services/api/test/identity-continuity-mfa-harness.ts';

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_RECOVERY'] === 'true';
const workerUrl = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:54322/postgres';

async function mailboxIds(mailpitUrl: string, email: string): Promise<Set<string>> {
  const mailbox = await fetch(`${mailpitUrl}/api/v1/messages`).then(
    (response) =>
      response.json() as Promise<{
        messages?: Array<{ ID: string; To?: Array<{ Address: string }> }>;
      }>,
  );
  return new Set(
    mailbox.messages
      ?.filter((message) => message.To?.some((recipient) => recipient.Address === email))
      .map((message) => message.ID),
  );
}

async function recoveryOtp(mailpitUrl: string, email: string, knownIds: ReadonlySet<string>) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const mailbox = await fetch(`${mailpitUrl}/api/v1/messages`).then(
      (response) =>
        response.json() as Promise<{
          messages?: Array<{ ID: string; To?: Array<{ Address: string }> }>;
        }>,
    );
    const message = mailbox.messages?.find(
      (candidate) =>
        !knownIds.has(candidate.ID) && candidate.To?.some((to) => to.Address === email),
    );
    if (message) {
      const detail = await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`).then(
        (response) => response.json() as Promise<{ Text?: string }>,
      );
      const otp = /\b\d{6}\b/.exec(detail.Text ?? '')?.[0];
      if (otp) return otp;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('recovery-checkpoint-otp-missing');
}

test(
  'real recovery checkpoint returns a fresh native session and emits one safe patient notification',
  { skip: !enabled },
  async () => {
    const runtime = supabaseStatus();
    const harness = await buildMfaHarness(runtime);
    const adapter = new LocalSyntheticMessagingAdapter();
    const worker = new PostgresIdentityNotificationProcessor(
      workerUrl,
      adapter,
      'recovery-checkpoint',
    );
    const email = `recovery-checkpoint-${randomUUID()}@synthetic.shifaa.test`;
    const initialCredential = 'Synthetic-007-Checkpoint-Initial!';
    const replacementCredential = 'Synthetic-007-Checkpoint-Replaced!';
    try {
      const original = await confirmedSignup(runtime, email, initialCredential);
      await harness.seedPerson(original.userId, email);
      const enrollment = await harness.authAdapter.enrollTotp(
        original.accessToken,
        'Checkpoint factor',
      );
      await harness.authAdapter.verifyTotp(
        original.accessToken,
        enrollment.enrollmentId,
        currentTotp(enrollment.secret),
      );
      const knownIds = await mailboxIds(runtime.MAILPIT_URL, email);
      const started = await harness.inject({
        method: 'POST',
        url: '/v1/auth/recovery',
        headers: { 'idempotency-key': `recovery-checkpoint-start-${randomUUID()}` },
        payload: { handle: email, locale: 'en-EG' },
      });
      assert.equal(started.statusCode, 202, started.body);
      const intake = started.json<{ caseId: string; caseToken: string }>();
      const completed = await harness.inject({
        method: 'POST',
        url: `/v1/auth/recovery/${intake.caseId}/complete`,
        headers: { 'idempotency-key': `recovery-checkpoint-complete-${randomUUID()}` },
        payload: {
          caseToken: intake.caseToken,
          handle: email,
          recoveryOtp: await recoveryOtp(runtime.MAILPIT_URL, email, knownIds),
          proofMethod: 'bound_factor_independent_method',
          factorEvidence: currentTotp(enrollment.secret),
          newCredential: replacementCredential,
        },
      });
      assert.equal(completed.statusCode, 200, completed.body);
      const recovery = completed.json<{ status: string; session: { accessToken: string } }>();
      assert.equal(recovery.status, 'completed');
      assert.notEqual(recovery.session.accessToken, original.accessToken);
      assert.ok(
        (await authClient(runtime).auth.refreshSession({ refresh_token: original.refreshToken }))
          .error,
      );
      let persisted: Array<{
        field_values: Record<string, unknown>;
        payload: Record<string, unknown>;
      }> = [];
      for (let attempt = 0; attempt < 20 && persisted.length === 0; attempt += 1) {
        assert.equal(await worker.processNext(), 'delivered');
        persisted = await harness.ownerSql(
          (sql) => sql`
        select n.field_values,e.payload
        from platform.notifications n join platform.outbox_events e on e.id=n.source_event_id
        where e.aggregate_id=${intake.caseId}::uuid and e.event_type='identity.recovery.completed'`,
        );
      }
      assert.equal(persisted.length, 1);
      assert.ok(adapter.visibleMessages.size >= 1);
      assert.deepEqual(persisted[0].field_values, {
        action_time: persisted[0].field_values.action_time,
        support_action: 'completed',
      });
      assert.doesNotMatch(
        JSON.stringify(persisted),
        /otp|token|password|credential|proof|factor|handle|email|phone|diagnos/i,
      );
    } finally {
      await worker.close();
      await harness.close();
    }
  },
);
