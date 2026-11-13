import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { baseImage } from './profiles.mjs';

const checkout = resolve(import.meta.dirname, '../..');
const primary = checkout.split(`${sep}.worktrees${sep}`)[0];
function outsideCheckout(directory) {
  const rel = relative(primary, resolve(directory));
  return (
    (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) &&
    !/(?:^|[\\/])node_modules(?:[\\/]|$)/i.test(directory)
  );
}

export function hostExecutable(name, env = process.env) {
  assert.ok(['git', 'docker', 'gh'].includes(name));
  for (const directory of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (!isAbsolute(directory) || !outsideCheckout(directory)) continue;
    const candidate = join(directory, name + (process.platform === 'win32' ? '.exe' : ''));
    if (
      existsSync(candidate) &&
      outsideCheckout(realpathSync(candidate)) &&
      lstatSync(realpathSync(candidate)).isFile()
    )
      return realpathSync(candidate);
  }
  throw Object.assign(new Error('Trusted host executable unavailable'), { code: 'ENOENT' });
}

export function git(root, args, options = {}) {
  return execFileSync(
    hostExecutable('git'),
    ['-c', 'core.longpaths=true', '-c', 'core.fsmonitor=false', '--no-optional-locks', ...args],
    {
      cwd: root,
      env: dockerEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      ...options,
    },
  );
}

export function safeSource(root, file) {
  assert.ok(!isAbsolute(file) && !/[\\:,\r\n]/.test(file), 'Unsafe source path');
  assert.ok(file.split('/').every((part) => part && part !== '.' && part !== '..'));
  // Never dereference a symlink, including linked ancestors or submodules.
  let current = resolve(root);
  for (const part of file.split('/')) {
    current = join(current, part);
    assert.ok(!lstatSync(current).isSymbolicLink(), 'Linked source is not admitted');
  }
  assert.ok(lstatSync(current).isFile(), 'Source must be a regular file');
  return current;
}

export function excluded(file) {
  return (
    /(^|\/)(?:\.git|\.worktrees|node_modules|\.tmp|private|backups?)(\/|$)/i.test(file) ||
    (/(^|\/)\.env(?:\.|$)/i.test(file) && !/\.(?:example|sample|template)$/.test(file)) ||
    /\.(?:pem|key|pfx|p12|dump|backup|sqlite|sqlite3|db)$/i.test(file)
  );
}

export function sourceFiles(root) {
  const tracked = git(root, ['ls-files', '-z']).toString().split('\0').filter(Boolean);
  const deleted = git(root, ['ls-files', '--deleted', '-z']).toString().split('\0').filter(Boolean);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .toString()
    .split('\0')
    .filter(Boolean);
  // Untracked evidence/docs are deliberately not silently exported. Stage reviewed
  // files explicitly to include them. Ordinary new source files remain testable.
  const admitted = untracked.filter(
    (file) =>
      /^(?:apps|packages|services|tools|tests)\//.test(file) &&
      /\.(?:[cm]?[jt]sx?|json)$/.test(file) &&
      !/(?:evidence|fixtures|captures)\//i.test(file),
  );
  const files = [...new Set([...tracked, ...admitted])].filter(
    (file) => !excluded(file) && !deleted.includes(file),
  );
  const omitted = [...tracked, ...untracked].filter(
    (file) => !files.includes(file) && !deleted.includes(file),
  );
  return { files, omitted, deleted };
}

export function dependencyInputs(root) {
  const paths = git(root, ['ls-files', '-z'])
    .toString()
    .split('\0')
    .filter(
      (file) =>
        file === 'package.json' ||
        file.endsWith('/package.json') ||
        [
          'pnpm-lock.yaml',
          'pnpm-workspace.yaml',
          '.npmrc',
          'tools/verification/Dockerfile',
        ].includes(file) ||
        file.startsWith('patches/'),
    );
  if (!paths.includes('tools/verification/Dockerfile')) paths.push('tools/verification/Dockerfile');
  // A deleted workspace manifest is an input change, not an instruction to
  // silently reuse its previous installed dependencies.
  const present = paths.filter((file) => existsSync(join(root, file)));
  present.sort();
  const digest = createHash('sha256').update(baseImage);
  for (const file of present)
    digest
      .update(file)
      .update('\0')
      .update(readFileSync(safeSource(root, file)));
  return { paths: present, hash: digest.digest('hex') };
}

export function dockerEnvironment(env = process.env) {
  // No DATABASE_URL, Supabase/Auth/JWT keys, NODE_OPTIONS or tool injection.
  const clean = Object.fromEntries(
    [
      'SystemRoot',
      'SYSTEMROOT',
      'WINDIR',
      'HOME',
      'USERPROFILE',
      'LOCALAPPDATA',
      'APPDATA',
      'ProgramFiles',
      'ProgramFiles(x86)',
      'ProgramData',
      'CommonProgramFiles',
      'TEMP',
      'TMP',
    ]
      .filter((name) => env[name] !== undefined)
      .map((name) => [name, env[name]]),
  );
  clean.PATH = (env.PATH ?? env.Path ?? '')
    .split(delimiter)
    .filter((directory) => isAbsolute(directory) && outsideCheckout(directory))
    .join(delimiter);
  return clean;
}

