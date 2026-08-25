import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_POSTGRES'] === 'true';

describe.skipIf(!enabled)('identity continuity standalone PostgreSQL compatibility', () => {
  it('migrates the continuity schema without fabricating a native Auth schema', async () => {
    const sql = postgres('postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa', {
      max: 1,
    });
    try {
      const [shape] = await sql`
        select
          to_regclass('identity.continuity_cases') is not null as continuity_table,
          to_regprocedure('platform.auth_session_is_current(uuid,uuid)') is null as native_helper_absent,
          not exists(select 1 from information_schema.schemata where schema_name='auth') as auth_schema_absent
      `;
      expect(shape).toEqual({
        continuity_table: true,
        native_helper_absent: true,
        auth_schema_absent: true,
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
