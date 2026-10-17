import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verificationPlan, requiredIds } from './verification-plan.mjs';
import { runDisposableTestSuite } from './trusted-disposable-test-launcher.mjs';
import { sourceFingerprint, verifyPrivateTestOutput } from './test-resource-context.mjs';

const root = path.resolve(import.meta.dirname, '..');
const exec = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();

// An external JSON/environment flag is not a resource capability. This is the
// outer VM admission boundary; the existing launcher still creates its own
// WeakMap capability after verifying every actual Docker/DB resource.
export function admitGuest(observe, binding) {
  const hardware = observe.hardware();
  assert.equal(hardware.manufacturer, 'Microsoft Corporation');
  assert.equal(hardware.model, 'Virtual Machine');
  assert.equal(hardware.uuid.toLowerCase(), binding.vmId.toLowerCase());
  assert.equal(observe.externalAdapters(), 0, 'Network must be physically removed');
  assert.equal(observe.revision(), binding.revision);
  assert.equal(observe.dirty(), '');
  assert.match(binding.nonce, /^[a-f0-9]{32}$/);
  assert.match(binding.vmId, /^[a-f0-9-]{36}$/i);
  assert.equal(binding.authority, 'POWER_SHELL_DIRECT_FRESH_VM');
  const docker = observe.docker();
  assert.match(docker.endpoint, /^npipe:\/\/.+\/pipe\/dockerDesktopLinuxEngine$/i);
  assert.ok(docker.engine);
  return docker;
}

