import { setTimeout as delay } from 'node:timers/promises';

import { DurableLocalSyntheticMessagingAdapter } from './adapters/local-synthetic-messaging.ts';
import { PostgresIdentityNotificationProcessor } from './identity-continuity.ts';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl)
  throw new Error('007 worker runner requires an explicit local worker DATABASE_URL.');
if (process.env['SHIFAA_SYNTHETIC_MODE'] !== 'true')
  throw new Error('007 worker runner requires SHIFAA_SYNTHETIC_MODE=true.');
if (process.env['SHIFAA_SYNTHETIC_RUNTIME_ATTESTATION'] !== '007-local-identity-continuity')
  throw new Error('007 worker runner requires the local identity-continuity attestation.');
const parsedDatabaseUrl = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsedDatabaseUrl.hostname))
  throw new Error('007 worker runner is restricted to a local synthetic database.');
if (parsedDatabaseUrl.username !== 'shifaa_worker' || parsedDatabaseUrl.pathname !== '/shifaa')
  throw new Error('007 worker runner requires the non-owner synthetic worker database identity.');

const adapter = new DurableLocalSyntheticMessagingAdapter(databaseUrl);
const processor = new PostgresIdentityNotificationProcessor(
  databaseUrl,
  adapter,
  `identity-continuity-live-${process.pid}`,
);
let stopping = false;
const stop = () => {
  stopping = true;
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

process.stdout.write(
  'Seeded-synthetic 007 identity notification worker started; production messaging remains disabled.\n',
);
try {
  while (!stopping) {
    const outcome = await processor.processNext();
    if (outcome === 'idle') await delay(500);
    else process.stdout.write(`007 identity notification outcome=${outcome}\n`);
  }
} finally {
  await processor.close();
  await adapter.close();
}
