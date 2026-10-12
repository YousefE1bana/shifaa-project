import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const feature = path.dirname(root);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inventory = readJson(path.join(root, 'baseline-inventory.json'));
const manifest = readJson(path.join(root, 'reference-manifest.json'));
const scope = readJson(path.join(feature, 'contracts/scope-manifest.json'));
const source = fs.readFileSync(path.join(root, 'source/composition.js'), 'utf8');
const expectedFamilies = [
  ['F011-P0-PAT-RECORDS-001', 'patient', '/records', 23, 3],
  ['F011-P0-CLN-SUMMARY-001', 'clinic', '/patients/:id/summary', 26, 4],
  ['F011-P0-CLN-CONTENT-STATUS-001', 'clinic', '/clinical-content/status', 15, 4],
  ['F011-P0-ADM-CONTENT-001', 'admin', '/clinical-content', 35, 4],
];
assert.equal(inventory.sourceVersion, 'SHIFAA-F011-P0-SOURCE@0.1.1-test-only');
assert.equal(inventory.packageId, 'SHIFAA-F011-OPEN-UX-001-CANDIDATE@0.1.1-test-only');
assert.equal(inventory.status, 'CANDIDATE_PENDING_REQUIRED_APPROVALS');
assert.equal(manifest.status, inventory.status);
assert.deepEqual(inventory.locales, ['ar-EG', 'en-EG']);
assert.equal(inventory.routes.length, 4);
for (const [id, app, route, states, viewports] of expectedFamilies) {
  const row = inventory.routes.find(r => r.baselineId === id);
  assert.ok(row, id);
  assert.equal(row.app, app);
  assert.equal(row.route, route);
  assert.equal(row.states.length, states);
  assert.equal(new Set(row.states).size, states);
  assert.deepEqual(row.viewports, viewports === 3 ? ['360x800', '412x915', '768x1024'] : ['360x800', '412x915', '768x1024', '1440x900']);
  for (const state of ['loading','empty','error-recoverable','error-terminal','permission-denied','offline','stale','success']) assert.ok(row.states.includes(state));
}
assert.equal(scope.nfr.length, 19);
assert.equal(new Set(scope.nfr).size, 19);
assert.deepEqual(scope.operations.map(o => o.id), ['listAllergies','createAllergy','verifyAllergy','listClinicalContent','createClinicalContentRelease','signClinicalContentRelease','publishClinicalContentRelease']);
assert.ok(fs.readFileSync(path.join(feature, 'spec.md'), 'utf8').includes('`SPEC_APPROVED`'));
assert.ok(!/(?:supabase|services\/api|apps\/patient|apps\/clinic|apps\/admin)/.test(source), 'Composition must not import application/domain services');

const expected = new Map();
for (const row of inventory.routes) for (const locale of inventory.locales) for (const viewport of row.viewports) for (const state of row.states) expected.set([row.baselineId,locale,viewport,state].join('|'), row);
assert.equal(expected.size, 746);
assert.equal(inventory.routes.reduce((n,r) => n+r.states.length, 0), 99);
assert.equal(manifest.entryCount, expected.size);
assert.equal(manifest.entries.length, expected.size);
assert.equal(manifest.sourceVersion, inventory.sourceVersion);
assert.equal(hash(path.join(root, manifest.sourceArtifact)), manifest.sourceArtifactSha256);
assert.equal(hash(path.join(root, manifest.inventoryArtifact)), manifest.inventoryArtifactSha256);
for (const entry of manifest.sourceArtifacts) assert.equal(hash(path.join(root, entry.artifact)), entry.sha256, entry.artifact);
for (const entry of manifest.authorityArtifacts) assert.equal(hash(path.resolve(feature, entry.artifact)), entry.sha256, entry.artifact);
assert.equal(manifest.sourceArtifacts.filter(e => e.artifact.endsWith('.ttf')).length, 6);
assert.equal(manifest.sourceArtifacts.filter(e => e.artifact.endsWith('LICENSE_FONT.txt')).length, 2);
const fixture = readJson(path.join(root, 'source/fixture.json'));
assert.equal(fixture.syntheticOnly, true);
for (const [version, artifact] of Object.entries(fixture.artifacts)) {
  assert.equal(artifact.payload.artifactVersion, Number(version));
  assert.equal(artifact.payload.syntheticOnly, true);
  assert.equal(JSON.stringify(artifact.payload), artifact.canonical);
  assert.equal(crypto.createHash('sha256').update(artifact.canonical).digest('hex'), artifact.digest);
  assert.equal(artifact.payload.body, 'NEUTRAL PLACEHOLDER: NO CLINICAL CONTENT');
}
const seen = new Set();
for (const entry of manifest.entries) {
  const key = [entry.baselineId,entry.locale,entry.viewport,entry.state].join('|');
  assert.ok(expected.has(key), key);
  assert.ok(!seen.has(key), key);
  seen.add(key);
  assert.equal(entry.sourceNode, `${inventory.sourceVersion}#${entry.baselineId}--${entry.state}`);
  assert.equal(entry.fixtureId, 'F011-SYNTHETIC-VISUAL-001');
  assert.equal(entry.app, expected.get(key).app);
  assert.equal(entry.route, expected.get(key).route);
  const absolute = path.resolve(root, entry.referenceArtifact);
  assert.ok(absolute.startsWith(path.join(root, 'references') + path.sep));
  assert.equal(hash(absolute), entry.sha256, key);
  const png = fs.readFileSync(absolute);
  assert.equal(png.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, entry.viewport);
}
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
assert.equal(walk(path.join(root,'references')).filter(p=>p.endsWith('.png')).length, expected.size);
const gallery = fs.readFileSync(path.join(root,'review-gallery.html'),'utf8');
assert.deepEqual(JSON.parse(gallery.match(/<script id="manifest-data" type="application\/json">([\s\S]*?)<\/script>/)[1]), manifest);
execFileSync('git',['-C',feature,'diff','--check'],{stdio:'pipe'});
console.log(JSON.stringify({result:'PASS',status:manifest.status,families:4,states:99,references:746,nfr:19,operations:7,manifestSha256:hash(path.join(root,'reference-manifest.json')),checks:'source/authority/font/fixture/reference hashes, complete inventory, dimensions, gallery parity, frozen scope, diff hygiene'},null,2));
