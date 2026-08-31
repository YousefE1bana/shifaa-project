import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../../../supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql',
    import.meta.url,
  ),
  'utf8',
);
const adapter = fs.readFileSync(
  new URL('../src/adapters/postgres/identity-continuity-service.ts', import.meta.url),
  'utf8',
);

describe('dependent transition persistence contract', () => {
  it('uses the frozen March 1 civil anniversary for a non-leap target year', () => {
    expect(migration).toContain('extract(month from p_birth_date)=2');
    expect(migration).toContain('extract(day from p_birth_date)=29');
    expect(migration).toContain('make_date(extract(year from p_birth_date)::integer+21,3,1)');
  });

  it('purges expired transition replay rows before reserving a reused key', () => {
    expect(adapter).toMatch(/delete from platform\.idempotency_records[\s\S]*TRANSITION_ROUTE/);
    expect(adapter).toContain('expires_at<=');
  });

  it('binds repeated identity proof to the current recovery case and post-intake time', () => {
    expect(adapter).toContain('r.id=${input.recoveryCaseId}::uuid');
    expect(adapter).toContain("r.case_type='account_recovery'");
    expect(adapter).toContain('r.subject_person_id=${input.personId}::uuid');
    expect(adapter).toContain('c.created_at>=r.created_at');
  });
});
