import { createCipheriv, randomBytes } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { describe, expect, it } from 'vitest';
import type {
  Feature010Uuid,
  MessageProjection,
  SendContextMessageRequest,
} from '@shifaa/contracts';

import { PostgresFeature010MessagesRepository } from '../src/adapters/postgres/feature-010-messages.js';
import type { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';
import type {
  Feature010EncounterActor,
  Feature010EncounterMutationContext,
} from '../src/modules/feature-010/encounters.js';

const personId = 'f0100000-0000-4000-8000-000000000003' as Feature010Uuid;
const appointmentId = 'f0100000-0000-4000-8500-000000000001' as Feature010Uuid;
const messageId = 'f0100000-0000-4000-8900-000000000001' as Feature010Uuid;
const messageBody = 'Synthetic encrypted appointment message.';
const encryptionKey = Buffer.alloc(32, 23);
const actor: Feature010EncounterActor = {
  personId,
  principal: `synthetic-person:${personId}`,
  requestId: 'f0100000-0000-4000-8000-000000000099',
  traceId: 'f0100000000040008000000000000099',
  aal: 2,
  locale: 'en-EG',
  purposes: ['clinical.care'],
};

function encryptFixtureBody(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

function protectedProjection(
  body = messageBody,
  id = messageId,
  sentAt = '2030-04-05T08:10:00.123456Z',
): Record<string, unknown> {
  const ciphertext = encryptFixtureBody(body);
  return {
    id,
    contextType: 'appointment',
    contextId: appointmentId,
    senderId: personId,
    bodyCiphertext: ciphertext.match(/.{1,40}/g)?.join('\n'),
    sentAt,
  };
}

interface SqlCall {
  readonly statement: string;
  readonly values: readonly unknown[];
}

function sqlFor(
  calls: SqlCall[],
  options: {
    readonly authorizedRole?: 'PAT' | 'CLN';
    readonly pageRows?: unknown[];
    readonly sendResponse?: unknown;
  },
): TransactionSql {
  let actorRole = '';
  const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = strings.join(' ');
    calls.push({ statement, values });
    if (statement.includes("set_config('shifaa.actor_role'")) {
      actorRole = String(values[0]);
      return [];
    }
    if (statement.includes('clinical.feature_010_authorize_v1')) {
      return [{ authorized: actorRole === options.authorizedRole }];
    }
    if (statement.includes('trust.list_context_messages_api_v1')) {
      const afterSentAt = values[1];
      const afterId = values[2];
      return (options.pageRows ?? [])
        .filter((row) => {
          if (typeof afterSentAt !== 'string' || typeof afterId !== 'string') return true;
          const projection = (row as { projection: Record<string, unknown> }).projection;
          return projection['sentAt'] === afterSentAt
            ? String(projection['id']) < afterId
            : String(projection['sentAt']) < afterSentAt;
        })
        .slice(0, Number(values[3]));
    }
    if (statement.includes('trust.send_context_message_api_v1'))
      return [{ response: options.sendResponse }];
    return [];
  };
  return Object.assign(query, { json: (value: unknown) => value }) as unknown as TransactionSql;
}

function repositoryFor(sql: TransactionSql) {
  const transactionRepository: Pick<PostgresIdentityRepository, 'withRawTransaction'> = {
    withRawTransaction: async <T>(work: (transaction: TransactionSql) => Promise<T>) => work(sql),
  };
  return new PostgresFeature010MessagesRepository(transactionRepository, 'ci', encryptionKey);
}

describe('PostgreSQL Feature 010 message encryption boundary', () => {
  it('decrypts only SQL-authorized projections and scopes page cursors to one appointment', async () => {
    const calls: SqlCall[] = [];
    const rows = [
      { projection: protectedProjection() },
      {
        projection: {
          ...protectedProjection(
            'Another synthetic message.',
            'f0100000-0000-4000-8900-000000000002',
            '2030-04-05T08:09:00.123456Z',
          ),
        },
      },
    ];
    const repository = repositoryFor(sqlFor(calls, { authorizedRole: 'CLN', pageRows: rows }));
    const page = await repository.listContextMessages(actor, 'appointment', appointmentId, {
      limit: 1,
    });

    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.body).toBe(messageBody);
    expect(page.meta.nextCursor).toBeTypeOf('string');
    expect(page.meta.nextCursor).not.toContain(messageBody);
    expect(
      calls.filter((call) => call.statement.includes('clinical.feature_010_authorize_v1')),
    ).toHaveLength(2);
    expect(
      calls.some((call) => call.statement.includes('trust.list_context_messages_api_v1')),
    ).toBe(true);

    const nextPage = await repository.listContextMessages(actor, 'appointment', appointmentId, {
      cursor: page.meta.nextCursor!,
      limit: 1,
    });
    expect(nextPage.data[0]?.body).toBe('Another synthetic message.');
    const secondPageCall = calls
      .filter((call) => call.statement.includes('trust.list_context_messages_api_v1'))
      .at(-1);
    expect(secondPageCall?.values.slice(1, 3)).toEqual(['2030-04-05T08:10:00.123456Z', messageId]);
    await expect(
      repository.listContextMessages(actor, 'appointment', 'f0100000-0000-4000-8500-000000000002', {
        cursor: page.meta.nextCursor!,
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: 'validation-failed', status: 422 });
  });

  it('encrypts the body before SQL, stores no attachment field and decrypts the canonical protected response', async () => {
    const calls: SqlCall[] = [];
    const response = protectedProjection();
    const repository = repositoryFor(
      sqlFor(calls, { authorizedRole: 'PAT', sendResponse: response }),
    );
    const mutation: Feature010EncounterMutationContext = {
      actor,
      idempotencyKey: 'f010-c22-message-key-001',
      requestHash: 'a'.repeat(64),
    };
    const input: SendContextMessageRequest = { body: messageBody };
    const projected: MessageProjection = await repository.sendContextMessage(
      mutation,
      'appointment',
      appointmentId,
      input,
    );
    const sendCall = calls.find((call) =>
      call.statement.includes('trust.send_context_message_api_v1'),
    );
    const protectedRequest = sendCall?.values[1] as Record<string, unknown>;

    expect(projected.body).toBe(messageBody);
    expect(protectedRequest).toHaveProperty('bodyCiphertext');
    expect(protectedRequest).not.toHaveProperty('attachment');
    expect(JSON.stringify(protectedRequest)).not.toContain(messageBody);
    expect(JSON.stringify(calls)).not.toContain(messageBody);
  });

  it('makes unauthorized roles fail closed before returning any page', async () => {
    const calls: SqlCall[] = [];
    const repository = repositoryFor(sqlFor(calls, { pageRows: [] }));
    const guardian = {
      ...actor,
      personId: 'f0100000-0000-4000-8000-000000000004' as Feature010Uuid,
    };

    await expect(
      repository.listContextMessages(guardian, 'appointment', appointmentId, {}),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    expect(
      calls.some((call) => call.statement.includes('trust.list_context_messages_api_v1')),
    ).toBe(false);
  });
});
