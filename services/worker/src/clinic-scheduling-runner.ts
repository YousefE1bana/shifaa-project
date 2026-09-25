import { setTimeout as delay } from 'node:timers/promises';

import { DurableClinicSchedulingSyntheticMessagingAdapter } from './adapters/local-synthetic-messaging.ts';
import { PostgresClinicSchedulingNotificationProcessor } from './postgres-clinic-scheduling-notification-processor.ts';

const environment = process.env['NODE_ENV'] ?? 'development';
if (environment === 'production')
  throw new Error('OPEN-VENDOR-002: Feature 009 production messaging worker is disabled.');
if (process.env['SHIFAA_SYNTHETIC_MODE'] !== 'true')
  throw new Error('Feature 009 worker requires SHIFAA_SYNTHETIC_MODE=true.');
if (process.env['CLINIC_SCHEDULING_NOTIFICATIONS_ENABLED'] !== 'true')
  throw new Error('Feature 009 notification dispatch is disabled until local/test activation.');

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('Feature 009 worker requires an explicit local DATABASE_URL.');
const parsedDatabaseUrl = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsedDatabaseUrl.hostname))
  throw new Error('Feature 009 worker requires a local synthetic database.');
if (parsedDatabaseUrl.username !== 'shifaa_worker' || parsedDatabaseUrl.pathname !== '/shifaa')
  throw new Error('Feature 009 worker requires the non-owner synthetic worker database identity.');

const adapter = new DurableClinicSchedulingSyntheticMessagingAdapter(
  databaseUrl,
  environment === 'test' ? 'ci' : 'local',
);
const processor = new PostgresClinicSchedulingNotificationProcessor(
  databaseUrl,
  adapter,
  `clinic-scheduling-notifications-${process.pid}`,
);
let stopping = false;
process.once('SIGINT', () => (stopping = true));
process.once('SIGTERM', () => (stopping = true));
process.stdout.write(
  'Feature 009 local/test notification worker started; production SMS remains disabled.\n',
);
try {
  while (!stopping) {
    if ((await processor.processNext()) === 'idle') await delay(500);
  }
} finally {
  await processor.close();
  await adapter.close();
}
