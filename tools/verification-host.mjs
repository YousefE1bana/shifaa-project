import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { requiredIds } from './verification-plan.mjs';
import { createVerificationEnvironment } from './verification-test-environment.mjs';

export function verificationRoutes(plan) {
  const ids = requiredIds(plan);
  assert.equal(ids.length, 44);
  assert.equal(new Set(ids).size, 44);
  return ids.map((id) => ({
    id,
    route: ['legacy-20', 'guarded-family', 'guarded-privacy'].includes(id)
      ? 'guarded-e2e'
      : 'original-check',
  }));
}

export function localVerificationHost(
  root,
  { createEnvironment = createVerificationEnvironment, run = spawnSync } = {},
) {
  let environment;
  let commands;
  return {
    async preflight(plan) {
      verificationRoutes(plan);
      commands = new Map(plan.requiredSteps.map((step) => [step.id, step.command]));
      try {
        environment = await createEnvironment(root);
      } catch (error) {
        const prerequisites = {
          NATIVE_LOOPBACK_BINDING_REQUIRED:
            'Native Supabase published non-loopback ports. On Docker Desktop select Resources > Network > Port binding behavior > Localhost by default. Preserve the failed run receipt and verify ownership before cleanup; do not accept wildcard bindings.',
          DOCKER_ENGINE_UNAVAILABLE:
            'Start the intended Linux Docker engine; no shared database fallback is allowed.',
          POSTGIS_IMAGE_MISSING:
            'Build the repository infra/db/Dockerfile.postgis image as shifaa/postgis:17-3.5-006-local before verification.',
        };
        if (Object.hasOwn(prerequisites, error.verificationPrerequisite ?? ''))
          return {
            status: 'BLOCKED',
            code: error.verificationPrerequisite,
            reason: prerequisites[error.verificationPrerequisite],
          };
        throw error;
      }
      return { status: 'PASS' };
    },
    execute(id) {
      assert.ok(environment, 'Test environment must be admitted first');
      let executable;
      let args;
      if (['legacy-20', 'guarded-family', 'guarded-privacy'].includes(id)) {
        executable = process.execPath;
        const scope = id === 'legacy-20' ? 'discovery-sos' : id.slice('guarded-'.length);
        args = ['--import', 'tsx', 'tools/verification-e2e.mjs', scope];
      } else {
        const command = commands.get(id);
        assert.ok(command, 'Unknown verification obligation');
        const [program, ...arguments_] = command.split(' ');
        executable =
          program === 'pnpm'
            ? process.platform === 'win32'
              ? 'corepack.cmd'
              : 'corepack'
            : program;
        args = program === 'pnpm' ? ['pnpm', ...arguments_] : arguments_;
      }
      console.log(`VERIFY ${id}`);
      const result = run(executable, args, {
        cwd: root,
        env: { ...process.env },
        stdio: 'inherit',
        windowsHide: true,
        shell: process.platform === 'win32' && executable === 'corepack.cmd',
      });
      if (result.error) throw result.error;
      return { exitCode: result.status ?? 1, cleanupVerified: true };
    },
    async close() {
      if (environment) await environment.close();
    },
  };
}
