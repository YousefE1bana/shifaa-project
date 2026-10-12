import { describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { PostgresFeature011Allergies } from './feature-011-allergies.js';

function harness(session = 'shifaa_api') {
  const calls: { text: string; args: unknown[] }[] = [];
  const tx = Object.assign(
    async (text: TemplateStringsArray, ...args: unknown[]) => {
      const query = text.join('');
      calls.push({ text: query, args });
      if (query.includes('session_user')) return [{ session, current: session }];
      if (query.includes('list_allergies_api_v1'))
        return [{ result: { view: 'current', data: [], meta: {}, continuation: null } }];
      return [];
    },
    { array: (value: unknown) => value, json: (value: unknown) => value },
  );
  const pool = { begin: (work: (tx: unknown) => Promise<unknown>) => work(tx) };
  const repository = new PostgresFeature011Allergies(pool as unknown as Sql, Buffer.alloc(32, 1));
  const scope = {
    actor: {
      kind: 'PAT' as const,
      subjectId: 'f0110000-0000-4000-8000-000000000003',
      personId: 'f0110000-0000-4000-8000-000000000001',
      requestId: 'f0110000-0000-4000-8000-000000000002',
      principal: 'synthetic',
      aal: 2 as const,
      locale: 'ar-EG' as const,
      purposes: ['current_care'],
    },
    role: 'PAT' as const,
  };
  return { repository, calls, scope };
}

describe('allergy read transaction overhead and authority boundary', () => {
  it('sets all context in one round trip before the narrow read, including empty scope resets', async () => {
    const { repository, calls, scope } = harness();
    await repository.read(scope, 'f0110000-0000-4000-8100-000000000001', {});
    // Bound setup overhead per protected read; never remove row reauthorization.
    expect(calls).toHaveLength(3);
    expect(calls[0]!.text).toContain('session_user');
    expect(calls[1]!.text).toContain('set_config');
    expect(calls[1]!.text).toContain('true');
    expect(calls[1]!.args).toEqual([
      [
        'environment',
        'person_id',
        'actor_role',
        'aal',
        'purposes',
        'facility_id',
        'encounter_id',
        'request_id',
        'action',
      ].map((n) => 'shifaa.' + n),
      [
        'local',
        scope.actor.personId,
        'PAT',
        '2',
        'current_care',
        '',
        '',
        scope.actor.requestId,
        'listAllergies',
      ],
    ]);
    expect(calls[2]!.text).toContain('clinical.list_allergies_api_v1');
  });

  it.each(['shifaa_owner', 'service_role', 'shifaa_worker'])(
    'rejects %s before context or resource queries',
    async (session) => {
      const { repository, calls, scope } = harness(session);
      await expect(
        repository.read(scope, 'f0110000-0000-4000-8100-000000000001', {}),
      ).rejects.toThrow('Online principal is not authorized');
      expect(calls).toHaveLength(1);
    },
  );
});