export function localDocker(
  run = (name, args, options) => execFileSync(hostExecutable(name, options.env), args, options),
  env = process.env,
) {
  assert.ok(
    !env.DOCKER_HOST && !env.DOCKER_CONTEXT && !env.DOCKER_TLS_VERIFY && !env.DOCKER_CERT_PATH,
    'Docker overrides must be unset; select the intended local context explicitly with docker context use',
  );
  const options = {
    encoding: 'utf8',
    env: dockerEnvironment(env),
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  const context = run('docker', ['context', 'show'], options).trim();
  assert.match(context, /^[a-zA-Z0-9_.-]+$/);
  const endpoint = run(
    'docker',
    ['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'],
    options,
  ).trim();
  assert.ok(
    endpoint.startsWith('unix:///') || /^npipe:\/\/\/\/+\.\/pipe\//.test(endpoint),
    'Remote Docker is not admitted',
  );
  const prefix = ['--context', context];
  assert.equal(
    run('docker', [...prefix, 'info', '--format', '{{.OSType}}'], options).trim(),
    'linux',
  );
  return { prefix, options };
}

export function sandboxArgs(directory, image, name = `shifaa-verify-${randomUUID()}`) {
  assert.ok(isAbsolute(directory) && !/[,\r\n]/.test(directory));
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  assert.match(name, /^shifaa-verify-[a-f0-9-]+$/);
  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;
  assert.ok(uid > 0 && gid > 0, 'Run verification as a non-root user');
  return [
    'run',
    '--rm',
    '--pull=never',
    '--name',
    name,
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    `--user=${uid}:${gid}`,
    '--pids-limit=512',
    '--memory=6g',
    '--cpus=4',
    '--tmpfs',
    `/tmp:rw,nosuid,nodev,size=1g,uid=${uid},gid=${gid}`,
    '--tmpfs',
    `/work:rw,exec,nosuid,nodev,size=8g,uid=${uid},gid=${gid}`,
    '--mount',
    `type=bind,source=${directory},target=/source,readonly`,
    '--workdir=/work',
    '--entrypoint=node',
    image,
    '/source/tree/tools/verification/inside.mjs',
  ];
}

export function copySources(root, directory, files) {
  const hashes = new Map();
  for (const file of files) {
    const original = safeSource(root, file);
    const bytes = readFileSync(original);
    hashes.set(file, createHash('sha256').update(bytes).digest('hex'));
    const target = join(directory, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: 'wx' });
  }
  return () => {
    for (const [file, hash] of hashes)
      assert.equal(
        createHash('sha256')
          .update(readFileSync(safeSource(root, file)))
          .digest('hex'),
        hash,
        `Source changed during verification: ${file}`,
      );
  };
}

export function prepare(root) {
  const docker = localDocker();
  const { paths, hash } = dependencyInputs(root);
  const directory = mkdtempSync(join(tmpdir(), 'shifaa-verify-build-'));
  const unchanged = copySources(root, directory, paths);
  const tag = `shifaa/verify:${hash}`;
  const result = spawnSync(
    hostExecutable('docker', docker.options.env),
    [
      ...docker.prefix,
      'buildx',
      'build',
      '--load',
      '--pull=false',
      '--build-arg',
      `BASE_IMAGE=${baseImage}`,
      '--label',
      `shifaa.verify.inputs=${hash}`,
      '--tag',
      tag,
      '--file',
      join(directory, 'tools/verification/Dockerfile'),
      directory,
    ],
    { env: docker.options.env, stdio: 'inherit', windowsHide: true },
  );
  unchanged();
  return {
    status: result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status ?? 1,
    image: tag,
    buildContext: directory,
    scope: 'Explicit container-only dependency preparation; no host install or service mutation',
  };
}

export function verify(root) {
  const docker = localDocker();
  const { hash } = dependencyInputs(root);
  const tag = `shifaa/verify:${hash}`;
  let image;
  try {
    image = JSON.parse(
      execFileSync(
        hostExecutable('docker', docker.options.env),
        [
          ...docker.prefix,
          'image',
          'inspect',
          tag,
          '--format',
          '{"Id":{{json .Id}},"inputs":{{json (index .Config.Labels "shifaa.verify.inputs")}}}',
        ],
        { ...docker.options, maxBuffer: 4 * 1024 * 1024 },
      ),
    );
  } catch {
    return {
      status: 'BLOCKED',
      exitCode: 2,
      code: 'IMAGE_NOT_PREPARED',
      remedy:
        'Run pnpm verify:prepare explicitly. verify never installs, pulls, builds or falls back to host execution.',
    };
  }
  assert.equal(image.inputs, hash, 'Stale verification image');
  const { files, omitted, deleted } = sourceFiles(root);
  const directory = mkdtempSync(join(tmpdir(), 'shifaa-verify-source-'));
  const unchanged = copySources(root, join(directory, 'tree'), files);
  // HEAD ancestry only, not other local branches, config, hooks, credentials or
  // private/ignored work. Historical contract readers need immutable Git blobs.
  git(root, ['bundle', 'create', join(directory, 'history.bundle'), 'HEAD']);
  writeFileSync(
    join(directory, 'identity.json'),
    JSON.stringify({
      head: git(root, ['rev-parse', 'HEAD']).toString().trim(),
    }),
  );
  const args = sandboxArgs(directory, image.Id);
  const result = spawnSync(
    hostExecutable('docker', docker.options.env),
    [...docker.prefix, ...args],
    {
      env: docker.options.env,
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  unchanged();
  return {
    status: result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status ?? 1,
    profile: 'ordinary-offline',
    comprehensive: false,
    snapshot: directory,
    omitted,
    deleted,
    image: image.Id,
    sourcePreserved: true,
  };
}
