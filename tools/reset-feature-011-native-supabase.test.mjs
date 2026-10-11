import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  runFeature011NativeSupabaseTests,
  runProjectPnpm,
} from './reset-feature-011-native-supabase.mjs';

test('native Supabase test flow applies the admin reset before API tests', async () => {
  const calls = [];
  await runFeature011NativeSupabaseTests({
    reset: async (runPnpm) => {
      calls.push('reset');
      assert.equal(typeof runPnpm, 'function');
    },
    runPnpm: (args) => calls.push(args),
  });
  assert.deepEqual(calls, ['reset', ['--filter', '@shifaa/api', 'test:supabase']]);
});

test('API Supabase tests do not run if the native reset fails', async () => {
  const calls = [];
  await assert.rejects(
    runFeature011NativeSupabaseTests({
      reset: async () => {
        calls.push('reset');
        throw new Error('reset failed');
      },
      runPnpm: (args) => calls.push(args),
    }),
    /reset failed/,
  );
  assert.deepEqual(calls, ['reset']);
});

test('project pnpm runner returns captured stdout for reset ownership checks', () => {
  assert.match(runProjectPnpm(['--version'], true).trim(), /^\d+\.\d+\.\d+$/);
});
