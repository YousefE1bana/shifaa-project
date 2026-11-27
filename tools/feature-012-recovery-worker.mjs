import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const result = { phase: 'load' };
const processors = [];
let sql;

try {
  const require = createRequire(new URL('../services/worker/package.json', import.meta.url));
  const postgres = require('postgres');
  const { LocalSyntheticMessagingAdapter } = await import(
    '../services/worker/src/adapters/local-synthetic-messaging.ts'
  );
  const { PostgresIdentityNotificationProcessor } = await import(
    '../services/worker/src/identity-continuity.ts'
  );
  assert.match(process.env.F012_WORKER_PASSWORD ?? '', /^[a-f0-9]{64}$/);
  const database = `postgresql://shifaa_worker:${process.env.F012_WORKER_PASSWORD}@db:5432/postgres`;
  const adapter = new LocalSyntheticMessagingAdapter();
  sql = postgres(database, { max: 1 });
  for (const id of ['a', 'b']) {
    processors.push(
      new PostgresIdentityNotificationProcessor(database, adapter, 't012-recovery-worker-' + id),
    );
  }
  result.phase = 'role';
  const [identity] = await sql`
    SELECT current_user AS role, session_user AS login, host(inet_server_addr()) AS address,
           rolsuper AS superuser, rolbypassrls AS bypassrls
    FROM pg_roles WHERE rolname=current_user`;
  result.identity = identity;
  assert.equal(identity.role, 'shifaa_worker');
  assert.equal(identity.login, 'shifaa_worker');
  assert.equal(identity.superuser, false);
  assert.equal(identity.bypassrls, false);
  result.phase = 'dispatch';
  result.outcomes = (
    await Promise.all(processors.map((processor) => processor.processNext()))
  ).sort();
  result.syntheticDeliveries = adapter.visibleMessages.size;
  result.syntheticAttempts = adapter.attempts.length;
} catch (error) {
  result.failureCode = /^[A-Z0-9_]+$/.test(error.code ?? '')
    ? error.code
    : 'UNCLASSIFIED_WORKER_FAILURE';
} finally {
  await Promise.all([
    ...processors.map((processor) => processor.close()),
    sql?.end({ timeout: 5 }),
  ]);
}
console.log(JSON.stringify(result));
