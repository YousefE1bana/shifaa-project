import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  verificationPlan,
  assertComplete,
  publicResults,
  requiredIds,
} from './verification-plan.mjs';
import { localVerificationHost } from './verification-host.mjs';

// Admit the ENTIRE graph before any test, fixture import, resource subprocess,
// connection or creation. The plan's immutable Git lookup is read-only.
// No VM or per-run JSON is used.
export async function verify(host, plan) {
  const results = requiredIds(plan).map((id) => ({ id, status: 'BLOCKED', exitCode: null }));
  try {
    const admission = await host.preflight(plan);
    if (admission?.status !== 'PASS')
      return {
        status: 'BLOCKED',
        results,
        code: admission?.code ?? 'PREFLIGHT_INCOMPLETE',
        reason: admission?.reason ?? 'Required safety admission did not pass.',
        blocked: admission?.blocked,
        evidence: admission?.evidence,
      };
    for (const result of results) {
      const actual = await host.execute(result.id);
      // A zero test exit is insufficient when owned resource disposition is
      // unverified. Unknown or partial teardown must preserve resources.
      if (actual?.cleanupVerified !== true) throw new Error('Unverified resource disposition');
      result.exitCode = actual.exitCode;
      result.status = actual.exitCode === 0 ? 'PASS' : 'FAIL';
      publicResults(plan, results);
      if (result.status === 'FAIL') return { status: 'FAIL', results };
    }
    assertComplete(plan, results);
    return { status: 'PASS', results };
  } catch {
    // No raw subprocess errors, SQL, URLs, credentials or guessed cleanup.
    return {
      status: results.some((r) => r.status === 'FAIL') ? 'FAIL' : 'BLOCKED',
      results: results.map((r) => ({
        id: r.id,
        status:
          r.status === 'PASS' && r.exitCode === 0
            ? 'PASS'
            : r.status === 'FAIL'
              ? 'FAIL'
              : 'BLOCKED',
        exitCode:
          Number.isInteger(r.exitCode) && r.exitCode >= 0 && r.exitCode <= 255 ? r.exitCode : null,
      })),
      code: 'EXECUTION_INCOMPLETE',
      reason:
        'Required verification or identity-checked teardown did not complete. No acceptance claimed.',
    };
  }
}

export async function main() {
  const root = path.resolve(import.meta.dirname, '..');
  try {
    const result = await verify(localVerificationHost(root), verificationPlan(root));
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 2;
  } catch {
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reason: 'Verification plan integrity failed. No commands or resources started.',
      }),
    );
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
