import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Preserved checkouts share fixture identities with this checkout.
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
  },
});
