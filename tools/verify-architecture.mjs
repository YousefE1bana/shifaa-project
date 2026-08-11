import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalRoots = [
  'apps/patient',
  'apps/clinic',
  'apps/pharmacy',
  'apps/hospital',
  'apps/lab',
  'apps/admin',
  'services/api',
  'services/worker',
  'services/ai',
  'packages/auth',
  'packages/contracts',
  'packages/core',
  'packages/api-client',
  'packages/design-system',
  'packages/i18n',
  'packages/observability',
  'packages/test-kit',
  'packages/config',
];

const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const ignoredDirectories = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.expo',
  '.turbo',
]);
const failures = [];

const normalize = (value) => value.split(path.sep).join('/');
const relative = (value) => normalize(path.relative(repoRoot, value));

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || ignoredDirectories.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

for (const expected of canonicalRoots) {
  if (!fs.existsSync(path.join(repoRoot, expected))) {
    failures.push(`Missing canonical workspace boundary: ${expected}`);
  }
}

const manifests = canonicalRoots
  .map((root) => ({ root, file: path.join(repoRoot, root, 'package.json') }))
  .filter(({ file }) => fs.existsSync(file))
  .map(({ root, file }) => {
    try {
      return { root, file, manifest: JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (error) {
      failures.push(`Invalid JSON in ${relative(file)}: ${error.message}`);
      return null;
    }
  })
  .filter(Boolean);

const packageByName = new Map();
for (const item of manifests) {
  const name = item.manifest.name;
  if (!name) {
    failures.push(`Workspace package has no name: ${relative(item.file)}`);
    continue;
  }
  if (packageByName.has(name)) failures.push(`Duplicate workspace package name: ${name}`);
  packageByName.set(name, item);
}

function boundaryFor(file) {
  const rel = relative(file);
  return canonicalRoots.find((root) => rel === root || rel.startsWith(`${root}/`));
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

const dependencyGraph = new Map([...packageByName.keys()].map((name) => [name, new Set()]));
for (const { root, manifest } of manifests) {
  const sourceName = manifest.name;
  const declared = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };
  for (const dependency of Object.keys(declared)) {
    if (packageByName.has(dependency)) dependencyGraph.get(sourceName)?.add(dependency);
  }

  for (const file of walk(path.join(repoRoot, root)).filter((item) =>
    sourceExtensions.has(path.extname(item)),
  )) {
    const contents = fs.readFileSync(file, 'utf8');
    const imports = [
      ...contents.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g),
    ].map((match) => match[1]);

    for (const specifier of imports) {
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), specifier);
        const targetBoundary = boundaryFor(resolved);
        if (targetBoundary && targetBoundary !== root) {
          failures.push(
            `${relative(file)} crosses a workspace boundary with relative import ${specifier}`,
          );
        }
        continue;
      }

      if (specifier.startsWith('@shifaa/')) {
        const dependency = packageNameFromSpecifier(specifier);
        const suffix = specifier.slice(dependency.length);
        const targetManifest = packageByName.get(dependency)?.manifest;
        const publicSubpath = suffix ? `.${suffix}` : '.';
        if (suffix && suffix !== '/' && !targetManifest?.exports?.[publicSubpath]) {
          failures.push(
            `${relative(file)} deep-imports unpublished subpath ${specifier}; declare an explicit package export`,
          );
        }
        if (!declared[dependency]) {
          failures.push(`${relative(file)} imports undeclared workspace dependency ${dependency}`);
        }
        if (packageByName.has(dependency)) dependencyGraph.get(sourceName)?.add(dependency);
      }

      const target = packageByName.get(packageNameFromSpecifier(specifier));
      if (target) {
        const sourceLayer = root.split('/')[0];
        const targetLayer = target.root.split('/')[0];
        if (sourceLayer === 'apps' && targetLayer !== 'packages') {
          failures.push(
            `${relative(file)} violates apps -> packages dependency direction via ${specifier}`,
          );
        }
        if (sourceLayer === 'services' && targetLayer !== 'packages') {
          failures.push(
            `${relative(file)} violates services -> packages dependency direction via ${specifier}`,
          );
        }
        if (sourceLayer === 'packages' && targetLayer !== 'packages') {
          failures.push(`${relative(file)} violates package isolation via ${specifier}`);
        }
      }

      if (root === 'packages/core') {
        const external = packageNameFromSpecifier(specifier);
        const forbidden = [
          'fastify',
          'react',
          'react-native',
          'expo',
          'next',
          'pg',
          'postgres',
          '@supabase/supabase-js',
        ];
        if (forbidden.includes(external)) {
          failures.push(
            `${relative(file)} imports framework/vendor dependency ${specifier}; core must remain pure`,
          );
        }
      }
      if (root.startsWith('apps/')) {
        const external = packageNameFromSpecifier(specifier);
        if (['postgres', 'pg', '@supabase/supabase-js'].includes(external)) {
          failures.push(
            `${relative(file)} imports direct data client ${specifier}; apps must use the Core API client`,
          );
        }
      }
    }

    if (
      root.startsWith('apps/') &&
      /\/rest\/v1|\/storage\/v1\/(?:bucket|object\/list)/.test(contents)
    ) {
      failures.push(
        `${relative(file)} contains a direct Supabase data-plane path; apps must use /v1 Core API routes`,
      );
    }
  }
}

const visiting = new Set();
const visited = new Set();
function visit(node, trail = []) {
  if (visiting.has(node)) {
    const start = trail.indexOf(node);
    failures.push(`Workspace dependency cycle: ${[...trail.slice(start), node].join(' -> ')}`);
    return;
  }
  if (visited.has(node)) return;
  visiting.add(node);
  for (const dependency of dependencyGraph.get(node) ?? []) visit(dependency, [...trail, node]);
  visiting.delete(node);
  visited.add(node);
}
for (const node of dependencyGraph.keys()) visit(node);

if (failures.length > 0) {
  console.error('Architecture verification failed:');
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Architecture verification passed for ${canonicalRoots.length} canonical boundaries and ${manifests.length} package manifests.`,
);
