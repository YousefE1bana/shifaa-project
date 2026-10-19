import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { verifyPrivateTestOutput } from './test-resource-context.mjs';

const denied = (reason) => {
  throw new Error(`test-launcher-denied: ${reason}`);
};

export class ResourceCommandFailure extends Error {
  constructor(executable, failure) {
    super(
      `test-launcher-denied: command failed (${executable}; ${failure.code === 'ETIMEDOUT' ? 'timeout' : 'nonzero'})`,
    );
    this.exitCode = failure.status;
    this.timedOut = failure.code === 'ETIMEDOUT';
  }
}

// Commands never use a shell or inherit PostgreSQL/Docker target overrides.
// Failure messages intentionally exclude argv, environment, stdout and stderr.
export function resourceCommand(executable, args, input, cwd) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^(PG|DATABASE|DOCKER|COMPOSE)/i.test(key)),
  );
  try {
    return execFileSync(executable, args, {
      cwd,
      input,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: environment,
    }).trim();
  } catch (error) {
    throw new ResourceCommandFailure(executable, error);
  }
}

export function dockerCommand(context, args, input) {
  return resourceCommand('docker', ['--context', context, ...args], input);
}

export function dockerObservation(context) {
  const [selected] = JSON.parse(resourceCommand('docker', ['context', 'inspect', context]));
  const engine = JSON.parse(dockerCommand(context, ['info', '--format', '{{json .}}']));
  return { context, engine: engine.ID, endpoint: selected.Endpoints?.docker?.Host };
}

export function resourceInventory(context) {
  const names = (args) => dockerCommand(context, args).split(/\r?\n/).filter(Boolean).sort();
  return {
    containers: names(['ps', '-aq', '--no-trunc']),
    volumes: names(['volume', 'ls', '-q']),
    networks: names(['network', 'ls', '-q', '--no-trunc']),
    networkNames: names(['network', 'ls', '--format', '{{.Name}}']),
    projects: names(['ps', '-a', '--format', '{{.Label "com.docker.compose.project"}}']),
  };
}

export function assertCanonicalDirectory(directory) {
  if (!path.isAbsolute(directory)) denied('absolute private output root required');
  let cursor = path.parse(directory).root;
  for (const segment of directory.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const stat = lstatSync(cursor);
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()
    )
      denied('output reparse point or non-directory');
  }
}

function powershell(script) {
  if (process.platform !== 'win32') denied('Windows private-output ACL support required');
  return resourceCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, 'utf16le').toString('base64'),
  ]);
}

export function createPrivateOutput({ path: destination, nonce }) {
  assertCanonicalDirectory(path.dirname(destination));
  // Non-recursive mkdir rejects EEXIST. The
  // already-private parent prevents access before the new protected ACL is set.
  const literal = destination.replaceAll("'", "''");
  mkdirSync(destination, { mode: 0o700 });
  if (process.platform === 'win32')
    powershell(
      `$p='${literal}'; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner($sid); foreach($s in @($sid,(New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'))){$r=New-Object Security.AccessControl.FileSystemAccessRule($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($r)}; Set-Acl -LiteralPath $p -AclObject $acl`,
    );
  verifyRunOutput(destination);
  const stat = lstatSync(destination, { bigint: true });
  return {
    path: destination,
    nonce,
    exclusive: true,
    identity: {
      dev: String(stat.dev),
      ino: String(stat.ino),
      birthtimeNs: String(stat.birthtimeNs),
    },
  };
}

export function writePrivateReport(destination, report) {
  assertCanonicalDirectory(path.dirname(destination));
  const identity = verifyPrivateTestOutput(path.dirname(destination));
  // Only schema-limited reports supplied by the coordinator reach this boundary.
  writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (
    JSON.stringify(identity) !== JSON.stringify(verifyPrivateTestOutput(path.dirname(destination)))
  )
    denied('output replaced during report write; preserve state');
}

export function sourceBytes(worktree, file, revision) {
  const absolute = path.resolve(worktree, file);
  if (path.relative(worktree, absolute).startsWith('..')) denied('bootstrap path escape');
  let cursor = absolute;
  while (cursor !== worktree) {
    if (lstatSync(cursor).isSymbolicLink()) denied('bootstrap symlink');
    cursor = path.dirname(cursor);
  }
  if (realpathSync.native(absolute).toLowerCase() !== absolute.toLowerCase())
    denied('bootstrap reparse point');
  const bytes = readFileSync(absolute);
  // Bind the captured bytes, not a later reread, to approved Git source.
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (resourceCommand('git', ['rev-parse', `${revision}:${file}`], undefined, worktree) !== blob)
    denied('bootstrap bytes differ from approved revision');
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

// The launcher retains Windows SID/ACL checks. Hosted Linux CI uses the same
// canonical-path boundary plus current-UID ownership and private mode bits.
export function verifyRunOutput(destination) {
  assertCanonicalDirectory(destination);
  if (process.platform === 'win32') return verifyPrivateTestOutput(destination);
  if (process.platform !== 'linux') denied('unsupported private-output platform');
  const stat = lstatSync(destination);
  if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)
    denied('output must be current-user owned and private');
  return { dev: stat.dev, ino: stat.ino };
}
