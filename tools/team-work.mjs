import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAX_FILE = 1024 * 1024;
const SAFE_EXT = /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|md|css|html|sql|ps1|py|sh|txt|svg|graphql|gitignore)$/i;
const DENY_PATH = /(?:^|\/)(?:\.git|\.env(?:\..*)?|\.tmp|\.agents|\.kimi-code|node_modules|\.worktrees|private|backups?|evidence|artifacts|coverage|dist|build|\.handoff)(?:\/|$)|(?:secret|credential|patient-data|dump|\.pem$|\.key$|\.p12$|\.bak$|\.dump$|\.sqlite|\.zip$|\.tar|\.log$)/i;
const SECRET = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})\b|(?:password|secret|api[_-]?key|access[_-]?token)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i;

export function safeFile(path, bytes, { linked = false } = {}) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => p === '..' || p === '.')) return 'unsafe path';
  if (linked) return 'symlink or linked ancestor';
  if (DENY_PATH.test(path) || path === '.specify/feature.json' || /(?:^|\/)skills-lock\.json$/.test(path)) return 'private, generated, credential or local state';
  if (!SAFE_EXT.test(path) && !['Dockerfile', 'Makefile', '.gitignore', '.npmrc'].includes(path)) return 'unclassified file type';
  if (bytes.length > MAX_FILE || bytes.includes(0)) return 'large or binary file';
  const content = bytes.toString('utf8');
  if (SECRET.test(content)) return 'possible credential; manual review required';
  if (/\b\d{14}\b|\b(?:patient[_ ]?name|national[_ ]?id|patient[_ ]?email)["']?\s*[:=]\s*["'][^"']+["']/i.test(content)) return 'possible identifying data; manual review required';
  return null;
}

export function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--dry-run', '--list', '--ff', '--resume'].includes(arg)) options[arg.slice(2)] = true;
    else if (['--issue', '--task', '--progress', '--completed', '--pending', '--blockers', '--depends-on', '--pr', '--retry', '--to'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = args[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function runProcess(command, args, { cwd = process.cwd(), env, input, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: false });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    // Do not print arbitrary subprocess output: it can include remote URLs or credentials.
    throw new Error(`${command} ${args[0]} failed (exit ${result.status ?? 'unavailable'}). Local work is preserved. Check Git/GitHub authentication and permissions, then retry.`);
  }
  return result.stdout.trimEnd();
}
let run = runProcess;
function git(args, options = {}) { return run('git', ['-c', 'core.longpaths=true', ...args], options); }
function gh(args, options = {}) { return run('gh', args, options); }
function api(repo, endpoint, args = []) { return JSON.parse(gh(['api', `repos/${repo}/${endpoint}`, ...args])); }
function post(repo, endpoint, value) { return JSON.parse(gh(['api', `repos/${repo}/${endpoint}`, '--method', 'POST', '--input', '-'], { input: JSON.stringify(value) })); }
const lines = text => text ? text.split('\0').filter(Boolean) : [];
function context() {
  const root = resolve(git(['rev-parse', '--show-toplevel']));
  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true });
  if (!branch) throw new Error('Detached HEAD: select an owned task branch before publishing.');
  if (git(['diff', '--name-only', '--diff-filter=U'])) throw new Error('Resolve merge conflicts before handoff.');
  const head = git(['rev-parse', 'HEAD']);
  const common = resolve(root, git(['rev-parse', '--git-common-dir']));
  const top = dirname(common);
  return { root, branch, head, common, top };
}
function remoteContext() {
  const remote = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef,url']));
  const login = JSON.parse(gh(['api', 'user'])).login;
  if (!/^[\w.-]+\/[\w.-]+$/.test(remote.nameWithOwner) || !/^[\w-]+$/.test(login)) throw new Error('Unsupported GitHub repository or actor identity.');
  const url = git(['remote', 'get-url', '--push', 'origin']);
  if (![ `https://github.com/${remote.nameWithOwner}.git`, `https://github.com/${remote.nameWithOwner}`, `git@github.com:${remote.nameWithOwner}.git` ].includes(url)) throw new Error('origin push URL does not match the authenticated GitHub repository.');
  return { repo: remote.nameWithOwner, login, defaultBranch: remote.defaultBranchRef.name, url: remote.url };
}
function issueNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Supply a positive GitHub Issue number with --issue.');
  return number;
}
function currentIssue(remote, number) {
  const issue = api(remote.repo, `issues/${number}`);
  if (issue.pull_request || issue.state !== 'open') throw new Error('The selected task must be an open GitHub Issue.');
  const other = issue.assignees.filter(a => a.login !== remote.login);
  if (other.length) throw new Error(`Issue #${number} is assigned to another teammate. Coordinate an explicit ownership transfer on the Issue first.`);
  return issue;
}
function inventory(ctx, base = ctx.head) {
  const names = [...new Set([
    ...lines(git(['diff', '--name-only', '-z', base])),
    ...lines(git(['ls-files', '--others', '--exclude-standard', '-z'])),
  ])].sort();
  const accepted = [], excluded = [];
  for (const path of names) {
    const full = resolve(ctx.root, path);
    let linked = !full.startsWith(ctx.root + sep);
    let cursor = full;
    while (cursor !== ctx.root && cursor.startsWith(ctx.root + sep)) {
      if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) linked = true;
      cursor = dirname(cursor);
    }
    const deleted = !existsSync(full);
    const bytes = deleted || linked ? Buffer.alloc(0) : readFileSync(full);
    const reason = safeFile(path, bytes, { linked });
    if (reason) excluded.push({ path, reason });
    else accepted.push({ path, bytes, deleted, executable: !deleted && Boolean(lstatSync(full).mode & 0o111) });
  }
  const ignored = lines(git(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']));
  return { accepted, excluded, ignored };
}
function claimRef(issue) { return `heads/handoff-ownership/issue-${issue}`; }
function readClaim(remote, issue) {
  const raw = gh(['api', `repos/${remote.repo}/git/ref/${claimRef(issue)}`], { allowFailure: true });
  if (!raw) {
    // Distinguish absence from an authentication or API outage before creating anything.
    api(remote.repo, 'git/matching-refs/heads/handoff-ownership/');
    return null;
  }
  return JSON.parse(raw).object.sha;
}
function manifestAt(commit, cwd) {
  const raw = git(['show', `${commit}:.team-handoff/manifest.json`], { cwd, allowFailure: true });
  if (!raw) throw new Error('Ownership/handoff reference has no valid manifest; manual recovery on its Issue is required.');
  const m = JSON.parse(raw);
  if (m.schema !== 1 || !/^[a-f0-9]{40}$/.test(m.payloadCommit) || !/^[\w-]+$/.test(m.owner) || !/^wip\/[\w/-]+$/.test(m.branch)) throw new Error('Invalid handoff manifest; no checkout or ownership change performed.');
  return m;
}
function checkMetadata(options) {
  for (const name of ['task', 'progress', 'completed', 'pending', 'blockers']) {
    if (!options[name]?.trim()) throw new Error(`Required: --${name} (use "none" where appropriate).`);
    if (options[name].length > 4000 || SECRET.test(options[name])) throw new Error(`Unsafe or oversized --${name}.`);
  }
}
function dependencies(remote, options) {
  const native = api(remote.repo, `issues/${issueNumber(options.issue)}/dependencies/blocked_by?per_page=100`);
  if (native.length === 100) throw new Error('Dependency list may be truncated; inspect the Issue before publishing.');
  const selected = [...new Set([...native.map(i => i.number), ...(options['depends-on'] || '').split(',').filter(Boolean).map(issueNumber)])];
  for (const number of selected) api(remote.repo, `issues/${number}`);
  return selected;
}
function payloadCommit(ctx, files, parent, message) {
  const index = join(ctx.common, `team-index-${randomUUID()}`);
  const env = { GIT_INDEX_FILE: index };
  // Start from the shared published base, never from unpublished local history:
  // a private file in an earlier local commit must not leak via a parent commit.
  git(['read-tree', ctx.base], { env });
  for (const file of files) {
    if (file.deleted) git(['update-index', '--force-remove', '--', file.path], { env });
    else {
      const blob = git(['hash-object', '-w', '--stdin'], { input: file.bytes });
      const existing = git(['ls-files', '--stage', '--', file.path]);
      const mode = existing.startsWith('100755') || file.executable ? '100755' : '100644';
      git(['update-index', '--add', '--cacheinfo', `${mode},${blob},${file.path}`], { env });
    }
  }
  const tree = git(['write-tree'], { env });
  const commit = git(['commit-tree', tree, '-p', parent, '-m', message]);
  // Temporary indexes are retained locally for recovery; never touch the user's index.
  return { commit, tree, env };
}
function handoff(options) {
  if (options.retry) {
    const ctx = context(), remote = remoteContext();
    if (!/^[a-f0-9]{40}$/.test(options.retry)) throw new Error('Retry requires the exact saved commit SHA.');
    const m = manifestAt(options.retry, ctx.root);
    if (m.owner !== remote.login || m.repository !== remote.repo) throw new Error('Cannot retry another actor/repository handoff.');
    currentIssue(remote, issueNumber(m.issue));
    return publish(ctx, remote, m, options.retry, options);
  }
  const ctx = context();
  options.issue ||= ctx.branch.match(/(?:^|\/)issue-(\d+)(?:-|\/|$)/)?.[1];
  options.task ||= ctx.branch;
  options.progress ||= 'Unfinished source snapshot; progress not declared.';
  options.completed ||= 'No completed steps declared.';
  options.pending ||= 'Inspect the Issue and changed files; continue the authorized task.';
  options.blockers ||= 'Unknown; review required before continuing.';
  checkMetadata(options);
  const localDefault = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFailure: true }) || 'origin/main';
  ctx.base = git(['merge-base', ctx.head, localDefault]);
  const found = inventory(ctx, ctx.base);
  console.log(JSON.stringify({ branch: ctx.branch, head: ctx.head, worktree: ctx.root, send: found.accepted.map(f => f.path), unsent: found.excluded, ignoredUnsent: found.ignored }, null, 2));
  if (options['dry-run']) return;
  const number = issueNumber(options.issue), remote = remoteContext();
  currentIssue(remote, number);
  const deps = dependencies(remote, options);
  // Fetch without touching the working tree or index.
  git(['fetch', 'origin']);
  const existingClaim = readClaim(remote, number);
  let branch, parent = ctx.base, previous;
  if (existingClaim) {
    git(['fetch', 'origin', `refs/${claimRef(number)}`]);
    previous = manifestAt(existingClaim, ctx.root);
    if (previous.owner !== remote.login || previous.issue !== number) throw new Error('Task ownership belongs to another handoff. Resume its exact published commit or coordinate transfer on the Issue.');
    branch = previous.branch;
    git(['fetch', 'origin', branch]);
    parent = git(['rev-parse', 'FETCH_HEAD']);
    // Updating from an unrelated/older checkout would erase another machine's progress.
    if (ctx.head !== parent && ctx.head !== previous.previousHandoff && git(['merge-base', '--is-ancestor', parent, ctx.head], { allowFailure: true }) === null) throw new Error('This checkout does not contain the published handoff. Resume it before publishing an update.');
  } else branch = `wip/${remote.login.toLowerCase()}/issue-${number}/${randomUUID()}`;
  const base = ctx.base;
  const snapshot = payloadCommit(ctx, found.accepted, parent, `WIP / NOT VERIFIED: #${number} ${options.task}`);
  const manifest = {
    schema: 1, status: 'WIP / NOT VERIFIED', repository: remote.repo,
    issue: number, owner: remote.login, branch, sourceBranch: ctx.branch,
    sourceCommit: ctx.head, baseCommit: base, payloadCommit: snapshot.commit,
    payloadTree: snapshot.tree, createdAt: new Date().toISOString(),
    task: options.task, progress: options.progress, completed: options.completed,
    pending: options.pending, blockers: options.blockers, dependencies: deps,
    changedFiles: found.accepted.map(f => f.path),
    unsentCount: found.excluded.length, ignoredUnsentCount: found.ignored.length,
    verification: 'NOT VERIFIED; no lifecycle or task acceptance implied',
  };
  const blob = git(['hash-object', '-w', '--stdin'], { input: JSON.stringify(manifest, null, 2) + '\n' });
  git(['update-index', '--add', '--cacheinfo', `100644,${blob},.team-handoff/manifest.json`], { env: snapshot.env });
  const tree = git(['write-tree'], { env: snapshot.env });
  const commit = git(['commit-tree', tree, '-p', snapshot.commit, '-m', `WIP handoff manifest for #${number}`]);
  // A unique local ref and journal protect recovery even if network publication fails.
  const recovery = `refs/team-handoffs/${randomUUID()}`;
  git(['update-ref', recovery, commit]);
  const stateDir = join(ctx.common, 'team-handoffs'); mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, `${commit}.json`), JSON.stringify({ ...manifest, publishedCommit: commit, recoveryRef: recovery, unsent: found.excluded, ignoredUnsent: found.ignored }, null, 2));
  console.log(`Saved ${commit} at ${recovery}. Working tree and original index preserved.`);
  console.log(`If publication fails: pnpm team:handoff --retry ${commit}`);
  return publish(ctx, remote, manifest, commit, options);
}
function publish(ctx, remote, manifest, commit, options) {
  const { issue: number, branch, payloadCommit } = manifest;
  const reservation = readClaim(remote, number);
  if (reservation) {
    git(['fetch', 'origin', `refs/${claimRef(number)}`]);
    const holder = manifestAt(reservation, ctx.root);
    if (holder.owner !== remote.login || holder.branch !== branch) throw new Error('Another handoff owns this task. Saved work remains local; no ownership was overwritten.');
  }
  git(['push', 'origin', `${commit}:refs/heads/${branch}`]);
  if (!reservation) {
    // Atomic GitHub ref creation: exactly one publisher can claim an Issue.
    // A 422 collision never updates/steals the existing owner's reference.
    post(remote.repo, 'git/refs', { ref: `refs/${claimRef(number)}`, sha: commit });
  }
  const assigned = post(remote.repo, `issues/${number}/assignees`, { assignees: [remote.login] });
  if (assigned.assignees?.length !== 1 || assigned.assignees[0].login !== remote.login) throw new Error('Concurrent Issue assignment detected. Snapshot is saved, but task ownership needs reconciliation on the Issue.');
  const body = `WIP / NOT VERIFIED\n\nRelated Issue: #${number}\n\nPublished commit: \`${commit}\`\nPayload commit: \`${payloadCommit}\`\nManifest: .team-handoff/manifest.json\n\n${manifest.progress}\n\nPending: ${manifest.pending}\nBlockers: ${manifest.blockers}\nDependencies: ${manifest.dependencies.map(n => `#${n}`).join(', ') || 'none declared'}\n\nUnsent files: ${manifest.unsentCount}; ignored entries: ${manifest.ignoredUnsentCount}. Original files and the local recovery journal remain on the publishing machine. No acceptance or merge is requested.`;
  const prs = JSON.parse(gh(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,isDraft,url']));
  let pr;
  if (prs.length) {
    if (!prs[0].isDraft) throw new Error('Existing handoff PR is no longer Draft; do not overwrite its review state.');
    gh(['pr', 'edit', String(prs[0].number), '--body-file', '-'], { input: body }); pr = prs[0];
  } else {
    const url = gh(['pr', 'create', '--draft', '--base', remote.defaultBranch, '--head', branch, '--title', `WIP / NOT VERIFIED: #${number} ${manifest.task}`, '--body-file', '-'], { input: body });
    pr = { url };
  }
  post(remote.repo, `issues/${number}/comments`, { body: `WIP handoff by @${remote.login}: ${pr.url}\nPublished commit: \`${commit}\`. NOT VERIFIED. Dependencies: ${manifest.dependencies.map(n => `#${n}`).join(', ') || 'none declared'}. Ownership reservation: \`refs/${claimRef(number)}\`.` });
  if (options.to) {
    if (!/^[\w-]+$/.test(options.to) || options.to === remote.login) throw new Error('Supply another GitHub login with --to.');
    // Transfer is explicit and attributable, never inferred from an unassigned task.
    post(remote.repo, `issues/${number}/comments`, { body: `HANDOFF_TRANSFER ${commit} TO @${options.to}` });
    gh(['api', `repos/${remote.repo}/issues/${number}/assignees`, '--method', 'DELETE', '--input', '-'], { input: JSON.stringify({ assignees: [remote.login] }) });
    post(remote.repo, `issues/${number}/assignees`, { assignees: [options.to] });
  }
  console.log(JSON.stringify({ publishedCommit: commit, draftPR: pr.url, ownership: remote.login, issue: number }, null, 2));
}

function start(options) {
  const ctx = context();
  const dirty = Boolean(git(['status', '--porcelain']));
  console.log(JSON.stringify({ branch: ctx.branch, head: ctx.head, worktree: ctx.root, dirty }, null, 2));
  const remote = remoteContext();
  git(['fetch', 'origin']);
  if (options.ff) {
    if (dirty) throw new Error('Fast-forward refused: this worktree has unpublished changes.');
    const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { allowFailure: true });
    if (upstream !== `origin/${ctx.branch}`) throw new Error('Fast-forward requires a matching origin branch upstream.');
    git(['merge', '--ff-only', upstream]);
  }
  const issues = JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,assignees,labels,url,body']));
  const prs = JSON.parse(gh(['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,headRefName,headRefOid,isDraft,url,author,body']));
  if (issues.length === 200 || prs.length === 200) console.log('Listing reached 200 entries; inspect remaining Issues/PRs on GitHub before claiming work.');
  console.log(JSON.stringify({ issues: issues.map(i => ({ number: i.number, title: i.title, assigned: i.assignees.map(a => a.login), state: i.labels.some(l => /blocked/.test(l.name)) ? 'BLOCKED' : i.assignees.length ? 'ASSIGNED' : 'AVAILABLE', url: i.url })), handoffs: prs.filter(p => p.headRefName.startsWith('wip/')).map(p => ({ number: p.number, title: p.title, commit: p.headRefOid, url: p.url, state: 'RESUMABLE; inspect Issue dependencies' })), otherOpenPRs: prs.filter(p => !p.headRefName.startsWith('wip/')).map(p => ({ number: p.number, url: p.url })) }, null, 2));
  // Projects are optional presentation of the same Issues, never a second ledger.
  const projects = gh(['project', 'list', '--owner', remote.repo.split('/')[0], '--format', 'json'], { allowFailure: true });
  console.log(projects ? `GitHub Projects: ${projects}` : 'GitHub Projects unavailable (check read:project scope). Issue/PR data above remains authoritative; no Project update claimed.');
  if (!options.pr) return;
  const pr = prs.find(p => p.number === Number(options.pr));
  if (!pr?.isDraft || !pr.headRefName.startsWith('wip/')) throw new Error('Select an open Draft WIP handoff PR.');
  git(['fetch', 'origin', pr.headRefName]);
  const published = git(['rev-parse', 'FETCH_HEAD']);
  if (published !== pr.headRefOid) throw new Error('Handoff changed while reading; retry for a coherent published commit.');
  const m = manifestAt(published, ctx.root);
  if (m.repository !== remote.repo || m.branch !== pr.headRefName || pr.author.login !== m.owner) throw new Error('Handoff repository/branch/author binding mismatch.');
  console.log(JSON.stringify({ publishedCommit: published, manifest: m }, null, 2));
  for (const n of m.dependencies) {
    if (api(remote.repo, `issues/${issueNumber(n)}`).state !== 'closed') throw new Error(`Dependency #${n} remains open; resume is blocked pending its recorded disposition.`);
  }
  const issue = api(remote.repo, `issues/${issueNumber(m.issue)}`);
  const currentDependencies = api(remote.repo, `issues/${m.issue}/dependencies/blocked_by?per_page=100`);
  if (currentDependencies.some(i => i.state !== 'closed') || currentDependencies.length === 100) throw new Error('A current Issue dependency is open or incomplete; no resume performed.');
  if (issue.state !== 'open') throw new Error('Task Issue is no longer open.');
  if (!options.resume) return;
  if (issue.assignees.length !== 1 || issue.assignees[0].login !== remote.login) throw new Error('Resume needs exclusive Issue assignment to the authenticated actor. No task was stolen.');
  const claim = readClaim(remote, m.issue);
  if (!claim) throw new Error('Missing task ownership reservation. Coordinate recovery on the Issue.');
  git(['fetch', 'origin', `refs/${claimRef(m.issue)}`]);
  const owner = manifestAt(claim, ctx.root);
  if (owner.branch !== m.branch || owner.owner !== m.owner) throw new Error('Ownership reservation does not match this handoff.');
  if (m.owner !== remote.login) {
    const comments = JSON.parse(gh(['api', `repos/${remote.repo}/issues/${m.issue}/comments?per_page=100`]));
    if (!comments.some(c => c.user.login === m.owner && c.body.trim() === `HANDOFF_TRANSFER ${published} TO @${remote.login}`)) throw new Error('Missing exact current-owner transfer authorization on the Issue.');
    // Claim transfer is append-only. Its parent is the old reservation; concurrent
    // transfers create siblings, so force:false permits at most one winner.
    const next = { ...m, owner: remote.login, branch: `wip/${remote.login.toLowerCase()}/issue-${m.issue}/${randomUUID()}`, previousHandoff: published };
    const index = join(ctx.common, `team-index-${randomUUID()}`), env = { GIT_INDEX_FILE: index };
    git(['read-tree', published], { env });
    const blob = git(['hash-object', '-w', '--stdin'], { input: JSON.stringify(next, null, 2) + '\n' });
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},.team-handoff/manifest.json`], { env });
    const tree = git(['write-tree'], { env });
    const transfer = git(['commit-tree', tree, '-p', claim, '-p', published, '-m', `WIP ownership transfer #${m.issue} to ${remote.login}`]);
    git(['push', 'origin', `${transfer}:refs/heads/${next.branch}`]);
    gh(['api', `repos/${remote.repo}/git/refs/${claimRef(m.issue)}`, '--method', 'PATCH', '--input', '-'], { input: JSON.stringify({ sha: transfer, force: false }) });
    console.log(`Ownership transferred to @${remote.login}; original payload remains ${published}.`);
  }
  // A new worktree leaves every existing dirty worktree and active pointer intact.
  const suffix = published.slice(0, 12);
  const target = join(ctx.top, '.worktrees', `team-issue-${m.issue}-${remote.login}-${suffix}`);
  const branch = `resume/${remote.login}/issue-${m.issue}/${suffix}`;
  if (existsSync(target) || git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true }) !== null) throw new Error('Resume target already exists. Open it; no existing worktree will be overwritten.');
  git(['worktree', 'add', '-b', branch, target, published]);
  console.log(`Resumed exact commit ${published} in ${target}. Read .team-handoff/manifest.json; no SpecKit lifecycle or acceptance advanced.`);
}

export function main(args = process.argv.slice(2), commandRunner = runProcess) {
  run = commandRunner;
  const [command, ...rest] = args;
  if (!['handoff', 'start'].includes(command) || rest.includes('--help')) {
    console.log('pnpm team:handoff --issue N --task "..." --progress "..." --completed "..." --pending "..." --blockers "none" [--depends-on N,N] [--to github-login] [--dry-run]\npnpm team:handoff --retry SAVED_COMMIT\npnpm team:start [--ff] [--pr N [--resume]]\nNo resets, force pushes, issue closures, merges or acceptance. Inspect exclusions before publishing.');
    return;
  }
  const options = parseArgs(rest);
  return command === 'handoff' ? handoff(options) : start(options);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
