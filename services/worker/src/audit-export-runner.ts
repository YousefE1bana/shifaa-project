import { setTimeout as delay } from 'node:timers/promises';

import { AuditExportWorker, PrivateAuditExportHttpAdapter } from './audit-export.js';
import { PostgresAuditExportWorkAdapter } from './postgres-audit-export-work.js';

const databaseUrl = process.env['DATABASE_URL'];
const apiBaseUrl = process.env['AUDIT_EXPORT_API_BASE_URL'];
const credential = process.env['AUDIT_EXPORT_SERVICE_CREDENTIAL'];
if (!databaseUrl || !apiBaseUrl || !credential)
  throw new Error('008 worker requires DATABASE_URL, API base URL, and service credential.');
if (process.env['SHIFAA_SYNTHETIC_MODE'] !== 'true')
  throw new Error('008 worker is limited to the seeded-synthetic graduation runtime.');
const parsedDatabaseUrl = new URL(databaseUrl);
if (
  !['127.0.0.1', 'localhost'].includes(parsedDatabaseUrl.hostname) ||
  parsedDatabaseUrl.username !== 'shifaa_worker' ||
  parsedDatabaseUrl.pathname !== '/shifaa'
)
  throw new Error('008 worker requires the local non-owner worker database identity.');

const workerId = `audit-export-${process.pid}`;
const work = new PostgresAuditExportWorkAdapter(databaseUrl);
const worker = new AuditExportWorker(workerId, {
  work,
  operation: new PrivateAuditExportHttpAdapter(apiBaseUrl, credential, globalThis.fetch, workerId),
  clock: { now: () => new Date() },
  telemetry: { emit: () => undefined },
});
let stopping = false;
process.once('SIGINT', () => (stopping = true));
process.once('SIGTERM', () => (stopping = true));
try {
  while (!stopping) if ((await worker.processNext()) === 'idle') await delay(500);
} finally {
  await work.close();
}
