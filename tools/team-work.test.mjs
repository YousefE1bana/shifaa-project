import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main, safeFile, parseArgs } from './team-work.mjs';

test('unsafe/private data is excluded; ordinary synthetic source is eligible', () => {
  const cases = [
    ['src/example.ts', 'export const status = "not_fully_checked";', null],
    ['.env.local', 'redacted', 'private'],
    ['.npmrc', 'redacted', 'private'],
    ['specs/012/evidence/raw.json', '{}', 'private'],
    ['database.dump', 'redacted', 'private'],
    ['src/key.ts', ['-----BEGIN', 'PRIVATE KEY-----'].join(' '), 'credential'],
    ['src/config.ts', ['postgresql://', 'user:password@host/db'].join(''), 'credential'],
    ['src/data.json', '{"patient_name":"identifying fixture"}', 'identifying'],
    ['../outside.ts', '', 'unsafe'],
    ['large.ts', 'x'.repeat(1024 * 1024 + 1), 'large'],
    ['photo.png', 'binary', 'unclassified'],
  ];
  for (const [path, content, reason] of cases) {
    const actual = safeFile(path, Buffer.from(content));
    if (reason) assert.match(actual, new RegExp(reason));
    else assert.equal(actual, null);
  }
  assert.match(safeFile('src/linked.ts', Buffer.from('safe'), { linked: true }), /linked/);
});

test('malformed CLI input stops before any network operation', () => {
  assert.throws(() => parseArgs(['--issue']), /Missing value/);
  assert.throws(() => parseArgs(['--force']), /Unknown argument/);
  assert.throws(
    () =>
      main(['handoff'], () => {
        throw new Error('isolated command boundary');
      }),
    /isolated command boundary/,
  );
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'shifaa-team-'));
  const repo = join(dir, 'checkout'),
    bare = join(dir, 'remote.git');
  mkdirSync(repo);
  function command(bin, args, options = {}) {
    const r = spawnSync(bin, args, {
      cwd: repo,
      encoding: 'utf8',
      ...options,
      env: { ...process.env, ...options.env },
      maxBuffer: 16 * 1024 * 1024,
    });
    if (r.status !== 0 || r.error) {
      if (options.allowFailure) return null;
      throw new Error(`${bin} failed: ${r.stderr || r.error}`);
    }
    return r.stdout.trimEnd();
  }
  const git = (...args) => command('git', args);
  git('init', '-b', 'main');
  git('config', 'core.autocrlf', 'false');
  git('config', 'user.name', 'Synthetic teammate');
  git('config', 'user.email', 'synthetic@example.invalid');
  writeFileSync(join(repo, 'source.ts'), 'export const count = 1;\n');
  writeFileSync(join(repo, '.gitignore'), '.env*\n');
  git('add', 'source.ts', '.gitignore');
  git('commit', '-m', 'published base');
  command('git', ['init', '--bare', bare]);
  git('remote', 'add', 'origin', bare);
  git('push', '-u', 'origin', 'main');
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  git('switch', '-c', 'codex/unfinished');
  const state = {
    login: 'teammate',
    claim: null,
    prs: [],
    issue: { number: 12, title: 'Synthetic work', labels: [], state: 'open', assignees: [] },
    comments: [],
    failPush: false,
    dependencies: [],
  };
  const runner = (bin, args, options = {}) => {
    if (bin === 'git') {
      if (args.includes('get-url')) return 'https://github.com/team/demo.git';
      if (args.includes('push') && state.failPush) throw new Error('simulated offline push');
      return command(bin, args, options);
    }
    assert.equal(bin, 'gh');
    if (args[0] === 'repo')
      return JSON.stringify({
        nameWithOwner: 'team/demo',
        defaultBranchRef: { name: 'main' },
        url: 'https://github.com/team/demo',
      });
    if (args[0] === 'pr' && args[1] === 'list')
      return JSON.stringify(
        state.prs.map((p) => ({
          ...p,
          headRefOid: git('ls-remote', 'origin', `refs/heads/${p.headRefName}`).split('\t')[0],
        })),
      );
    if (args[0] === 'pr' && args[1] === 'create') {
      state.prs = [
        {
          number: 30,
          isDraft: true,
          headRefName: args[args.indexOf('--head') + 1],
          author: { login: state.login },
          url: 'https://github.com/team/demo/pull/30',
        },
      ];
      return state.prs[0].url;
    }
    if (args[0] === 'pr' && args[1] === 'edit') return '';
    if (args[0] === 'project') return null;
    if (args[0] === 'issue') return JSON.stringify([state.issue]);
    assert.equal(args[0], 'api');
    const endpoint = args[1],
      method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET';
    const body = options.input ? JSON.parse(options.input) : null;
    if (endpoint === 'user') return JSON.stringify({ login: state.login });
    if (endpoint.endsWith('/git/refs') && method === 'POST') {
      if (state.claim) throw new Error('ownership collision');
      state.claim = body.sha;
      command('git', ['--git-dir', bare, 'update-ref', body.ref, body.sha]);
      return '{}';
    }
    if (endpoint.includes('/git/ref/heads/handoff-ownership/'))
      return state.claim ? JSON.stringify({ object: { sha: state.claim } }) : null;
    if (endpoint.includes('/git/refs/heads/handoff-ownership/') && method === 'PATCH') {
      git('merge-base', '--is-ancestor', state.claim, body.sha);
      command('git', [
        '--git-dir',
        bare,
        'update-ref',
        'refs/heads/handoff-ownership/issue-12',
        body.sha,
        state.claim,
      ]);
      state.claim = body.sha;
      return '{}';
    }
    if (endpoint.includes('/git/matching-refs/')) return '[]';
    if (endpoint.includes('/dependencies/')) return JSON.stringify(state.dependencies);
    if (endpoint.endsWith('/assignees')) {
      state.issue.assignees = method === 'DELETE' ? [] : body.assignees.map((login) => ({ login }));
      return JSON.stringify(state.issue);
    }
    if (endpoint.endsWith('/comments?per_page=100')) return JSON.stringify(state.comments);
    if (endpoint.endsWith('/comments')) {
      state.comments.push({ ...body, user: { login: state.login } });
      return '{}';
    }
    if (endpoint.endsWith('/issues/12')) return JSON.stringify(state.issue);
    throw new Error(`Unexpected GitHub boundary: ${endpoint}`);
  };
  const args = [
    'handoff',
    '--issue',
    '12',
    '--task',
    'synthetic tool',
    '--progress',
    'partial',
    '--completed',
    'source edits',
    '--pending',
    'review',
    '--blockers',
    'none',
  ];
  return { dir, repo, bare, git, runner, state, args };
}

