import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const workspace = new URL('../services/api/package.json', import.meta.url);
const requireFromApi = createRequire(workspace);
const { createClient } = requireFromApi('@supabase/supabase-js');
const postgres = requireFromApi('postgres');

function runPnpm(args, capture = false, extraEnv = {}) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'corepack';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `corepack pnpm ${args.join(' ')}`]
      : ['pnpm', ...args];
  return execFileSync(command, commandArgs, {
    cwd: new URL('..', import.meta.url),
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

runPnpm(['exec', 'supabase', 'db', 'reset', '--local']);
const status = JSON.parse(runPnpm(['exec', 'supabase', 'status', '-o', 'json'], true));
const client = createClient(status.API_URL, status.ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const email = 'synthetic-007-native-session@example.test';
const password = 'Synthetic-007-Password!';
const signup = await client.auth.signUp({ email, password });
if (signup.error) throw signup.error;
let nativeSession = signup.data.session;
if (!nativeSession) {
  let code;
  for (let attempt = 0; attempt < 20 && !code; attempt += 1) {
    const mailbox = await fetch(`${status.MAILPIT_URL}/api/v1/messages`).then((response) =>
      response.json(),
    );
    const message = mailbox.messages?.find((entry) =>
      entry.To?.some((recipient) => recipient.Address === email),
    );
    if (!message) {
      await wait(250);
      continue;
    }
    const detail = await fetch(`${status.MAILPIT_URL}/api/v1/message/${message.ID}`).then(
      (response) => response.json(),
    );
    code = /\*(\d{6})\*/.exec(detail.Text ?? '')?.[1];
    if (!code) await wait(250);
  }
  if (!code) throw new Error('Local confirmation message did not contain a verification code.');
  const confirmed = await client.auth.verifyOtp({ email, token: code, type: 'signup' });
  if (confirmed.error || !confirmed.data.session)
    throw confirmed.error ?? new Error('Native confirmation session missing.');
  nativeSession = confirmed.data.session;
}
const sessionId = JSON.parse(
  Buffer.from(nativeSession.access_token.split('.')[1], 'base64url'),
).session_id;
if (typeof sessionId !== 'string') throw new Error('Native access token has no session_id.');

const sql = postgres(status.DB_URL, { max: 1 });
try {
  const before =
    await sql`select platform.auth_session_is_current(${sessionId}::uuid,${nativeSession.user.id}::uuid) as current`;
  if (before[0]?.current !== true)
    throw new Error('Native session helper did not observe the live Auth session.');
  const logout = await client.auth.signOut({ scope: 'local' });
  if (logout.error) throw logout.error;
  const after =
    await sql`select platform.auth_session_is_current(${sessionId}::uuid,${nativeSession.user.id}::uuid) as current`;
  if (after[0]?.current !== false)
    throw new Error('Native session helper still accepted a logged-out session.');
  const authTables =
    await sql`select count(*)::integer as count from information_schema.tables where table_schema='auth' and table_name in ('users','sessions','mfa_factors','mfa_challenges','refresh_tokens')`;
  if (authTables[0]?.count !== 5)
    throw new Error('Pinned native Auth schema compatibility is incomplete.');
} finally {
  await sql.end({ timeout: 5 });
}

runPnpm(
  [
    '--filter',
    '@shifaa/api',
    'exec',
    'vitest',
    'run',
    'test/identity-continuity-auth.integration.test.ts',
    '--testTimeout=30000',
  ],
  false,
  { SHIFAA_RUN_IDENTITY_CONTINUITY_AUTH: 'true' },
);

console.log('Identity continuity native Auth/PostgreSQL compatibility passed.');
