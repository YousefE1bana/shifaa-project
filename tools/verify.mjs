import { resolve } from 'node:path';
import { prepare, verify } from './verification/sandbox.mjs';
import { isolatedCategories, ordinary } from './verification/profiles.mjs';

const mode = process.argv[2] ?? 'ordinary';
try {
  if (process.argv.length > 3 || !['ordinary', 'prepare'].includes(mode))
    throw new Error(
      'Use pnpm verify or explicit pnpm verify:prepare; no host/unsafe override exists',
    );
  const root = resolve(import.meta.dirname, '..');
  const result = mode === 'prepare' ? prepare(root) : verify(root);
  console.log(
    JSON.stringify({
      ...result,
      notExecuted:
        result.status === 'BLOCKED' ? [...ordinary, ...isolatedCategories] : isolatedCategories,
    }),
  );
  process.exitCode = result.exitCode;
} catch (error) {
  // Do not dump Docker diagnostics/environment: endpoint errors may contain secrets.
  console.error(
    JSON.stringify({
      status: 'BLOCKED',
      exitCode: 2,
      reason:
        error.code === 'ENOENT'
          ? 'Required local executable unavailable'
          : 'Local Linux Docker, safe source paths and image compatibility must be established; no checks executed on host',
      notExecuted: [...ordinary, ...isolatedCategories],
    }),
  );
  process.exitCode = 2;
}