test('snapshot and retry preserve dirty files, staged index and private unpublished history', () => {
  const f = fixture(),
    original = process.cwd();
  try {
    process.chdir(f.repo);
    const unsafeMetadata = [...f.args];
    unsafeMetadata[unsafeMetadata.indexOf('--progress') + 1] =
      '{"patient_name":"identifying fixture"}';
    assert.throws(() => main(unsafeMetadata, f.runner), /Unsafe or oversized --progress/);
    assert.equal(f.state.claim, null);
    assert.equal(f.state.prs.length, 0);
    // Even an already committed private blob must never travel in WIP ancestry.
    mkdirSync(join(f.repo, 'private'));
    writeFileSync(join(f.repo, 'private', 'draft.json'), '{"restricted":true}');
    f.git('add', 'private/draft.json');
    f.git('commit', '-m', 'local private work');
    writeFileSync(join(f.repo, 'source.ts'), 'export const count = 2;\n');
    f.git('add', 'source.ts');
    writeFileSync(join(f.repo, 'source.ts'), 'export const count = 3;\n');
    writeFileSync(join(f.repo, '.env.local'), 'local-only');
    const index = f.git('diff', '--cached'),
      status = f.git('status', '--porcelain'),
      head = f.git('rev-parse', 'HEAD');
    f.state.failPush = true;
    assert.throws(() => main(f.args, f.runner), /offline/);
    assert.equal(f.git('diff', '--cached'), index);
    assert.equal(f.git('status', '--porcelain'), status);
    assert.equal(f.git('rev-parse', 'HEAD'), head);
    const saved = f.git('for-each-ref', '--format=%(objectname)', 'refs/team-handoffs/');
    const m = JSON.parse(f.git('show', `${saved}:.team-handoff/manifest.json`));
    assert.equal(m.stagedVariantCount, 1);
    const stagedTree = f.git('for-each-ref', '--format=%(objectname)', 'refs/team-staging/');
    assert.equal(f.git('show', `${stagedTree}:source.ts`), 'export const count = 2;');
    assert.equal(f.git('show', `${saved}:source.ts`), 'export const count = 3;');
    assert.equal(f.git('ls-tree', '-r', '--name-only', saved).includes('private/'), false);
    // Check ancestry explicitly: the unpublished source commit is not a parent.
    assert.equal(f.git('rev-list', saved).includes(head), false);
    f.state.failPush = false;
    main(['handoff', '--retry', saved], f.runner);
    assert.equal(f.git('ls-remote', 'origin', `refs/heads/${m.branch}`).split('\t')[0], saved);
    assert.equal(f.state.prs.length, 1);
    assert.equal(f.state.claim, saved);
    main(['handoff', '--retry', saved], f.runner);
    assert.equal(f.state.prs.length, 1);
    assert.equal(f.git('status', '--porcelain'), status);
    assert.equal(readFileSync(join(f.repo, '.env.local'), 'utf8'), 'local-only');
  } finally {
    process.chdir(original);
  }
});