function actualAdmission() {
  assert.equal(process.platform, 'win32');
  assert.equal(root, 'C:\\SHIFAA\\source');
  verifyPrivateTestOutput('C:\\SHIFAA');
  assert.ok(!fs.lstatSync('C:\\SHIFAA\\run.json').isSymbolicLink());
  const binding = JSON.parse(
    fs.readFileSync('C:\\SHIFAA\\run.json', 'utf8').replace(/^\uFEFF/, ''),
  );
  const ps = (script) =>
    JSON.parse(
      exec('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ]),
    );
  const docker = admitGuest(
    {
      hardware: () =>
        ps(
          '$s=Get-CimInstance Win32_ComputerSystem; $p=Get-CimInstance Win32_ComputerSystemProduct; @{manufacturer=$s.Manufacturer;model=$s.Model;uuid=$p.UUID}|ConvertTo-Json -Compress',
        ),
      externalAdapters: () =>
        ps(
          "@(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object {$_.InterfaceDescription -like '*Hyper-V*'}).Count | ConvertTo-Json",
        ),
      revision: () => exec('git', ['rev-parse', 'HEAD']),
      dirty: () => exec('git', ['status', '--porcelain', '--untracked-files=normal']),
      docker: () => {
        const context = exec('docker', ['context', 'show']);
        const [meta] = JSON.parse(exec('docker', ['context', 'inspect', context]));
        assert.match(meta.Endpoints.docker.Host, /^npipe:\/\/.+\/pipe\/dockerDesktopLinuxEngine$/i);
        const engine = JSON.parse(
          exec('docker', ['--context', context, 'info', '--format', '{{json .}}']),
        );
        return { context, endpoint: meta.Endpoints.docker.Host, engine: engine.ID };
      },
    },
    binding,
  );
  return { binding, docker };
}

export async function executePlan(plan, runCommand, runGuarded, audit) {
  const results = [];
  let stopped = false;
  const record = async (id, operation) => {
    if (stopped) {
      results.push({ id, status: 'BLOCKED', exitCode: null });
      return;
    }
    try {
      const exitCode = await operation();
      assert.ok(Number.isInteger(exitCode));
      const status = exitCode === 0 ? 'PASS' : 'FAIL';
      results.push({ id, status, exitCode });
      stopped = status !== 'PASS';
    } catch {
      results.push({ id, status: 'BLOCKED', exitCode: null });
      stopped = true;
    }
  };
  // Guards require a clean source tree; execute them before evidence-producing
  // legacy runners. Every original step remains accounted for exactly once.
  for (const scope of ['discovery-sos', 'family', 'privacy']) {
    const id = scope === 'discovery-sos' ? 'legacy-20' : `guarded-${scope}`;
    await record(id, () => runGuarded(scope));
  }
  for (const { id, command } of plan.requiredSteps) {
    if (id === 'legacy-20') continue;
    if (command === 'pnpm dependencies:check') {
      await record(id, async () => {
        assert.equal(audit.exitCode, 0, 'Fresh online audit did not pass');
        assert.ok(
          Date.now() - Date.parse(audit.checkedUtc) >= 0 &&
            Date.now() - Date.parse(audit.checkedUtc) < 3 * 60 * 60 * 1000,
          'Audit is stale',
        );
        return runCommand('pnpm peers check && node tools/verify-expo-dependencies.mjs', id);
      });
    } else await record(id, () => runCommand(command, id));
  }
  assert.deepEqual(results.map((r) => r.id).sort(), requiredIds(plan).sort());
  return results;
}

async function guarded(scope, context) {
  assert.ok(['discovery-sos', 'family', 'privacy'].includes(scope));
  const result = await runDisposableTestSuite({
    maxRuns: 32,
    execute: 'CREATE_NEW_DISPOSABLE_RESOURCES',
    approval: `Aggregate run ${context.binding.nonce}: create fresh scope resources and remove only their verified identities`,
    worktree: root,
    revision: context.binding.revision,
    sourceDigest: sourceFingerprint(root),
    outputParent: 'C:\\SHIFAA\\evidence',
    scope,
    docker: { ...context.docker, image: context.binding.postgres.image },
    imageReference: context.binding.postgres.reference,
  });
  assert.ok(
    result.passedTests > 0 && result.runs.length > 0 && result.runs.length <= 32,
    'Suite did not execute or exceeded the reviewed run budget',
  );
  if (!result.passed || result.failedTests) return 1;
  // Suite has completed and closed all handles. Teardown validates every current
  // resource identity; failure preserves the VM and prevents the next suite.
  for (const created of result.runs)
    await created.teardown(`REMOVE_RUN_OWNED_RESOURCES:${created.nonce}`);
  return 0;
}

export async function main() {
  const context = actualAdmission(); // Before any test import, connection or command.
  if (process.argv[2] === '--guarded') {
    process.exitCode = await guarded(process.argv[3], context);
    return;
  }
  const plan = verificationPlan(root);
  const output = 'C:\\SHIFAA\\evidence';
  verifyPrivateTestOutput(output);
  const audit = JSON.parse(
    fs.readFileSync('C:\\SHIFAA\\audit.json', 'utf8').replace(/^\uFEFF/, ''),
  );
  const runCommand = (command, id) => {
    const fd = fs.openSync(path.join(output, `${id}.log`), 'wx', 0o600);
    try {
      const remaining = context.binding.deadline - Date.now();
      assert.ok(remaining > 0);
      const r = spawnSync('cmd.exe', ['/d', '/s', '/c', command], {
        cwd: root,
        timeout: Math.min(remaining, 60 * 60 * 1000),
        stdio: ['ignore', fd, fd],
        windowsHide: true,
        env: { ...process.env, TURBO_CONCURRENCY: '1', TURBO_FORCE: 'true', CI: 'true' },
      });
      if (r.error) throw r.error;
      return r.status;
    } finally {
      fs.closeSync(fd);
    }
  };
  const results = await executePlan(
    plan,
    runCommand,
    (scope) =>
      runCommand(
        `node --import tsx tools/verification-guest.mjs --guarded ${scope}`,
        `guarded-${scope}`,
      ),
    audit,
  );
  fs.writeFileSync(
    'C:\\SHIFAA\\summary.json',
    JSON.stringify({ nonce: context.binding.nonce, revision: context.binding.revision, results }),
    { flag: 'wx', mode: 0o600 },
  );
  process.exitCode = results.every((r) => r.status === 'PASS') ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
