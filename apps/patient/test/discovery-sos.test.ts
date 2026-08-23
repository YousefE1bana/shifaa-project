import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const api = read('src/discovery-sos-api.ts');
const discovery = read('src/DiscoveryScreen.tsx');
const activation = read('src/SosActivationScreen.tsx');
const detail = read('app/sos/[id].tsx');
const shareOwner = read('app/sos/[id]/share.tsx');
const shareViewer = read('app/sos/share.tsx');

test('discovery uses the generated client and always provides a list fallback', () => {
  assert.match(api, /DiscoverySosClient/);
  assert.match(discovery, /searchFacilities/);
  assert.match(discovery, /location-denied/);
  assert.match(discovery, /mapUnavailable/);
  assert.match(discovery, /StalenessIndicator/);
  assert.match(discovery, /count_band/);
  assert.doesNotMatch(discovery, /available_count|emergency_available_count/);
  assert.doesNotMatch(discovery, /google|mapbox|leaflet|AsyncStorage|localStorage/i);
});

test('SOS is explicit, motionless, direct-call safe, and never queued offline', () => {
  for (const token of [
    'explicit_activation',
    'qualifying_reason_code',
    'contact_preference',
    'callback_source',
    'Call123Action',
    'offline-no-queue',
  ]) {
    assert.match(`${activation}\n${api}`, new RegExp(token.replace(/[.-]/g, '\\$&')));
  }
  assert.match(detail, /contact_delivery/);
  assert.match(detail, /closeSosIncident/);
  assert.doesNotMatch(
    `${activation}\n${detail}`,
    /animation|transition|backgroundSync|queueMutation/i,
  );
});

test('share bearer is fragment-scrubbed before use and is never persisted', () => {
  assert.match(api, /location\.hash/);
  assert.match(api, /history\.replaceState/);
  assert.match(shareViewer, /consumeEmergencyShareFragment/);
  assert.match(shareOwner, /allowed_fields/);
  assert.match(shareOwner, /shareUrl: null/);
  assert.doesNotMatch(
    `${api}\n${shareOwner}\n${shareViewer}`,
    /localStorage|sessionStorage|AsyncStorage/,
  );
});
