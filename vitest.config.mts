import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Turbo runs several package suites together; each must not claim every CPU.
    maxWorkers: 2,
    // Preserved checkouts share fixture identities with this checkout.
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
  },
});
