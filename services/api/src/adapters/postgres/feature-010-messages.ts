import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import type { TransactionSql } from 'postgres';
import { Value } from '@sinclair/typebox/value';
import {
  MessagePageSchema,
  MessageProjectionSchema,
  type Feature010Uuid,
  type ListContextMessagesQuery,
  type MessagePage,
  type MessageProjection,
  type SendContextMessageRequest,
} from '@shifaa/contracts';

import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import type {
  Feature010EncounterActor,
  Feature010EncounterMutationContext,
} from '../../modules/feature-010/encounters.js';
import type { Feature010MessagesRepository } from '../../modules/feature-010/messages.js';
import type { PostgresIdentityRepository } from './identity-repository.js';

type RawTransactionRepository = Pick<PostgresIdentityRepository, 'withRawTransaction'>;

interface MessageCursor {
  readonly version: 1;
  readonly contextId: Feature010Uuid;
  readonly sentAt: string;
  readonly id: Feature010Uuid;
}

function encryptBody(body: string, key: Uint8Array): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), iv);
  const ciphertext = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

function decryptBody(encoded: unknown, key: Uint8Array): string {
  if (typeof encoded !== 'string')
    throw new Error('Feature 010 message ciphertext is unavailable.');
  const normalized = encoded.replace(/\s/g, '');
  const envelope = Buffer.from(normalized, 'base64');
  if (envelope.byteLength < 30 || envelope[0] !== 1 || envelope.toString('base64') !== normalized) {
    throw new Error('Feature 010 message ciphertext envelope is invalid.');
  }
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), envelope.subarray(1, 13));
  decipher.setAuthTag(envelope.subarray(13, 29));
  return Buffer.concat([decipher.update(envelope.subarray(29)), decipher.final()]).toString('utf8');
}

function parseJson(raw: unknown): unknown {
  return typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
}

function parseMessage(raw: unknown, key: Uint8Array): MessageProjection {
  const protectedProjection = parseJson(raw);
  if (
    typeof protectedProjection !== 'object' ||
    protectedProjection === null ||
    Array.isArray(protectedProjection)
  ) {
    throw new Error('Feature 010 message response is unavailable.');
  }
  const projection = { ...(protectedProjection as Record<string, unknown>) };
  projection['body'] = decryptBody(projection['bodyCiphertext'], key);
  delete projection['bodyCiphertext'];
  if (!Value.Check(MessageProjectionSchema, projection)) {
    throw new Error('Feature 010 message response is invalid.');
  }
  return projection as MessageProjection;
}

function invalidCursor(): never {
  throw new ApiPolicyError('validation-failed', 422, 'The message cursor is invalid.');
}

function parseCursor(
  cursor: string | undefined,
  contextId: Feature010Uuid,
  key: Buffer,
): MessageCursor | undefined {
  if (cursor === undefined) return undefined;
  const [payload, signature, extra] = cursor.split('.');
  if (!payload || !signature || extra !== undefined || cursor.length > 512) return invalidCursor();
  const expected = createHmac('sha256', key).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (
    supplied.toString('base64url') !== signature ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return invalidCursor();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
  } catch {
    return invalidCursor();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>)['version'] !== 1 ||
    (parsed as Record<string, unknown>)['contextId'] !== contextId ||
    typeof (parsed as Record<string, unknown>)['sentAt'] !== 'string' ||
    Number.isNaN(Date.parse((parsed as Record<string, unknown>)['sentAt'] as string)) ||
    typeof (parsed as Record<string, unknown>)['id'] !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      (parsed as Record<string, unknown>)['id'] as string,
    )
  ) {
    return invalidCursor();
  }
  return parsed as MessageCursor;
}

function encodeCursor(cursor: MessageCursor, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
}

/** SQL owns live authorization and atomic effects; this adapter handles ciphertext only. */
export class PostgresFeature010MessagesRepository implements Feature010MessagesRepository {
  private readonly cursorKey: Buffer;

