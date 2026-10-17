import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  verificationPlan,
  assertComplete,
  publicResults,
  requiredIds,
} from './verification-plan.mjs';
import { verificationHost } from './verification-host.mjs';

// This coordinator never imports a DB client or executes a legacy command on the host.
export async function verify(host, plan) {
  let run;
  let created = false;
  let results = requiredIds(plan).map((id) => ({ id, status: 'BLOCKED', exitCode: null }));
  try {
    run = await host.admit(); // Read-only, before lock, disk, VM or guest creation.
    await host.reserve(run);
    // Creation may fail after a resource has been allocated. Never guess at cleanup.
    created = true;
    await host.create(run);
    await host.checkpoint(run, 'created');
    await host.prepare(run);
    await host.checkpoint(run, 'bootstrapped');
    results = publicResults(plan, await host.execute(run, plan));
    assertComplete(plan, results);
    await host.checkpoint(run, 'before-teardown');
    await host.teardown(run);
    created = false;
    await host.finalize(run, 'PASS', results);
    return { status: 'PASS', results };
  } catch {
    // No raw subprocess output/argv can disclose rows, tokens or credentials.
    const status = results.some((r) => r.status === 'FAIL') ? 'FAIL' : 'BLOCKED';
    if (run) await host.preserve(run, { status, created, results });
    return {
      status,
      results,
      reason:
        host.reason ??
        'Required verification incomplete; inspect the private run receipt. No acceptance claimed.',
    };
  }
}

export async function main() {
  const root = path.resolve(import.meta.dirname, '..');
  try {
    const plan = verificationPlan(root);
    const result = await verify(
      verificationHost(root, process.env.SHIFAA_VERIFY_CONFIG, randomBytes(16).toString('hex')),
      plan,
    );
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 2;
  } catch {
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reason: 'Verification plan/configuration is invalid. No resources created.',
      }),
    );
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