test('another assigned owner is rejected without publishing or editing the checkout', () => {
  const f = fixture(),
    original = process.cwd();
  try {
    process.chdir(f.repo);
    writeFileSync(join(f.repo, 'source.ts'), 'export const count = 4;\n');
    const before = f.git('status', '--porcelain');
    f.state.issue.assignees = [{ login: 'other-owner' }];
    assert.throws(() => main(f.args, f.runner), /another teammate/);
    assert.equal(f.state.prs.length, 0);
    assert.equal(f.state.claim, null);
    assert.equal(f.git('status', '--porcelain'), before);
  } finally {
    process.chdir(original);
  }
});

test('dirty synchronization never fast-forwards or overwrites the current checkout', () => {
  const f = fixture(),
    original = process.cwd();
  try {
    process.chdir(f.repo);
    writeFileSync(join(f.repo, 'source.ts'), 'keep my work\n');
    assert.throws(() => main(['start', '--ff'], f.runner), /unpublished changes/);
    assert.equal(readFileSync(join(f.repo, 'source.ts'), 'utf8'), 'keep my work\n');
    assert.equal(existsSync(join(f.repo, '.team-handoff')), false);
  } finally {
    process.chdir(original);
  }
});

test('resume checks out the exact published commit without touching the dirty source worktree', () => {
  const f = fixture(),
    original = process.cwd();
  try {
    process.chdir(f.repo);
    writeFileSync(join(f.repo, 'source.ts'), 'export const count = 5;\n');
    main(f.args, f.runner);
    const saved = f.git('for-each-ref', '--format=%(objectname)', 'refs/team-handoffs/');
    const before = f.git('status', '--porcelain');
    main(['start', '--pr', '30', '--resume'], f.runner);
    const target = join(f.repo, '.worktrees', `team-issue-12-teammate-${saved.slice(0, 12)}`);
    assert.equal(
      spawnSync('git', ['rev-parse', 'HEAD'], { cwd: target, encoding: 'utf8' }).stdout.trim(),
      saved,
    );
    assert.equal(readFileSync(join(target, 'source.ts'), 'utf8'), 'export const count = 5;\n');
    assert.equal(
      f.git('status', '--porcelain').includes(' M source.ts'),
      before.includes(' M source.ts'),
    );
    assert.throws(() => main(['start', '--pr', '30', '--resume'], f.runner), /already exists/);
  } finally {
    process.chdir(original);
  }
});

test('current dependency and unauthorized transfer both prevent resume', () => {
  const f = fixture(),
    original = process.cwd();
  try {
    process.chdir(f.repo);
    writeFileSync(join(f.repo, 'source.ts'), 'export const count = 6;\n');
    main(f.args, f.runner);
    f.state.dependencies = [{ number: 13, state: 'open' }];
    assert.throws(
      () => main(['start', '--pr', '30', '--resume'], f.runner),
      /current Issue dependency/,
    );
    f.state.dependencies = [];
    f.state.login = 'next-owner';
    f.state.issue.assignees = [{ login: 'next-owner' }];
    assert.throws(
      () => main(['start', '--pr', '30', '--resume'], f.runner),
      /transfer authorization/,
    );
  } finally {
    process.chdir(original);
  }
});

test('explicit current-owner transfer admits a new teammate without changing the original payload', () => {
  const f = fixture(),
    original = process.cwd();
  try {
    process.chdir(f.repo);
    writeFileSync(join(f.repo, 'source.ts'), 'export const count = 7;\n');
    main([...f.args, '--to', 'next-owner'], f.runner);
    const saved = f.git('for-each-ref', '--format=%(objectname)', 'refs/team-handoffs/');
    f.state.login = 'next-owner';
    main(['start', '--pr', '30', '--resume'], f.runner);
    const target = join(f.repo, '.worktrees', `team-issue-12-next-owner-${saved.slice(0, 12)}`);
    assert.equal(
      spawnSync('git', ['rev-parse', 'HEAD'], { cwd: target, encoding: 'utf8' }).stdout.trim(),
      saved,
    );
    assert.equal(
      JSON.parse(f.git('show', `${f.state.claim}:.team-handoff/manifest.json`)).owner,
      'next-owner',
    );
    assert.equal(f.git('show', `${saved}:source.ts`), 'export const count = 7;');
  } finally {
    process.chdir(original);
  }
});
