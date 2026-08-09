import assert from 'node:assert/strict';
import test from 'node:test';
import { profileStateMessage, profileStates, resolveProfileConflict } from '../src/view-models.ts';

test('profile covers empty/loading/offline/conflict/error/saved states', () => {
  for (const state of ['empty', 'loading', 'offline', 'conflict', 'error', 'success'] as const)
    assert.ok(profileStates.includes(state));
  for (const state of profileStates) assert.notEqual(profileStateMessage(state), undefined);
});

test('stale profile versions require refresh', () => {
  assert.equal(resolveProfileConflict(3, 2), 'refresh');
  assert.equal(resolveProfileConflict(3, 3), 'save');
});
