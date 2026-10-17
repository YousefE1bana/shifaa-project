import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { verificationPlan } from './verification-plan.mjs';

const rules = {
  sharedTarget: /(?:127\.0\.0\.1|localhost|5432|54322|55432|shifaa-local|supabase_db_)/i,
  destructiveLifecycle:
    /(?:compose\s+down|\bprune\b|db\s+reset|DROP\s+(?:DATABASE|SCHEMA|TABLE)|TRUNCATE)/i,
  mutation: /(?:\bDELETE\s+FROM|\bUPDATE\s+[a-z_]|\bINSERT\s+INTO|migrat|seed|DISABLE\s+TRIGGER)/i,
  process: /(?:execFile|spawn|execSync|Invoke-Command|docker|supabase)/i,
  writes: /(?:writeFile|mkdir|rmSync|unlink|Set-Content|Out-File|Remove-Item|pg_dump|pg_restore)/i,
};

// Conservative closure: all first-party executable/configuration/SQL sources,
// including test globs and dynamic imports. This deliberately over-approximates
// reachability; it never treats an unresolved dynamic edge as proof of safety.
export function auditGraph(root, files, read) {
  const plan = verificationPlan(root);
  const manifests = files.filter(
    (f) => f === 'package.json' || /^(apps|packages|services)\/[^/]+\/package.json$/.test(f),
  );
  const packages = manifests.map((file) => ({ file, ...JSON.parse(read(file)) }));
  const sources = files.filter(
    (f) =>
      (/^(tools|tests|apps|packages|services|infra|supabase|\.github|\.specify|\.shifaa)\//.test(
        f,
      ) ||
        /^[^/]+\.(?:mjs|cjs|js|ts|py|ps1|sh|bat|json|ya?ml)$/.test(f) ||
        (/^specs\//.test(f) && /\.(?:sql|ps1|mjs|py)$/.test(f))) &&
      (/\.(?:mjs|cjs|js|ts|tsx|mts|cts|py|ps1|sh|bat|sql|ya?ml|toml|json)$/.test(f) ||
        /(?:^|\/)Dockerfile$/.test(f)) &&
      !f.includes('/node_modules/'),
  );
  const nodes = sources.map((file) => {
    const raw = read(file),
      text = raw.toString('utf8');
    const risks = [];
    text.split(/\r?\n/).forEach((line, i) => {
      for (const [risk, pattern] of Object.entries(rules))
        if (pattern.test(line)) risks.push({ line: i + 1, risk });
    });
    const edges = [
      ...text.matchAll(
        /(?:from\s*|import\s*\(\s*|require\s*\(\s*|\b(?:node|tsx|powershell(?:\.exe)?)[ \t]+(?:-File[ \t]+)?)['"]?(\.?\.?\/[\w./-]+|(?:tools|tests|infra|supabase|specs|packages|services|apps)\/[\w./-]+)/g,
      ),
    ].map((m) => m[1]);
    return {
      path: file,
      bytes: raw.length,
      sha256: createHash('sha256').update(raw).digest('hex'),
      edges: [...new Set(edges)],
      risks,
    };
  });
  return {
    baseline: plan.baseline,
    method: 'CONSERVATIVE_ALL_FIRST_PARTY_EXECUTABLES_NOT_A_PROOF_OF_STATIC_REACHABILITY',
    oldGraph: plan.requiredSteps,
    newGraph: [
      'read-only admission',
      'exclusive authorization/lock',
      'fresh immutable Windows VM',
      'audit-only network phase',
      'remove every VM NIC',
      'guarded discovery-sos/family/privacy',
      'all remaining legacy steps',
      'exact VM/disk teardown',
      'one final status',
    ],
    packages: packages.map((p) => ({
      path: p.file,
      name: p.name,
      scripts: p.scripts ?? {},
      dependencies: p.dependencies ?? {},
      devDependencies: p.devDependencies ?? {},
    })),
    turbo: JSON.parse(read('turbo.json')),
    nodes,
    unresolved:
      'Dynamic imports, process arguments, package test globs and generated SQL are conservatively contained by the whole-machine boundary. Only reviewed read-only Git, authority and F011 validators run on the host; legacy test/resource subprocesses run exclusively in the fresh guest.',
  };
}
export function currentGraph(root) {
  const tracked = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root },
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  return auditGraph(root, tracked, (f) => fs.readFileSync(path.join(root, f)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(JSON.stringify(currentGraph(path.resolve(import.meta.dirname, '..')), null, 2));
