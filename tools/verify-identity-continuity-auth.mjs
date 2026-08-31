import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import postgres from 'postgres';

const root = process.cwd();
const rootRequire = createRequire(resolve(root, 'package.json'));
const apiRequire = createRequire(resolve(root, 'services/api/package.json'));
const { createClient } = apiRequire('@supabase/supabase-js');
const configText = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
const packageJson = apiRequire('@supabase/supabase-js/package.json');
const supabasePackageJson = rootRequire('supabase/package.json');
const failures = [];

function requireConfig(pattern, description) {
  if (!pattern.test(configText)) failures.push(`config mismatch: ${description}`);
}

requireConfig(/^jwt_expiry\s*=\s*900\s*$/m, 'jwt_expiry must be 900 seconds');
requireConfig(/^enable_refresh_token_rotation\s*=\s*true\s*$/m, 'refresh rotation must be enabled');
requireConfig(
  /^refresh_token_reuse_interval\s*=\s*10\s*$/m,
  'refresh reuse interval must be 10 seconds',
);
requireConfig(/^\[auth\.sessions\][\s\S]*?^timebox\s*=\s*"23h45m"\s*$/m, 'session timebox');
requireConfig(
  /^\[auth\.sessions\][\s\S]*?^inactivity_timeout\s*=\s*"45m"\s*$/m,
  'session inactivity timeout',
);
requireConfig(
  /^\[auth\.mfa\.totp\][\s\S]*?^enroll_enabled\s*=\s*true\s*$[\s\S]*?^verify_enabled\s*=\s*true\s*$/m,
  'TOTP enroll/verify must be enabled',
);
for (const [section, description] of [
  ['auth.passkey', 'passkey'],
  ['auth.mfa.phone', 'phone MFA'],
  ['auth.mfa.web_authn', 'WebAuthn MFA'],
]) {
  const escaped = section.replaceAll('.', '\\.');
  requireConfig(
    new RegExp(
      `^\\[${escaped}\\][\\s\\S]*?^enabled\\s*=\\s*false\\s*$|^\\[${escaped}\\][\\s\\S]*?^enroll_enabled\\s*=\\s*false\\s*$`,
      'm',
    ),
    `${description} must remain disabled`,
  );
}

const supabaseVersion = supabasePackageJson.version;
if (supabaseVersion !== '2.113.0')
  failures.push(`Supabase CLI must be 2.113.0; found ${supabaseVersion}`);
if (packageJson.version !== '2.112.2') {
  failures.push(`@supabase/supabase-js must be 2.112.2; found ${packageJson.version}`);
}

const client = createClient('http://127.0.0.1:54321', 'synthetic-publishable-key', {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const primitiveChecks = {
  refreshSession: client.auth.refreshSession,
  signOut: client.auth.signOut,
  resetPasswordForEmail: client.auth.resetPasswordForEmail,
  updateUser: client.auth.updateUser,
  listFactors: client.auth.mfa.listFactors,
  enroll: client.auth.mfa.enroll,
  challenge: client.auth.mfa.challenge,
  verify: client.auth.mfa.verify,
  unenroll: client.auth.mfa.unenroll,
  assurance: client.auth.mfa.getAuthenticatorAssuranceLevel,
};
for (const [name, value] of Object.entries(primitiveChecks)) {
  if (typeof value !== 'function')
    failures.push(`missing public/user-context Auth primitive: ${name}`);
}

const databaseUrl =
  process.env.SHIFAA_SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, idle_timeout: 1 });
let schemaEvidence;
try {
  const rows = await sql`
    select table_name, array_agg(column_name order by ordinal_position) as columns
    from information_schema.columns
    where table_schema = 'auth'
      and table_name in ('sessions', 'refresh_tokens', 'mfa_factors', 'mfa_challenges')
    group by table_name
    order by table_name
  `;
  const required = new Map([
    ['sessions', ['id', 'user_id']],
    ['refresh_tokens', ['id', 'session_id', 'token']],
    ['mfa_factors', ['id', 'user_id', 'status', 'factor_type']],
    ['mfa_challenges', ['id', 'factor_id']],
  ]);
  for (const [table, columns] of required) {
    const row = rows.find((candidate) => candidate.table_name === table);
    if (!row) failures.push(`missing pinned Auth table: auth.${table}`);
    else
      for (const column of columns) {
        if (!row.columns.includes(column))
          failures.push(`missing pinned Auth column: auth.${table}.${column}`);
      }
  }
  schemaEvidence = Object.fromEntries(rows.map((row) => [row.table_name, row.columns]));
} finally {
  await sql.end({ timeout: 1 });
}

if (failures.length) {
  console.error('Feature 007 Auth compatibility failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      result: 'PASS',
      supabaseCli: supabaseVersion,
      supabaseJs: packageJson.version,
      config: {
        jwtExpirySeconds: 900,
        sessionTimebox: '23h45m',
        inactivityTimeout: '45m',
        refreshReuseSeconds: 10,
        totp: true,
        phone: false,
        passkey: false,
        webAuthn: false,
      },
      primitives: Object.keys(primitiveChecks),
      authSchema: schemaEvidence,
      mutationBoundary: 'public/user-context APIs only; no direct Auth mutation or service role',
    },
    null,
    2,
  ),
);
