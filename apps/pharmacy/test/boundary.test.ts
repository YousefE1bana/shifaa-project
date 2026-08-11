import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
test('pharmacy has its own entrypoint', () =>
  assert.match(
    fs.readFileSync(new URL('../src/app/facility/onboarding/page.tsx', import.meta.url), 'utf8'),
    /facilityType="pharmacy"/,
  ));
