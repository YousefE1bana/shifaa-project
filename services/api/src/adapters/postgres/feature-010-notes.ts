import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { Value } from '@sinclair/typebox/value';
import {
  CareTeamNoteProjectionSchema,
  SubjectNoteProjectionSchema,
  type CareTeamNoteProjection,
  type Feature010Uuid,
  type SignEncounterNoteRequest,
  type SubjectNoteProjection,
} from '@shifaa/contracts';

import type {
  Feature010EncounterActor,
  Feature010EncounterMutationContext,
} from '../../modules/feature-010/encounters.js';
import type { Feature010NotesRepository } from '../../modules/feature-010/notes.js';
import type { PostgresIdentityRepository } from './identity-repository.js';

type RawTransactionRepository = Pick<PostgresIdentityRepository, 'withRawTransaction'>;

function encryptBody(body: string, key: Uint8Array): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), iv);
  const ciphertext = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

function decryptBody(encoded: unknown, key: Uint8Array): string {
  if (typeof encoded !== 'string') throw new Error('Feature 010 note ciphertext is unavailable.');
  const normalized = encoded.replace(/\s/g, '');
  const envelope = Buffer.from(normalized, 'base64');
  if (envelope.byteLength < 30 || envelope[0] !== 1 || envelope.toString('base64') !== normalized) {
    throw new Error('Feature 010 note ciphertext envelope is invalid.');
  }
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), envelope.subarray(1, 13));
  decipher.setAuthTag(envelope.subarray(13, 29));
  return Buffer.concat([decipher.update(envelope.subarray(29)), decipher.final()]).toString('utf8');
}

function parseProtectedNote(
  raw: unknown,
  key: Uint8Array,
  subjectProjection: boolean,
): CareTeamNoteProjection | SubjectNoteProjection {
  let value = raw;
  if (typeof value === 'string') value = JSON.parse(value) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Feature 010 signed note response is unavailable.');
  }
  const projection = { ...(value as Record<string, unknown>) };
  projection['body'] = decryptBody(projection['bodyCiphertext'], key);
  delete projection['bodyCiphertext'];
  if (subjectProjection) delete projection['supersedesId'];
  const schema = subjectProjection ? SubjectNoteProjectionSchema : CareTeamNoteProjectionSchema;
  if (!Value.Check(schema, projection)) {
    throw new Error('Feature 010 signed note response is invalid.');
  }
  return projection as CareTeamNoteProjection;
}

/** The note adapter owns ciphertext handling; SQL owns signing authority and atomic effects. */
export class PostgresFeature010NotesRepository implements Feature010NotesRepository {
  public constructor(
    private readonly repository: RawTransactionRepository,
    private readonly environment: 'local' | 'ci' | 'production',
    private readonly encryptionKey: Uint8Array,
  ) {
    if (Buffer.from(encryptionKey).byteLength !== 32) {
      throw new Error('Feature 010 note encryption requires the configured 32-byte identity key.');
    }
  }

  public async projectAuthorizedNotes(
    sql: TransactionSql,
    encounterId: Feature010Uuid,
    actorRole: 'PAT' | 'GUA' | 'DEL' | 'CLN',
  ): Promise<Array<CareTeamNoteProjection | SubjectNoteProjection>> {
    const [row] = await sql<{ notes: unknown }[]>`
      select clinical.feature_010_get_encounter_notes_projection_v1(${encounterId}::uuid) as notes
    `;
    let notes: unknown = row?.notes;
    if (typeof notes === 'string') notes = JSON.parse(notes) as unknown;
    if (!Array.isArray(notes)) {
      throw new Error('Feature 010 authorized note projection is unavailable.');
    }
    return notes.map((note) => parseProtectedNote(note, this.encryptionKey, actorRole !== 'CLN'));
  }

  public async signEncounterNote(
    context: Feature010EncounterMutationContext,
    encounterId: Feature010Uuid,
    input: SignEncounterNoteRequest,
  ): Promise<CareTeamNoteProjection> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.setActor(sql, context.actor, 'signEncounterNote', 'CLN');
      await sql`
        select set_config('shifaa.idempotency_key',${context.idempotencyKey},true),
          set_config('shifaa.request_hash',${context.requestHash},true)
      `;
      const protectedInput = {
        noteType: input.noteType,
        visibility: input.visibility,
        ...(input.supersedesId === undefined ? {} : { supersedesId: input.supersedesId }),
        bodyCiphertext: encryptBody(input.body, this.encryptionKey),
      };
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.sign_encounter_note_api_v1(
          ${encounterId}::uuid,${sql.json(protectedInput)}::jsonb
        ) as response
      `;
      return parseProtectedNote(row?.response, this.encryptionKey, false) as CareTeamNoteProjection;
    });
  }

  private setActor(
    sql: TransactionSql,
    actor: Feature010EncounterActor,
    action: 'signEncounterNote',
    role: 'CLN',
  ) {
    return sql`
      select set_config('shifaa.person_id',${actor.personId},true),
        set_config('shifaa.principal',${actor.principal},true),
        set_config('shifaa.request_id',${actor.requestId},true),
        set_config('shifaa.trace_id',${actor.traceId},true),
        set_config('shifaa.aal',${String(actor.aal)},true),
        set_config('shifaa.actor_role',${role},true),
        set_config('shifaa.action',${action},true),
        set_config('shifaa.purposes',${actor.purposes.join(',')},true),
        set_config('shifaa.environment',${this.environment},true),
        set_config('statement_timeout','5000',true),
        set_config('lock_timeout','2000',true)
    `;
  }
}
