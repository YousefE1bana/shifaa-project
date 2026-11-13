import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { baseImage } from './profiles.mjs';

export function git(root, args, options = {}) {
  return execFileSync('git', ['-c', 'core.longpaths=true', '--no-optional-locks', ...args], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
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
  const files = [...new Set([...tracked, ...admitted])].filter((file) => !excluded(file));
  const omitted = [...tracked, ...untracked].filter((file) => !files.includes(file));
  return { files, omitted };
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
  paths.sort();
  const digest = createHash('sha256').update(baseImage);
  for (const file of paths)
    digest
      .update(file)
      .update('\0')
      .update(readFileSync(safeSource(root, file)));
  return { paths, hash: digest.digest('hex') };
}

export function dockerEnvironment(env = process.env) {
  // No DATABASE_URL, Supabase/Auth/JWT keys, NODE_OPTIONS or tool injection.
  return Object.fromEntries(
    [
      'PATH',
      'Path',
      'SystemRoot',
      'SYSTEMROOT',
      'WINDIR',
      'HOME',
      'USERPROFILE',
      'LOCALAPPDATA',
      'APPDATA',
      'TEMP',
      'TMP',
    ]
      .filter((name) => env[name] !== undefined)
      .map((name) => [name, env[name]]),
  );
}

export function localDocker(run = execFileSync, env = process.env) {
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
    '--user=1000:1000',
    '--pids-limit=512',
    '--memory=6g',
    '--cpus=4',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=1g,uid=1000,gid=1000',
    '--tmpfs',
    '/work:rw,exec,nosuid,nodev,size=8g,uid=1000,gid=1000',
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
    'docker',
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
        'docker',
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
  const { files, omitted } = sourceFiles(root);
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
  const result = spawnSync('docker', [...docker.prefix, ...args], {
    env: docker.options.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  unchanged();
  return {
    status: result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status ?? 1,
    profile: 'ordinary-offline',
    comprehensive: false,
    snapshot: directory,
    omitted,
    image: image.Id,
    sourcePreserved: true,
  };
}
