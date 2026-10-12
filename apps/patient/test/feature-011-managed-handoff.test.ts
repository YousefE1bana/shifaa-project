import assert from 'node:assert/strict';
import test from 'node:test';
import { patientAccessTokens } from '../src/patient-auth-store';

test('existing authorized F004 selection retains managed ID and purpose; invalid context clears and never bootstraps', async () => {
  const actor = 'f0110000-0000-4000-8000-000000000004',
    managed = 'f0110000-0000-4000-8100-000000000001';
  const original = globalThis.fetch;
  let rows: Record<string, unknown>[] = [],
    actorId = actor;
  const seen: { url: string; purpose: string | null }[] = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), purpose: new Headers(init?.headers).get('x-purpose') });
    const json = String(url).endsWith('/people/me')
      ? {
          id: actorId,
          managedPatientId: null,
          display_name: 'Synthetic',
          birth_date: null,
          nationality_code: 'EG',
          preferred_locale: 'en-EG',
          verification_status: 'unverified',
          version: 1,
        }
      : { items: rows, next_cursor: null };
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const context = await import('../src/managed-care-context');
  const row = {
    id: 'f0110000-0000-4000-8600-000000000001',
    managed_patient_id: managed,
    actor_person_id: actor,
    relationship_type: 'delegation',
    status: 'active',
    permissions: ['record.view'],
    purpose_code: 'family_support',
    valid_from: '2020-01-01T00:00:00Z',
    valid_until: '2099-12-31T00:00:00Z',
  };
  try {
    patientAccessTokens.write('synthetic-boundary-only');
    context.clearManagedCareContext();
    await assert.rejects(() =>
      context.revalidateManagedCareContext('en-EG', 'https://synthetic.invalid'),
    );
    assert.equal(seen.length, 0);
    for (const type of ['delegation', 'guardianship']) {
      rows = [{ ...row, relationship_type: type }];
      context.retainManagedRelationship(rows[0]);
      const actual = await context.revalidateManagedCareContext(
        'en-EG',
        'https://synthetic.invalid',
      );
      assert.equal(actual.managedPatientId, managed);
      assert.notEqual(actual.managedPatientId, actor);
      assert.equal(actual.role, type === 'delegation' ? 'DEL' : 'GUA');
      assert.equal(actual.purpose, 'family_support');
      assert.equal(seen.at(-1)?.purpose, 'family_support');
      assert.match(seen.at(-1)!.url, new RegExp(`/patients/${managed}/relationships`));
    }
    for (const changed of [
      { status: 'revoked' },
      { actor_person_id: crypto.randomUUID() },
      { managed_patient_id: crypto.randomUUID() },
      { permissions: [] },
      { valid_until: '2020-01-01T00:00:00Z' },
      { purpose_code: 'unrelated-purpose' },
    ]) {
      context.retainManagedRelationship(row);
      rows = [{ ...row, ...changed }];
      await assert.rejects(() =>
        context.revalidateManagedCareContext('en-EG', 'https://synthetic.invalid'),
      );
      assert.equal(context.currentManagedCareContext(), null);
    }
    context.retainManagedRelationship(row);
    rows = [row];
    actorId = crypto.randomUUID();
    const before = seen.filter((r) => r.url.includes('/relationships')).length;
    await assert.rejects(() =>
      context.revalidateManagedCareContext('en-EG', 'https://synthetic.invalid'),
    );
    assert.equal(seen.filter((r) => r.url.includes('/relationships')).length, before);
    assert.equal(context.currentManagedCareContext(), null);
  } finally {
    globalThis.fetch = original;
    patientAccessTokens.clear();
    context.clearManagedCareContext();
  }
});
