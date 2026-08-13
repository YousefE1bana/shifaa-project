import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (name: string) => fs.readFileSync(new URL(`../app/${name}`, import.meta.url), 'utf8');
const switcher = read('care-switcher.tsx');
const relationships = read('relationships.tsx');
const contacts = read('emergency-contacts.tsx');
const localeContext = fs.readFileSync(
  new URL('../src/locale-context.tsx', import.meta.url),
  'utf8',
);
const familyApi = fs.readFileSync(new URL('../src/family-care-api.ts', import.meta.url), 'utf8');

test('live locale synchronizes document language and direction', () => {
  assert.match(localeContext, /document\.documentElement\.lang = locale/);
  assert.match(
    localeContext,
    /document\.documentElement\.dir = locale === 'ar-EG' \? 'rtl' : 'ltr'/,
  );
});

test('explicit care context announces patient and relationship without an offline queue', () => {
  for (const token of [
    'FamilyContextBanner',
    'confirmed',
    'patientName',
    'relationship',
    'offline',
  ])
    assert.match(switcher, new RegExp(token, 'i'));
  assert.doesNotMatch(switcher, /queueMutation|backgroundSync|automatic.*context/i);
});

test('guardianship and delegation surfaces use real client calls and exact permissions', () => {
  for (const token of [
    'createGuardianship',
    'createDelegation',
    'acceptDelegation',
    'record.view',
    'sos.activate',
    'conflict',
    'offline-no-queue',
  ])
    assert.match(relationships, new RegExp(token.replace('.', '\\.')));
  assert.doesNotMatch(relationships, /consent\.manage/);
  assert.doesNotMatch(relationships, /reviewGuardianship/);
  assert.doesNotMatch(relationships, /params\.invite|invite\?: string/);
  assert.match(relationships, /aria-labelledby="delegate-person-label"/);
  assert.match(relationships, /direction: 'ltr'/);
});

test('Emergency Contact is separate, masked by API projection, and explains closed disclosure', () => {
  for (const token of [
    'createEmergencyContact',
    'respondEmergencyContact',
    'confirmed',
    'declined',
    'revoked',
    'expired',
    'location_precision',
    'disclosure',
  ])
    assert.match(contacts, new RegExp(token, 'i'));
  assert.doesNotMatch(contacts, /diagnosis.*payload|medical record.*payload/i);
  assert.match(contacts, /aria-labelledby="contact-phone-label"/);
  assert.match(contacts, /message === 'success'/);
  assert.doesNotMatch(contacts, /params\.token|token\?: string/);
  assert.match(familyApi, /location\.hash/);
  assert.match(familyApi, /history\.replaceState/);
  assert.match(
    relationships,
    /useEffect\(\(\) => setInvitation\(consumeInvitationFragment\(\)\), \[\]\)/,
  );
  assert.match(
    contacts,
    /useEffect\(\(\) => setInvitation\(consumeInvitationFragment\(\)\), \[\]\)/,
  );
});
