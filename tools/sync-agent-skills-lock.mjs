import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sharedRoot = join(root, '.agents', 'skills');
const cliLockPath = join(root, 'skills-lock.json');
const governanceLockPath = join(root, 'docs', 'agent-skills', 'skills-lock.json');
const initializeManaged = process.argv.includes('--initialize-managed');
const reviewedAt = new Date().toISOString().slice(0, 10);
const executableExtensions = new Set([
  '.bat',
  '.cjs',
  '.cmd',
  '.exe',
  '.js',
  '.mjs',
  '.ps1',
  '.py',
  '.sh',
  '.ts',
]);

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    })
    .sort();
}

function normalizedTree(directory) {
  const files = filesUnder(directory);
  const lines = files.map((file) => {
    const path = relative(directory, file).split(sep).join('/');
    const content = readFileSync(file).toString('utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    return `${path}\t${hash}`;
  });
  return {
    digest: createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex'),
    executables: files
      .map((file) => relative(directory, file).split(sep).join('/'))
      .filter((path) => executableExtensions.has(extname(path).toLowerCase())),
  };
}

if (!existsSync(cliLockPath) || !existsSync(governanceLockPath)) {
  throw new Error('Both skills-lock.json manifests must exist.');
}

const cliLock = JSON.parse(readFileSync(cliLockPath, 'utf8'));
const lock = JSON.parse(readFileSync(governanceLockPath, 'utf8'));
let materialChange = false;
const sources = [
  ...new Set(Object.values(cliLock.skills ?? {}).map((skill) => skill.source)),
].sort();
const sourceCommits = Object.fromEntries(
  sources.map((source) => {
    const output = execFileSync('git', ['ls-remote', `https://github.com/${source}.git`, 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const commit = output.split(/\s+/)[0];
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`${source}: cannot resolve upstream HEAD`);
    return [source, commit];
  }),
);
const curatedNames = new Set(lock.vendoredSkills.map((skill) => skill.name));
const previousManaged = new Map((lock.managedSkills ?? []).map((skill) => [skill.name, skill]));

for (const skill of lock.vendoredSkills) {
  const directory = join(root, ...skill.installedPath.split('/'));
  if (!existsSync(directory)) throw new Error(`${skill.name}: installed path is missing`);
  const digest = normalizedTree(directory).digest;
  if (skill.treeDigestSha256 !== digest) materialChange = true;
  skill.treeDigestSha256 = digest;
  if (cliLock.skills?.[skill.name]) {
    if (sourceCommits[skill.upstreamRepository]) {
      if (skill.upstreamCommit !== sourceCommits[skill.upstreamRepository]) materialChange = true;
      skill.upstreamCommit = sourceCommits[skill.upstreamRepository];
    }
    if (materialChange) skill.dateReviewed = reviewedAt;
  }
}

const managedSkills = Object.entries(cliLock.skills ?? {})
  .filter(([name]) => !curatedNames.has(name))
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, metadata]) => {
    const installedPath = `.agents/skills/${name}`;
    const directory = join(sharedRoot, name);
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      throw new Error(`${name}: CLI lock entry has no installed skill tree`);
    }
    const tree = normalizedTree(directory);
    const previous = previousManaged.get(name);
    if (!previous && !initializeManaged) {
      throw new Error(`${name}: new managed skill requires explicit initialization review`);
    }
    const approvedExecutables = previous?.retainedExecutableFiles ?? tree.executables;
    if (
      !initializeManaged &&
      JSON.stringify(approvedExecutables) !== JSON.stringify(tree.executables)
    ) {
      throw new Error(`${name}: executable inventory changed; inspect it before updating the lock`);
    }
    const candidate = {
      name,
      source: metadata.source,
      sourceType: metadata.sourceType,
      upstreamSkillPath: metadata.skillPath.replace(/\/SKILL\.md$/, ''),
      installedPath,
      computedHash: metadata.computedHash,
      classification: 'product-owner-approved-shared-tooling',
      executablePolicy: tree.executables.length
        ? 'retained-for-integrity-but-not-an-approved-execution-exception'
        : 'text-and-assets-only',
      retainedExecutableFiles: approvedExecutables,
      treeDigestSha256: tree.digest,
      dateReviewed: previous?.dateReviewed ?? reviewedAt,
    };
    const comparablePrevious = previous
      ? { ...previous, dateReviewed: candidate.dateReviewed }
      : null;
    if (!comparablePrevious || JSON.stringify(comparablePrevious) !== JSON.stringify(candidate)) {
      materialChange = true;
      candidate.dateReviewed = reviewedAt;
    }
    return candidate;
  });

if (JSON.stringify(lock.managedSourceCommits ?? {}) !== JSON.stringify(sourceCommits))
  materialChange = true;
if (lock.toolingReviewed.npxSkills.version !== '1.5.23') materialChange = true;
lock.reviewedAt = materialChange ? reviewedAt : lock.reviewedAt;
lock.managedSourceCommits = sourceCommits;
lock.managedSkills = managedSkills;
lock.evaluatedNotInstalled = (lock.evaluatedNotInstalled ?? []).filter(
  (skill) => !managedSkills.some((managed) => managed.name === skill.name),
);
lock.policy.genericThirdPartyScope = 'global-user-default-with-explicit-product-owner-shared-pack';
if (!lock.policy.projectTrackedScope.includes('explicit Product Owner-approved shared tooling')) {
  lock.policy.projectTrackedScope.push('explicit Product Owner-approved shared tooling');
}
lock.toolingReviewed.npxSkills.version = '1.5.23';
lock.toolingReviewed.npxSkills.use =
  'project updates use --project --yes in an isolated worktree; SHIFAA overlays and executable inventories reconcile fail-closed';

writeFileSync(governanceLockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
console.log(
  `Synchronized ${lock.vendoredSkills.length} curated and ${managedSkills.length} CLI-managed skill locks.`,
);
