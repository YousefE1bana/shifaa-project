import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sharedRoot = join(root, '.agents', 'skills');
const kimiRoot = join(root, '.kimi-code', 'skills');
const lockPath = join(root, 'docs', 'agent-skills', 'skills-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const errors = [];
const names = new Map();

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
  if (!existsSync(join(root, ...required.split('/'))))
    errors.push(`${required}: required SpecKit skill missing`);
}

for (const skill of lock.vendoredSkills) {
  const directory = join(root, ...skill.installedPath.split('/'));
  if (!existsSync(directory)) {
    errors.push(`${skill.name}: locked path missing`);
    continue;
  }
  const lines = filesUnder(directory).map((file) => {
    const path = relative(directory, file).split(sep).join('/');
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
  `Validated ${names.size} unique shared skills, ${lock.vendoredSkills.length} locked external trees, and both SpecKit implementations.`,
);
