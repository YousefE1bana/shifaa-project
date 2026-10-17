import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { verifyPrivateTestOutput } from './test-resource-context.mjs';
import {
  createPrivateOutput,
  writePrivateReport,
  assertCanonicalDirectory,
} from './disposable-test-resources.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function digestFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function createSourceBundle(root, destination) {
  const fd = fs.openSync(destination, 'wx', 0o600);
  let child, timer;
  try {
    child = spawn('git', ['bundle', 'create', '-', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const completion = new Promise((resolve) => {
      child.once('error', () => resolve(-1));
      child.once('close', (code) => resolve(code));
    });
    timer = setTimeout(() => child.kill(), 120000);
    let total = 0;
    for await (const bytes of child.stdout) {
      total += bytes.length;
      assert.ok(
        total <= 2 * 1024 * 1024 * 1024,
        'Committed source bundle exceeds the 2 GiB transport budget',
      );
      fs.writeSync(fd, bytes);
    }
    assert.equal(await completion, 0, 'Source bundle creation failed');
    assert.ok(total > 0);
  } finally {
    if (timer) clearTimeout(timer);
    if (child && child.exitCode === null) child.kill();
    fs.closeSync(fd);
  }
}
const git = (root, args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
export function publicProviderFailure(error) {
  const diagnostic = String(error?.stderr ?? '');
  const known = [
    'Hyper-V service unavailable',
    'Image hash mismatch',
    'Independent unattached image required',
    'Template virtual disk exceeds budget',
    'Insufficient disk headroom',
    'Reserved disk headroom exhausted',
    'Explicit audit-only switch required',
    'Unresolved verification VM blocks accumulation',
    'Preexisting output rejected',
    'Unresolved run lock',
    'Creation collision',
    'Run collision',
    'Reparse path rejected',
    'Private directory ACL required',
    'Owner mismatch',
    'Public ACL rejected',
    'Creation receipt missing',
    'Creation receipt mismatch',
    'VM identity substitution',
    'VM ownership lost',
    'VM budget drift',
    'VM storage substitution',
    'VM disk substitution',
    'Disk identity lost',
    'Unexpected media',
    'Guest must be disconnected before repository code runs',
    'PowerShell Direct unavailable before deadline',
    'Run time budget exhausted',
    'Guest deadline expired; exact VM stopped and disk retained',
    'Guest operation failed',
    'Summary substitution',
    'VM removal incomplete',
    'Disk ownership lost before deletion',
    'Disk removal incomplete',
    'Run deadline exceeded',
  ];
  const reason = known.find((message) => diagnostic.includes(message));
  return reason
    ? `${reason}. No acceptance claimed; preserve any allocated run resources.`
    : 'Isolation provider failed or is unavailable. Inspect the private run metadata and installed host prerequisites; no acceptance claimed.';
}
export function validateConfig(c, root, nonce) {
  assert.equal(c.schema, 'SHIFAA-VERIFY/1');
  assert.equal(c.authorize, 'CREATE_ONE_DISPOSABLE_VM_AND_REMOVE_ONLY_ITS_VERIFIED_RESOURCES');
  assert.equal(c.runNonce, nonce, 'Authorization must bind this invocation nonce');
  assert.equal(c.worktree, root);
  assert.match(c.revision, /^[a-f0-9]{40}$/);
  assert.ok(c.approvedBy?.trim() && c.expiresUtc && Date.parse(c.expiresUtc) > Date.now());
  assert.ok(
    Date.parse(c.expiresUtc) <= Date.now() + 24 * 60 * 60 * 1000,
    'Authorization expires within 24 hours',
  );
  assert.equal(c.backend, 'hyperv-windows');
  assert.equal(
    c.outputParent,
    path.join(os.homedir(), 'SHIFAA-verification-private'),
    'One fixed private coordination root per Windows identity is required',
  );
  assert.match(c.image.sha256, /^[a-f0-9]{64}$/);
  assert.match(c.image.provenanceSha256, /^[a-f0-9]{64}$/);
  assert.ok(path.isAbsolute(c.image.provenancePath));
  assert.ok(
    path.isAbsolute(c.image.path) &&
      path.isAbsolute(c.outputParent) &&
      path.isAbsolute(c.credentialPath),
  );
  const relative = path.relative(root, c.outputParent);
  assert.ok(
    relative && (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)),
    'Output must be outside the repository',
  );
  assert.match(c.postgres.reference, /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/);
  assert.match(c.postgres.image, /^sha256:[a-f0-9]{64}$/);
  assert.ok(c.auditSwitchId && /^[a-f0-9-]{36}$/i.test(c.auditSwitchId));
  assert.deepEqual(
    Object.keys(c.budget).sort(),
    ['cpus', 'diskGiB', 'memoryGiB', 'minutes'].sort(),
  );
  assert.ok(Number.isInteger(c.budget.cpus) && c.budget.cpus >= 2 && c.budget.cpus <= 4);
  assert.ok(
    Number.isInteger(c.budget.memoryGiB) && c.budget.memoryGiB >= 8 && c.budget.memoryGiB <= 16,
  );
  assert.ok(
    Number.isInteger(c.budget.diskGiB) && c.budget.diskGiB >= 40 && c.budget.diskGiB <= 120,
  );
  assert.ok(
    Number.isInteger(c.budget.minutes) && c.budget.minutes >= 10 && c.budget.minutes <= 180,
  );
  assert.ok(
    Date.parse(c.expiresUtc) > Date.now() + c.budget.minutes * 60000 + 120000,
    'Authorization must cover execution and bounded teardown',
  );
  if (process.platform === 'win32')
    for (const file of [c.image.path, c.outputParent, c.credentialPath])
      assert.match(file, /^[A-Za-z]:\\/, 'Local private filesystem required');
  return structuredClone(c);
}

export function validateImageProvenance(record, config) {
  assert.equal(record.schema, 'SHIFAA-VERIFY-IMAGE/1');
  assert.equal(record.imageSha256, config.image.sha256);
  assert.equal(record.disposition, 'APPROVED_CLEAN_SYNTHETIC_APPLIANCE');
  assert.ok(record.approvedBy?.trim() && Number.isFinite(Date.parse(record.reviewedUtc)));
  assert.ok(Array.isArray(record.sources) && record.sources.length > 0);
  for (const source of record.sources) {
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(source.purpose?.trim());
  }
  assert.deepEqual(record.tools, {
    node: '24.18.0',
    pnpm: '11.13.0',
    supabase: '2.113.0',
    powershell: ['5.1', '7'],
  });
}

export function verificationHost(root, configPath, nonce) {
  let config, run, parentIdentity, imageStat, reservation, reservationIdentity, configDigest;
  const api = { reason: undefined };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const checkpointHost = () => {
    assert.ok(!fs.lstatSync(configPath).isSymbolicLink());
    assert.equal(
      digest(fs.readFileSync(configPath)),
      configDigest,
      'Authorization changed during execution',
    );
    assert.ok(!fs.lstatSync(config.image.provenancePath).isSymbolicLink());
    assert.equal(
      digest(fs.readFileSync(config.image.provenancePath)),
      config.image.provenanceSha256,
      'Image provenance changed',
    );
    assert.equal(git(root, ['rev-parse', 'HEAD']), config.revision);
    assert.equal(
      git(root, ['status', '--porcelain', '--untracked-files=normal']),
      '',
      'Commit the reviewed candidate before a real run',
    );
    assert.ok(
      same(parentIdentity, verifyPrivateTestOutput(config.outputParent)),
      'Output parent replaced',
    );
    assert.equal(fs.statSync(config.image.path).size, imageStat.size);
    assert.equal(fs.statSync(config.image.path).mtimeMs, imageStat.mtimeMs);
    if (run?.outputIdentity)
      assert.ok(same(run.outputIdentity, verifyPrivateTestOutput(run.output)));
  };
  const provider = (action) => {
    checkpointHost();
    let raw;
    try {
      raw = execFileSync(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          path.join(root, 'tools/verification-hyperv.ps1'),
          '-Action',
          action,
        ],
        {
          cwd: root,
          input: JSON.stringify({ ...run, config }),
          encoding: 'utf8',
          timeout: config.budget.minutes * 60000 + 120000,
          maxBuffer: 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
    } catch (error) {
      api.reason = publicProviderFailure(error);
      throw error;
    }
    const response = JSON.parse(raw);
    assert.equal(response.nonce, nonce);
    assert.equal(response.status, 'PASS');
    return response;
  };
  api.admit = async () => {
    api.reason =
      'Supply a private SHIFAA_VERIFY_CONFIG with a current one-run authorization, immutable clean Windows image and explicit budgets. No VM/database has been created.';
    api.reason = 'A supported Windows Hyper-V isolation backend is required. No resource created.';
    assert.equal(process.platform, 'win32', 'A verified Windows isolation backend is required');
    api.reason =
      'SHIFAA_VERIFY_CONFIG must name an existing absolute private JSON file with one-run authorization. No resource created.';
    assert.ok(configPath && path.isAbsolute(configPath));
    assertCanonicalDirectory(path.dirname(configPath));
    assert.ok(!fs.lstatSync(configPath).isSymbolicLink());
    verifyPrivateTestOutput(path.dirname(configPath));
    const rawConfig = fs.readFileSync(configPath);
    configDigest = digest(rawConfig);
    const parsed = JSON.parse(rawConfig);
    // The launcher issues the nonce for a one-command invocation. The supplied
    // authorization delegates one fresh nonce, never acceptance of external IDs.
    assert.equal(parsed.runNonce, 'GENERATE_FRESH_IN_PROCESS');
    api.reason =
      'Run authorization, fixed private coordination root, revision, image provenance fields or bounded budgets are invalid. See the safe-verification operator guide. No resource created.';
    config = validateConfig({ ...parsed, runNonce: nonce }, root, nonce);
    api.reason =
      'The fixed private output parent is missing, linked, shared or has unsuitable ACLs. No resource created.';
    parentIdentity = verifyPrivateTestOutput(config.outputParent);
    api.reason =
      'The immutable Windows appliance is missing, linked or has a mismatched SHA-256. No resource created.';
    assertCanonicalDirectory(path.dirname(config.image.path));
    assert.ok(!fs.lstatSync(config.image.path).isSymbolicLink());
    imageStat = fs.statSync(config.image.path);
    assert.ok(imageStat.isFile());
    assert.equal(await digestFile(config.image.path), config.image.sha256);
    api.reason =
      'The private appliance provenance manifest is missing, changed or does not bind approved origins and exact tools. No resource created.';
    assertCanonicalDirectory(path.dirname(config.image.provenancePath));
    verifyPrivateTestOutput(path.dirname(config.image.provenancePath));
    assert.ok(!fs.lstatSync(config.image.provenancePath).isSymbolicLink());
    const provenance = fs.readFileSync(config.image.provenancePath);
    assert.equal(digest(provenance), config.image.provenanceSha256);
    validateImageProvenance(JSON.parse(provenance), config);
    api.reason =
      'The private Windows DPAPI appliance credential file is unavailable or its path/ACL is unsafe. No resource created.';
    assertCanonicalDirectory(path.dirname(config.credentialPath));
    verifyPrivateTestOutput(path.dirname(config.credentialPath));
    assert.ok(!fs.lstatSync(config.credentialPath).isSymbolicLink());
    checkpointHost();
    api.reason =
      'Protected history or current documentation authority validation failed before resource creation.';
    execFileSync('python', ['tools/verify-documentation-authority.py', '--mode', 'current'], {
      cwd: root,
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    execFileSync(process.execPath, ['tools/verify-feature-011-contracts.mjs'], {
      cwd: root,
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    api.reason =
      'Hyper-V, immutable image, private filesystem, remaining disk budget or unresolved-run admission failed. No VM/database created.';
    run = {
      nonce,
      revision: config.revision,
      name: `shifaa-verify-${nonce}`,
      output: path.join(config.outputParent, nonce),
      deadline: Date.now() + config.budget.minutes * 60000,
    };
    assert.ok(!fs.existsSync(run.output));
    assert.ok(
      !fs.existsSync(path.join(config.outputParent, `authorization-${configDigest}.json`)),
      'Authorization already consumed',
    );
    provider('Preflight'); // Read-only host inventory / image / capability checks.
    return run;
  };
  api.reserve = async () => {
    checkpointHost();
    const lock = path.join(config.outputParent, 'active-verification.lock');
    reservation = fs.openSync(lock, 'wx', 0o600); // No stale lock adoption.
    fs.writeFileSync(reservation, JSON.stringify({ nonce, revision: config.revision }));
    reservationIdentity = fs.fstatSync(reservation);
    // Reusing an unexpired config cannot authorize another run. Keep this tiny
    // consumed receipt after success; a new attributable authorization is needed.
    const consumed = path.join(config.outputParent, `authorization-${configDigest}.json`);
    fs.writeFileSync(consumed, JSON.stringify({ nonce, revision: config.revision }), {
      flag: 'wx',
      mode: 0o600,
    });
    createPrivateOutput({ path: run.output, nonce });
    run.outputIdentity = verifyPrivateTestOutput(run.output);
    // A local bundle contains committed objects, never ignored/private worktree data.
    await createSourceBundle(root, path.join(run.output, 'source.bundle'));
    run.bundleSha256 = await digestFile(path.join(run.output, 'source.bundle'));
    api.reason =
      'Verification incomplete; inspect the private run journal. Unknown resources remain preserved and block another run.';
  };
  api.create = async () => {
    run.vmId = provider('Create').vmId;
    assert.match(run.vmId, /^[a-f0-9-]{36}$/i);
  };
  api.prepare = async () => provider('Prepare');
  api.checkpoint = async () => provider('Checkpoint');
  api.execute = async () => provider('Execute').results;
  api.teardown = async () => provider('Teardown');
  api.finalize = async (_run, status, results) => {
    writePrivateReport(path.join(run.output, 'result.json'), {
      nonce,
      status,
      revision: run.revision,
      results,
    });
    const lock = path.join(config.outputParent, 'active-verification.lock');
    const currentLock = fs.lstatSync(lock);
    assert.ok(!currentLock.isSymbolicLink() && currentLock.isFile());
    assert.equal(currentLock.dev, reservationIdentity.dev, 'Lock filesystem substituted');
    assert.equal(currentLock.ino, reservationIdentity.ino, 'Lock identity substituted');
    assert.equal(JSON.parse(fs.readFileSync(lock, 'utf8')).nonce, nonce);
    fs.closeSync(reservation);
    reservation = undefined;
    fs.unlinkSync(lock); // Only this exclusively created, identity-bound lock.
  };
  api.preserve = async (_run, summary) => {
    if (run?.outputIdentity) {
      try {
        assert.ok(same(run.outputIdentity, verifyPrivateTestOutput(run.output)));
        writePrivateReport(path.join(run.output, 'blocked.json'), {
          nonce,
          revision: run.revision,
          ...summary,
        });
      } catch {
        /* Never write to a substituted output. */
      }
    }
    // No timeout/SIGINT catch invokes removal by name. The lock stays fail-closed.
    if (reservation !== undefined) {
      fs.closeSync(reservation);
      reservation = undefined;
    }
  };
  return api;
}
