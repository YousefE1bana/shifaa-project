import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = join(root, '.shifaa', 'skills.json');
const errors = [];
const approvedOwnedSkills = [
  'shifaa-project-guardrails',
  'shifaa-speckit-overlay',
  'shifaa-third-party-skill-overlay',
  'shifaa-ui-governor',
];

function git(arguments_) {
  const result = spawnSync('git', arguments_, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${arguments_.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      errors.push(`${relative(root, path)}: symlinks are prohibited in repository-owned skills`);
      return [];
    }
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  return new Map(
    match[1].split(/\r?\n/).flatMap((line) => {
      const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      return field ? [[field[1], field[2].trim().replace(/^(["'])(.*)\1$/, '$2')]] : [];
    }),
  );
}

if (!existsSync(manifestPath)) errors.push('.shifaa/skills.json is missing');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { skills: [] };
if (manifest.schemaVersion !== 1) errors.push('unsupported SHIFAA skills manifest schema');
if (manifest.sourceRoot !== '.shifaa/skills' || manifest.runtimeRoot !== '.agents/skills') {
  errors.push('SHIFAA skills manifest roots are invalid');
}

const sourceRoot = join(root, '.shifaa', 'skills');
const actualNames = existsSync(sourceRoot)
  ? readdirSync(sourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];
const expectedNames = [...new Set(manifest.skills ?? [])].sort();
if (JSON.stringify(expectedNames) !== JSON.stringify(approvedOwnedSkills)) {
  errors.push('manifest must contain the exact approved repository-owned SHIFAA skill set');
}
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  errors.push('every repository-owned SHIFAA skill must be listed exactly once');
}

for (const name of actualNames) {
  const directory = join(sourceRoot, name);
  const skillFile = join(directory, 'SKILL.md');
  if (!existsSync(skillFile)) {
    errors.push(`${name}: missing SKILL.md`);
    continue;
  }
  const fields = frontmatter(readFileSync(skillFile, 'utf8'));
  if (fields?.get('name') !== name || !fields?.get('description')) {
    errors.push(`${name}: invalid frontmatter or folder/name mismatch`);
  }
  filesUnder(directory);
}

const trackedRuntime = git([
  'ls-files',
  '--',
  '.agents/skills',
  '.kimi-code/skills',
  'skills-lock.json',
])
  .split(/\r?\n/)
  .filter(Boolean);
if (trackedRuntime.length) {
  errors.push(`local/third-party runtime state is tracked: ${trackedRuntime.join(', ')}`);
}

for (const probe of ['.agents/skills/probe', '.kimi-code/skills/probe', 'skills-lock.json']) {
  const result = spawnSync('git', ['check-ignore', '--quiet', probe], { cwd: root });
  if (result.status !== 0) errors.push(`${probe}: local runtime path is not ignored`);
}

for (const required of [
  'tools/sync-shifaa-owned-skills.ps1',
  'tools/update-shifaa-skills.ps1',
  'UPDATE-SHIFAA-SKILLS.bat',
]) {
  if (!existsSync(join(root, required)))
    errors.push(`${required}: required local setup tool is missing`);
}

const updater = readFileSync(join(root, 'tools', 'update-shifaa-skills.ps1'), 'utf8');
if (!updater.includes("@('skills', 'update', '--project', '--yes')")) {
  errors.push('local updater must use explicit project scope');
}
for (const prohibited of ['--global', 'gh pr', 'worktree add', 'git push']) {
  if (updater.includes(prohibited)) {
    errors.push(`local updater contains prohibited Git/global workflow: ${prohibited}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(
  `Validated ${actualNames.length} repository-owned SHIFAA skills; third-party and runtime skill paths are untracked and ignored.`,
);
