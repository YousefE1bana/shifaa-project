import { setTimeout as delay } from 'node:timers/promises';

import {
  Feature010RealtimeHintProcessor,
  PostgresFeature010RealtimeHintStore,
  type Feature010RealtimeHintSink,
} from './feature-010-realtime.ts';

const environment = process.env['NODE_ENV'] ?? 'development';

async function main(): Promise<void> {
  let store: PostgresFeature010RealtimeHintStore | undefined;
  let stopping = false;
  let stdoutFailed = false;
  const onStdoutError = () => {
    stdoutFailed = true;
    stopping = true;
    process.exitCode = 1;
    process.stderr.write('Feature 010 realtime hint output failed.\n');
  };
  process.stdout.on('error', onStdoutError);
  try {
    assertLocalSyntheticConfiguration();
    const databaseUrl = process.env['DATABASE_URL']!;
    const dbEnvironment = environment === 'test' || process.env['CI'] === 'true' ? 'ci' : 'local';
    store = new PostgresFeature010RealtimeHintStore(databaseUrl, dbEnvironment);
    const sink: Feature010RealtimeHintSink = {
      async publish(hint) {
        await writeStdoutLine(JSON.stringify(hint), () => stdoutFailed);
      },
    };
    const processor = new Feature010RealtimeHintProcessor(
      store,
      sink,
      `feature-010-realtime-hints-${process.pid}`,
      () => new Date(),
    );

    process.once('SIGINT', () => (stopping = true));
    process.once('SIGTERM', () => (stopping = true));
    await writeStdoutLine(
      'Feature 010 local/test realtime hint worker started; production delivery remains disabled.',
      () => stdoutFailed,
    );
    while (!stopping) {
      if ((await processor.processNext()) === 'idle') await delay(500);
    }
    if (!stdoutFailed)
      await writeStdoutLine(
        'Feature 010 local/test realtime hint worker stopped.',
        () => stdoutFailed,
      );
  } catch {
    process.stderr.write('Feature 010 realtime hint worker failed with a safe error.\n');
    process.exitCode = 1;
  } finally {
    if (store) {
      try {
        await store.close();
      } catch {
        process.stderr.write('Feature 010 realtime hint worker cleanup failed.\n');
        process.exitCode = 1;
      }
    }
    process.stdout.off('error', onStdoutError);
  }
}

function writeStdoutLine(line: string, hasFailed: () => boolean): Promise<void> {
  if (hasFailed() || process.stdout.destroyed || process.stdout.writableEnded)
    return Promise.reject(new Error('feature-010-hint-output-failed'));
  return new Promise<void>((resolve, reject) => {
    try {
      process.stdout.write(`${line}\n`, (error) => {
        if (error) reject(new Error('feature-010-hint-output-failed'));
        else resolve();
      });
    } catch {
      reject(new Error('feature-010-hint-output-failed'));
    }
  });
}

function assertLocalSyntheticConfiguration(): void {
  if (environment === 'production')
    throw new Error('Feature 010 realtime production worker is disabled.');
  if (process.env['SHIFAA_SYNTHETIC_MODE'] !== 'true')
    throw new Error('Feature 010 realtime worker requires synthetic mode.');
  if (process.env['FEATURE_010_REALTIME_HINTS_ENABLED'] !== 'true')
    throw new Error('Feature 010 realtime hint worker is disabled by default.');

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('Feature 010 realtime worker requires a local database.');
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsedDatabaseUrl.hostname))
    throw new Error('Feature 010 realtime worker requires a local synthetic database.');
  if (parsedDatabaseUrl.username !== 'shifaa_worker' || parsedDatabaseUrl.pathname !== '/shifaa')
    throw new Error('Feature 010 realtime worker requires the non-owner database identity.');
}

await main();
