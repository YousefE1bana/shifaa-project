import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sharedRoot = join(root, '.agents', 'skills');
const kimiRoot = join(root, '.kimi-code', 'skills');
const lockPath = join(root, 'docs', 'agent-skills', 'skills-lock.json');
const cliLockPath = join(root, 'skills-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const cliLock = JSON.parse(readFileSync(cliLockPath, 'utf8'));
const errors = [];
const names = new Map();
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

function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const fields = new Map();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (field) fields.set(field[1], field[2].trim().replace(/^(["'])(.*)\1$/, '$2'));
  }
  return fields;
}

for (const entry of readdirSync(sharedRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const skillPath = join(sharedRoot, entry.name, 'SKILL.md');
  if (!existsSync(skillPath)) {
    errors.push(`${entry.name}: missing SKILL.md`);
    continue;
  }
  const fields = frontmatter(readFileSync(skillPath, 'utf8'));
  if (!fields?.get('name') || !fields?.get('description')) {
    errors.push(`${entry.name}: invalid or incomplete frontmatter`);
    continue;
  }
  const name = fields.get('name');
  if (!/^[a-z0-9-]{1,64}$/.test(name)) errors.push(`${entry.name}: invalid name ${name}`);
  if (name !== entry.name) errors.push(`${entry.name}: folder/name mismatch (${name})`);
  if (names.has(name)) errors.push(`${entry.name}: duplicate name also at ${names.get(name)}`);
  names.set(name, skillPath);
  for (const file of filesUnder(join(sharedRoot, entry.name))) {
    if (lstatSync(file).isSymbolicLink())
      errors.push(`${relative(root, file)}: symlink prohibited`);
  }
}

for (const required of [
  '.agents/skills/speckit-implement/SKILL.md',
  '.kimi-code/skills/speckit-implement/SKILL.md',
]) {
  const path = join(root, ...required.split('/'));
  if (!existsSync(path)) {
    errors.push(`${required}: required SpecKit skill missing`);
    continue;
  }
  const fields = frontmatter(readFileSync(path, 'utf8'));
  if (fields?.get('name') !== 'speckit-implement')
    errors.push(`${required}: SpecKit implementation frontmatter changed or invalid`);
}

const lockedNames = new Set();
const lockedPaths = new Set();
const lockedExecutables = new Set();
for (const skill of lock.vendoredSkills) {
  if (lockedNames.has(skill.name)) errors.push(`${skill.name}: duplicate lock name`);
  lockedNames.add(skill.name);
  if (lockedPaths.has(skill.installedPath))
    errors.push(`${skill.installedPath}: duplicate locked path`);
  lockedPaths.add(skill.installedPath);

  const directory = join(root, ...skill.installedPath.split('/'));
  if (!existsSync(directory)) {
    errors.push(`${skill.name}: locked path missing`);
    continue;
  }
  if (!names.has(skill.name)) errors.push(`${skill.name}: locked skill is not discoverable`);
  const reviewedExecutables = new Set(skill.reviewedExecutables ?? []);
  const files = filesUnder(directory);
  const lines = files.map((file) => {
    const path = relative(directory, file).split(sep).join('/');
    if (executableExtensions.has(extname(path).toLowerCase())) {
      const repositoryPath = relative(root, file).split(sep).join('/');
      lockedExecutables.add(repositoryPath);
      if (!reviewedExecutables.has(path))
        errors.push(`${repositoryPath}: executable is not reviewed in its lock entry`);
    }
    // Vendored skill trees are text-only. Normalize CRLF so a lock generated on
    // Windows verifies against the same Git content on Linux CI.
    const content = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    return `${path}\t${hash}`;
  });
  const digest = createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
  if (digest !== skill.treeDigestSha256) {
    errors.push(`${skill.name}: tree digest differs from skills-lock.json (${digest})`);
  }
  for (const path of reviewedExecutables) {
    if (!files.some((file) => relative(directory, file).split(sep).join('/') === path))
      errors.push(`${skill.name}: reviewed executable missing (${path})`);
  }
}

const managedNames = new Set();
for (const skill of lock.managedSkills ?? []) {
  if (managedNames.has(skill.name)) errors.push(`${skill.name}: duplicate managed lock name`);
  managedNames.add(skill.name);
  if (lockedNames.has(skill.name)) errors.push(`${skill.name}: both curated and managed`);

  const metadata = cliLock.skills?.[skill.name];
  if (!metadata) {
    errors.push(`${skill.name}: managed skill is missing from root skills-lock.json`);
    continue;
  }
  if (skill.source !== metadata.source || skill.sourceType !== metadata.sourceType)
    errors.push(`${skill.name}: managed source differs from root skills-lock.json`);
  if (`${skill.upstreamSkillPath}/SKILL.md` !== metadata.skillPath)
    errors.push(`${skill.name}: managed upstream path differs from root skills-lock.json`);
  if (skill.computedHash !== metadata.computedHash)
    errors.push(`${skill.name}: managed update hash differs from root skills-lock.json`);
  if (skill.classification !== 'product-owner-approved-shared-tooling')
    errors.push(`${skill.name}: invalid managed skill classification`);

  const directory = join(root, ...skill.installedPath.split('/'));
  if (!existsSync(directory)) {
    errors.push(`${skill.name}: managed path missing`);
    continue;
  }
  if (!names.has(skill.name)) errors.push(`${skill.name}: managed skill is not discoverable`);
  const files = filesUnder(directory);
  const executableFiles = files
    .map((file) => relative(directory, file).split(sep).join('/'))
    .filter((path) => executableExtensions.has(extname(path).toLowerCase()));
  const retainedExecutables = skill.retainedExecutableFiles ?? [];
  if (JSON.stringify(executableFiles) !== JSON.stringify(retainedExecutables))
    errors.push(`${skill.name}: retained executable inventory differs from governance lock`);
  if (
    executableFiles.length > 0 &&
    skill.executablePolicy !== 'retained-for-integrity-but-not-an-approved-execution-exception'
  )
    errors.push(`${skill.name}: executable content is not fail-closed`);
  if (executableFiles.length === 0 && skill.executablePolicy !== 'text-and-assets-only')
    errors.push(`${skill.name}: executable policy does not match its tree`);

  const lines = files.map((file) => {
    const path = relative(directory, file).split(sep).join('/');
    const content = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    return `${path}\t${hash}`;
  });
  const digest = createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
  if (digest !== skill.treeDigestSha256)
    errors.push(`${skill.name}: managed tree digest differs from governance lock (${digest})`);
}

for (const name of Object.keys(cliLock.skills ?? {})) {
  if (!lockedNames.has(name) && !managedNames.has(name))
    errors.push(`${name}: root skills-lock.json entry is not governed`);
}

const executableExceptions = new Set(lock.policy.reviewedExecutableExceptions ?? []);
if (lock.policy.thirdPartyExecutablesAllowedByDefault !== false)
  errors.push('policy: third-party executables must be prohibited by default');
for (const path of lockedExecutables) {
  if (!executableExceptions.has(path))
    errors.push(`${path}: vendored executable is not a policy exception`);
}
for (const path of executableExceptions) {
  if (!lockedExecutables.has(path))
    errors.push(`${path}: executable policy exception is missing or not locked`);
}

for (const entry of readdirSync(kimiRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('speckit-')) continue;
  if (names.has(entry.name))
    errors.push(`${entry.name}: generic skill duplicated under .kimi-code/skills`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(
  `Validated ${names.size} unique shared skills, ${lock.vendoredSkills.length} curated trees, ${managedNames.size} CLI-managed trees, and both SpecKit implementations.`,
);
