import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { feature011HarnessFixture } from '../packages/test-kit/src/feature-011/fixtures.ts';
import {
  runtimes,
  root,
  sql,
  assertOwnedDatabase,
  withDatabase,
  prepare,
  smoke,
  missingBehavior,
  harnessInputs,
  runtimeManifest,
  writeHarnessReport,
} from './run-feature-011-postgres-test.mjs';

export function session(runtime, database, label, user = 'shifaa_api') {
  assertOwnedDatabase(runtime, database);
  if (!/^f011_k0[347]_[a-f0-9]{16}_(holder|contender)$/.test(label))
    throw new Error('Unsafe exact connection/barrier name.');
  if (![runtime.user, 'shifaa_api'].includes(user)) throw new Error('Unapproved session role.');
  const command = [
    'exec',
    '-i',
    ...(user === 'shifaa_api' ? ['-e', 'PGPASSWORD'] : []),
    runtime.container,
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=verbose',
    ...(user === 'shifaa_api' ? ['-h', '127.0.0.1'] : []),
    '-U',
    user,
    '-d',
    database,
  ];
  const child = spawn('docker', command, {
    cwd: root,
    windowsHide: true,
    env: user === 'shifaa_api' ? { ...process.env, PGPASSWORD: 'synthetic_api_only' } : process.env,
  });
  let output = '',
    ended = false;
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const closed = new Promise((done, reject) => {
    child.once('error', (error) => {
      ended = true;
      reject(error);
    });
    child.once('close', (code) => {
      ended = true;
      done({ code, output });
    });
  });
  return {
    child,
    closed,
    label,
    command: ['docker', ...command],
    get output() {
      return output;
    },
    get ended() {
      return ended;
    },
    send(statement) {
      if (ended || child.stdin.destroyed || child.stdin.writableEnded)
        throw new Error(`${label}: session is closed`);
      child.stdin.write(`${statement}\n`);
    },
  };
}
const pause = () => new Promise((done) => setTimeout(done, 25));
export async function marker(connection, text) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (connection.output.split(/\r?\n/).includes(text)) return;
    if (connection.ended)
      throw new Error(`${connection.label} exited before ${text}: ${connection.output}`);
    await pause();
  }
  throw new Error(`${connection.label}: deterministic barrier timeout ${text}; not RED.`);
}
export async function lockWait(runtime, database, holderPid, contenderPid) {
  assert.ok(
    Number.isInteger(holderPid) && Number.isInteger(contenderPid) && holderPid !== contenderPid,
  );
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const proof = sql(
      runtime,
      database,
      `SELECT json_build_object(
      'holderPid',${holderPid},'contenderPid',${contenderPid},
      'holderGranted',EXISTS(SELECT 1 FROM pg_locks WHERE pid=${holderPid} AND locktype='advisory' AND granted),
      'contenderWaiting',EXISTS(SELECT 1 FROM pg_locks WHERE pid=${contenderPid} AND locktype='advisory' AND NOT granted),
      'blockingPids',pg_blocking_pids(${contenderPid}),
      'contenderWaitEvent',(SELECT wait_event_type FROM pg_stat_activity WHERE pid=${contenderPid}));`,
    );
    const facts = JSON.parse(proof.stdout.trim());
    if (
      facts.holderGranted &&
      facts.contenderWaiting &&
      facts.blockingPids.includes(holderPid) &&
      facts.contenderWaitEvent === 'Lock'
    )
      return { ...facts, observerCommand: proof.command };
    await pause();
  }
  throw new Error(`${runtime.name}: no actual pg_locks blocking proof; not RED.`);
}
export async function proveConnections(runtime, database) {
  const holder = session(runtime, database, `${database}_holder`);
  const contender = session(runtime, database, `${database}_contender`);
  try {
    const identities = [];
    for (const connection of [holder, contender]) {
      connection.send(
        `SET application_name='${connection.label}'; SET statement_timeout='10s'; SET idle_in_transaction_session_timeout='15s'; SELECT json_build_object('user',current_user,'pid',pg_backend_pid(),'database',current_database()); SELECT 'READY';`,
      );
      await marker(connection, 'READY');
      const identity = JSON.parse(
        connection.output.split(/\r?\n/).find((line) => line.startsWith('{')),
      );
      assert.equal(identity.user, 'shifaa_api');
      assert.equal(identity.database, database);
      identities.push(identity);
    }
    assert.notEqual(identities[0].pid, identities[1].pid);
    const lock = `pg_advisory_xact_lock(${feature011HarnessFixture.lockNamespace},${feature011HarnessFixture.lockKey})`;
    holder.send(`BEGIN; SELECT ${lock}; SELECT 'HELD';`);
    await marker(holder, 'HELD');
    contender.send(`BEGIN; SELECT ${lock}; SELECT 'ACQUIRED'; ROLLBACK; SELECT 'FINISHED';`);
    const locks = await lockWait(runtime, database, identities[0].pid, identities[1].pid);
    holder.send("ROLLBACK; SELECT 'RELEASED';");
    await marker(holder, 'RELEASED');
    await marker(contender, 'FINISHED');
    holder.child.stdin.end();
    contender.child.stdin.end();
    const [first, second] = await Promise.all([holder.closed, contender.closed]);
    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
    return {
      result: 'PASS',
      kind: 'BASELINE_ONLY_CONNECTION_AND_BARRIER_HEALTH',
      identities,
      locks,
      holder: { ...first, command: holder.command },
      contender: { ...second, command: contender.command },
      domainMutationExecuted: false,
    };
  } finally {
    for (const connection of [holder, contender]) {
      if (
        !connection.ended &&
        !connection.child.stdin.destroyed &&
        !connection.child.stdin.writableEnded
      ) {
        connection.send('ROLLBACK;');
        connection.child.stdin.end();
      }
    }
    await Promise.allSettled([holder.closed, contender.closed]);
  }
}
async function main() {
  if (process.argv.length !== 3 || !['health', 'red', 'green'].includes(process.argv[2]))
    throw new Error('Runner accepts health, red or authorized K07 green only.');
  if (process.argv[2] === 'green') {
    const { runPhysicalRaces } = await import('./feature-011-physical-races.mjs');
    await runPhysicalRaces();
    return;
  }
  if (process.argv[2] === 'red') {
    const { runPhysicalRed } = await import('./run-feature-011-physical-red.mjs');
    await runPhysicalRed('concurrency');
    return;
  }
  const inputs = harnessInputs(),
    results = [];
  for (const runtime of runtimes) {
    const identity = runtimeManifest(runtime);
    results.push(
      await withDatabase(runtime, async (database) => ({
        runtime: identity,
        database,
        setup: prepare(runtime, database),
        smoke: smoke(runtime, database),
        connections: await proveConnections(runtime, database),
        missing: missingBehavior(runtime, database),
      })),
    );
    console.log(
      `${runtime.name}: independent non-owner connections, deterministic barriers/pg_locks and exact cleanup PASS`,
    );
  }
  writeHarnessReport('concurrency-health.json', {
    result: 'PASS',
    checkpoint: 'K03',
    mode: 'BASELINE_ONLY_CONNECTION_HEALTH',
    inputs,
    results,
    realProducerAcceptance: false,
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