  public constructor(
    private readonly repository: RawTransactionRepository,
    private readonly environment: 'local' | 'ci' | 'production',
    private readonly encryptionKey: Uint8Array,
  ) {
    if (Buffer.from(encryptionKey).byteLength !== 32) {
      throw new Error(
        'Feature 010 message encryption requires the configured 32-byte identity key.',
      );
    }
    this.cursorKey = createHash('sha256').update(encryptionKey).digest();
  }

  public listContextMessages(
    actor: Feature010EncounterActor,
    _contextType: 'appointment',
    contextId: Feature010Uuid,
    query: ListContextMessagesQuery,
  ): Promise<MessagePage> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.setActor(sql, actor, 'listContextMessages');
      await this.resolveParticipantRole(sql, 'listContextMessages', contextId);
      const cursor = parseCursor(query.cursor, contextId, this.cursorKey);
      const limit = query.limit ?? 25;
      const rows = await sql<{ projection: unknown }[]>`
        select projection
        from trust.list_context_messages_api_v1(
          ${contextId}::uuid,${cursor?.sentAt ?? null}::timestamptz,
          ${cursor?.id ?? null}::uuid,${limit + 1}::integer
        )
      `;
      const hasMore = rows.length > limit;
      const visibleRows = rows.slice(0, limit);
      const messages = visibleRows.map((row) => parseMessage(row.projection, this.encryptionKey));
      const last = messages.at(-1);
      const page: MessagePage = {
        data: messages,
        meta: {
          nextCursor:
            hasMore && last
              ? encodeCursor(
                  { version: 1, contextId, sentAt: last.sentAt, id: last.id },
                  this.cursorKey,
                )
              : null,
          lastUpdatedAt: new Date().toISOString(),
          stale: false,
        },
      };
      if (!Value.Check(MessagePageSchema, page))
        throw new Error('Feature 010 message page is invalid.');
      return page;
    });
  }

  public sendContextMessage(
    context: Feature010EncounterMutationContext,
    _contextType: 'appointment',
    contextId: Feature010Uuid,
    input: SendContextMessageRequest,
  ): Promise<MessageProjection> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.setActor(sql, context.actor, 'sendContextMessage');
      await this.resolveParticipantRole(sql, 'sendContextMessage', contextId);
      await sql`
        select set_config('shifaa.idempotency_key',${context.idempotencyKey},true),
          set_config('shifaa.request_hash',${context.requestHash},true)
      `;
      const response = {
        bodyCiphertext: encryptBody(input.body, this.encryptionKey),
      };
      const [row] = await sql<{ response: unknown }[]>`
        select trust.send_context_message_api_v1(
          ${contextId}::uuid,${sql.json(response)}::jsonb
        ) as response
      `;
      return parseMessage(row?.response, this.encryptionKey);
    });
  }

  private setActor(
    sql: TransactionSql,
    actor: Feature010EncounterActor,
    action: 'listContextMessages' | 'sendContextMessage',
  ) {
    return sql`
      select set_config('shifaa.person_id',${actor.personId},true),
        set_config('shifaa.principal',${actor.principal},true),
        set_config('shifaa.request_id',${actor.requestId},true),
        set_config('shifaa.trace_id',${actor.traceId},true),
        set_config('shifaa.aal',${String(actor.aal)},true),
        set_config('shifaa.actor_role','',true),
        set_config('shifaa.action',${action},true),
        set_config('shifaa.purposes',${actor.purposes.join(',')},true),
        set_config('shifaa.environment',${this.environment},true),
        set_config('statement_timeout','5000',true),
        set_config('lock_timeout','2000',true)
    `;
  }

  private async resolveParticipantRole(
    sql: TransactionSql,
    action: 'listContextMessages' | 'sendContextMessage',
    contextId: Feature010Uuid,
  ): Promise<void> {
    for (const role of ['PAT', 'CLN'] as const) {
      await sql`select set_config('shifaa.actor_role',${role},true)`;
      const [authorization] = await sql<{ authorized: boolean }[]>`
        select clinical.feature_010_authorize_v1(${action},${contextId}::uuid) as authorized
      `;
      if (authorization?.authorized === true) return;
    }
    throw new ApiPolicyError(
      'forbidden',
      403,
      'The actor or appointment context is not authorized.',
    );
  }
}
