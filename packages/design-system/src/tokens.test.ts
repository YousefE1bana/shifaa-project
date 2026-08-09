import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { contrastRatio } from './contrast.ts';
import { color, minimumTargetSize, motion } from './tokens.ts';

test('canonical text/action tokens meet WCAG AA contrast', () => {
  assert.ok(contrastRatio(color.ink, color.canvas) >= 4.5);
  assert.ok(contrastRatio(color.inverse, color.careBlue) >= 4.5);
  assert.ok(contrastRatio(color.inverse, color.danger) >= 4.5);
  assert.ok(contrastRatio(color.mutedInk, color.surface) >= 4.5);
});

test('controls and safety motion satisfy the accessibility contract', () => {
  assert.ok(minimumTargetSize >= 44);
  assert.equal(motion.safetyCriticalMs, 0);
  assert.equal(motion.reducedMotionMs, 0);
});

test('care-passport rail is semantic and not a numbered decorative wizard', async () => {
  const source = await readFile(new URL('./CarePassportRail.tsx', import.meta.url), 'utf8');
  assert.match(source, /accessibilityRole="list"/);
  assert.match(source, /statusLabel/);
  assert.doesNotMatch(source, /index\s*\+\s*1/);
});
