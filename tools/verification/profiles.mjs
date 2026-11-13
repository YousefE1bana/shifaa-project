// Local checks have no service authority. The complete legacy obligations remain
// separately enumerable; neither profile can silently claim the other's result.
export const ordinary = [
  'format:check',
  'lint',
  'typecheck',
  'build',
  'test',
  'test:a11y',
  'contracts:check',
  'architecture:check',
  'secrets:check',
];

export const isolatedCategories = [
  'PostgreSQL migrations, integration and forced-RLS',
  'Native Supabase Auth/Storage and authorization',
  'Database restore, destructive fixtures, concurrency and recovery',
  'Browser E2E, performance and evidence-producing compositions',
  'Network dependency audit and agent-skill runtime self-tests',
];

export const baseImage =
  'node:24.22.1-bookworm@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea';
