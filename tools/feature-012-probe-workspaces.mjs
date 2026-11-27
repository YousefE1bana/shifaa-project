import { mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

export function linkProbeWorkspaces(root, workspaces) {
  for (const workspace of workspaces) {
    const installed = join('/opt/deps', workspace, 'node_modules');
    const target = join(root, workspace, 'node_modules');
    mkdirSync(join(target, '@shifaa'), { recursive: true });
    for (const dependency of readdirSync(installed)) {
      if (dependency.startsWith('.')) continue;
      if (dependency === '@shifaa') {
        for (const name of readdirSync(join(installed, dependency))) {
          if (workspaces.includes('packages/' + name)) {
            symlinkSync(join(root, 'packages', name), join(target, dependency, name));
          }
        }
      } else {
        symlinkSync(join(installed, dependency), join(target, dependency));
      }
    }
  }
}
