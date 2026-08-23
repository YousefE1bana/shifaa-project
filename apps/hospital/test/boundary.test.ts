import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
test('hospital has its own entrypoint', () =>
  assert.match(
    fs.readFileSync(new URL('../src/app/facility/onboarding/page.tsx', import.meta.url), 'utf8'),
    /facilityType="hospital"/,
  ));

test('hospital 006 capacity and pre-arrival routes are minimum, bilingual, and offline safe', () => {
  const capacity = fs.readFileSync(
    new URL('../src/app/capacity/page.tsx', import.meta.url),
    'utf8',
  );
  const prearrival = fs.readFileSync(
    new URL('../src/app/sos-prearrivals/page.tsx', import.meta.url),
    'utf8',
  );
  const client = fs.readFileSync(
    new URL('../src/discovery-sos-client.ts', import.meta.url),
    'utf8',
  );
  for (const token of ['getFacilityCapacity', 'freshness', 'lastUpdated', 'count_band'])
    assert.match(capacity, new RegExp(token));
  assert.doesNotMatch(capacity, /available_count|emergency_available_count/);
  for (const token of [
    'listSosPrearrivals',
    'acceptSosPrearrival',
    '<dialog',
    'X-AAL',
    'X-Purpose',
  ])
    assert.match(`${prearrival}\n${client}`, new RegExp(token.replace(/[<>-]/g, '\\$&')));
  assert.match(prearrival, /navigator\.onLine/);
  assert.doesNotMatch(
    `${capacity}\n${prearrival}`,
    /arrival\/triage|createBed|reserveBed|backgroundSync/i,
  );
});
