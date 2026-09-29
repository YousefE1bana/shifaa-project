import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';

import { PostgresFeature010NotesRepository } from '../src/adapters/postgres/feature-010-notes.js';
import type { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';

const actor = {
  personId: 'f0100000-0000-4000-8000-000000000001',
  principal: 'synthetic-person:f0100000-0000-4000-8000-000000000001',
  requestId: 'f0100000-0000-4000-9000-000000000001',
  traceId: 'f0100000-0000-4000-9000-000000000001',
  aal: 2 as const,
  locale: 'en-EG' as const,
  purposes: ['appointment.scheduling'],
};
const encounterId = 'f0100000-0000-4000-8800-000000000001';
const body = 'Synthetic note body must never reach SQL as plaintext.';
const encryptionKey = Buffer.alloc(32, 23);

function transactionRepository(
  fakeSql: TransactionSql,
): Pick<PostgresIdentityRepository, 'withRawTransaction'> {
  return {
    withRawTransaction: async <T>(work: (sql: TransactionSql) => Promise<T>) => work(fakeSql),
  };
}

function signingSql(
  responseFactory: (protectedInput: Record<string, unknown>) => unknown,
  captured: unknown[][],
): TransactionSql {
  const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    captured.push(values);
    if (strings.join(' ').includes('sign_encounter_note_api_v1')) {
      const input = values.find(
        (value) => typeof value === 'object' && value !== null && 'bodyCiphertext' in value,
      ) as Record<string, unknown> | undefined;
      if (!input) throw new Error('adapter did not pass a protected note envelope');
      return [{ response: responseFactory(input) }];
    }
    return [];
  };
  return Object.assign(query, { json: (value: unknown) => value }) as unknown as TransactionSql;
}

function notesProjectionSql(notes: unknown[]): TransactionSql {
  const query = async (strings: TemplateStringsArray) => {
    return strings.join(' ').includes('feature_010_get_encounter_notes_projection_v1')
      ? [{ notes }]
      : [];
  };
  return Object.assign(query, { json: (value: unknown) => value }) as unknown as TransactionSql;
}

function protectedBody(plaintext: string): string {
  const iv = Buffer.alloc(12, 7);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

describe('Feature 010 note encryption adapter', () => {
  it('omits private predecessor identity from PAT/GUA/DEL projections but retains it for CLN', async () => {
    const privatePredecessorId = 'f0100000-0000-4000-8900-000000000099';
    const note = {
      id: 'f0100000-0000-4000-8900-000000000098',
      encounterId,
      authorId: actor.personId,
      noteType: 'assessment',
      visibility: 'patient_visible',
      signedAt: '2030-04-05T08:10:00.000Z',
      supersedesId: privatePredecessorId,
      bodyCiphertext: protectedBody('released synthetic note'),
    };
    const repository = new PostgresFeature010NotesRepository(
      transactionRepository(notesProjectionSql([note])),
      'local',
      encryptionKey,
    );
    for (const role of ['PAT', 'GUA', 'DEL'] as const) {
      const [subjectNote] = await repository.projectAuthorizedNotes(
        notesProjectionSql([note]),
        encounterId,
        role,
      );
      expect(subjectNote).toMatchObject({
        id: note.id,
        visibility: 'patient_visible',
        body: 'released synthetic note',
      });
      expect(subjectNote).not.toHaveProperty('supersedesId');
      expect(JSON.stringify(subjectNote)).not.toContain(privatePredecessorId);
    }

    const [careTeamNote] = await repository.projectAuthorizedNotes(
      notesProjectionSql([note]),
      encounterId,
      'CLN',
    );
    expect(careTeamNote).toHaveProperty('supersedesId', privatePredecessorId);
  });

  it('sends only ciphertext to SQL and decrypts the stored canonical response on replay', async () => {
    let storedResponse: Record<string, unknown> | undefined;
    const captured: unknown[][] = [];
    const sql = signingSql((input) => {
      storedResponse ??= {
        id: 'f0100000-0000-4000-8900-000000000001',
        encounterId,
        authorId: actor.personId,
        noteType: String(input['noteType']),
        visibility: String(input['visibility']),
        signedAt: '2030-04-05T08:10:00.000Z',
        bodyCiphertext: input['bodyCiphertext'],
      };
      return storedResponse;
    }, captured);
    const repository = new PostgresFeature010NotesRepository(
      transactionRepository(sql),
      'local',
      encryptionKey,
    );
    const context = {
      actor,
      idempotencyKey: 'f010-c12-adapter-key-0001',
      requestHash: 'a'.repeat(64),
    };
    const input = { noteType: 'assessment', body, visibility: 'private' as const };

    const first = await repository.signEncounterNote(context, encounterId, input);
    const replay = await repository.signEncounterNote(context, encounterId, input);

    expect(first).toEqual({
      id: 'f0100000-0000-4000-8900-000000000001',
      encounterId,
      authorId: actor.personId,
      noteType: 'assessment',
      visibility: 'private',
      signedAt: '2030-04-05T08:10:00.000Z',
      body,
    });
    expect(replay).toEqual(first);
    expect(JSON.stringify(captured)).not.toContain(body);
    expect(
      captured
        .flat()
        .some((value) => typeof value === 'object' && value !== null && 'bodyCiphertext' in value),
    ).toBe(true);
  });

  it('fails closed when SQL returns a malformed ciphertext envelope', async () => {
    const badCiphertext = Buffer.concat([
      Buffer.from([1]),
      Buffer.alloc(12),
      Buffer.alloc(16),
      Buffer.from('tampered'),
    ]).toString('base64');
    const sql = signingSql(
      (input) => ({
        id: 'f0100000-0000-4000-8900-000000000001',
        encounterId,
        authorId: actor.personId,
        noteType: String(input['noteType']),
        visibility: String(input['visibility']),
        signedAt: '2030-04-05T08:10:00.000Z',
        bodyCiphertext: badCiphertext,
      }),
      [],
    );
    const repository = new PostgresFeature010NotesRepository(
      transactionRepository(sql),
      'local',
      encryptionKey,
    );

    await expect(
      repository.signEncounterNote(
        { actor, idempotencyKey: 'f010-c12-adapter-key-0002', requestHash: 'b'.repeat(64) },
        encounterId,
        { noteType: 'assessment', body, visibility: 'private' },
      ),
    ).rejects.toThrow();
  });
});
