import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { LocalSyntheticMessagingAdapter } from '../services/worker/src/adapters/local-synthetic-messaging.ts';
import { PostgresIdentityNotificationProcessor } from '../services/worker/src/identity-continuity.ts';

const require = createRequire(new URL('../services/worker/package.json', import.meta.url));
const postgres = require('postgres');
const secret = process.env.F012_WORKER_PASSWORD;
assert.match(secret ?? '', /^[a-f0-9]{64}$/);
const database = `postgresql://shifaa_worker:${secret}@db:5432/postgres`;
const sql = postgres(database, { max: 1 });
const adapter = new LocalSyntheticMessagingAdapter();
const first = new PostgresIdentityNotificationProcessor(
  database,
  adapter,
  't012-recovery-worker-a',
);
const second = new PostgresIdentityNotificationProcessor(
  database,
  adapter,
  't012-recovery-worker-b',
);

try {
  const [identity] = await sql`
    SELECT current_user AS role, session_user AS login, inet_server_addr()::text AS address,
           rolsuper AS superuser, rolbypassrls AS bypassrls
    FROM pg_roles WHERE rolname=current_user`;
  assert.equal(identity.role, 'shifaa_worker');
  assert.equal(identity.login, 'shifaa_worker');
  assert.equal(identity.superuser, false);
  assert.equal(identity.bypassrls, false);
  const outcomes = (await Promise.all([first.processNext(), second.processNext()])).sort();
  assert.deepEqual(outcomes, ['delivered', 'idle']);
  assert.equal(adapter.visibleMessages.size, 1);
  assert.equal(adapter.attempts.length, 1);
  console.log(
    JSON.stringify({ ...identity, outcomes, syntheticDeliveries: adapter.visibleMessages.size }),
  );
} finally {
  await Promise.all([first.close(), second.close(), sql.end({ timeout: 5 })]);
}
