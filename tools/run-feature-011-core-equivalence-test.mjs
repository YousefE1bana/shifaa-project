import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  root,
  runtimes,
  withDatabase,
  prepare,
  smoke,
  sql,
  readMigration,
  digest,
} from './run-feature-011-postgres-test.mjs';
import {
  checkpointMigrations,
  storageSlugs,
  consumerSlugs,
  baselineRows,
} from './run-feature-011-storage-test.mjs';
import { canonicalProof } from './run-feature-011-consumer-test.mjs';
import { verifyFeature011Contracts } from './verify-feature-011-contracts.mjs';
import {
  encodeArtifact,
  decodeArtifact,
  normalizeInstant,
  normalizeSource,
  assertDeclaredDigest,
} from '../packages/core/src/feature-011/artifact.ts';
process.chdir(root);
const f = 'specs/011-allergies-clinical-content-governance',
  e = f + '/evidence/fresh-implementation/K10';
const read = (p) => JSON.parse(readFileSync(p)),
  write = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n'),
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const vectorPath = f + '/contracts/artifact-canonicalization-v1-vectors.json',
  vectors = read(vectorPath);
const gate = await verifyFeature011Contracts();
assert.equal(gate.result, 'PASS', gate.failures.join('\n'));
const unlock = read(f + '/evidence/fresh-implementation/K09/k09-before-k10.json');
assert(unlock.k10Unlocked);
assert.equal(unlock.result, 'PASS');
for (const [name, h] of Object.entries(unlock.requiredEvidence))
  assert.equal(digest(f + '/evidence/fresh-implementation/K09/' + name), h);
const stage = read(
  f + '/evidence/fresh-implementation/K08/prerequisite-remediation/stage-assertion.json',
);
const paths = [
  'tools/run-feature-011-core-equivalence-test.mjs',
  ...['artifact', 'allergy-policy', 'content-policy'].flatMap((n) => [
    `packages/core/src/feature-011/${n}.ts`,
    `packages/core/src/feature-011/${n}.test.ts`,
  ]),
];
const pins = {
  ...stage.sourceDigests,
  ...unlock.sourceDigests,
  ...Object.fromEntries(paths.map((p) => [p, digest(p)])),
};
function verifyPins() {
  for (const [p, h] of Object.entries(pins))
    assert.equal(digest(p), h, 'Input/source/SQL/generated/producer drift: ' + p);
}
verifyPins();
mkdirSync(e + '/runtime', { recursive: true });
const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
const pureDenial = (work, utf8 = false) =>
  assert.throws(
    work,
    (error) =>
      error.message === 'Invalid Feature 011 artifact' ||
      (utf8 && error instanceof TypeError && /encoded data/.test(error.message)),
  );
function coreNegative(v) {
  if (v.facts) pureDenial(() => encodeArtifact(v.facts));
  else if (v.canonicalHex)
    pureDenial(() => decodeArtifact(Buffer.from(v.canonicalHex, 'hex')), v.id === 'N23');
  else if (v.declaredDigest)
    pureDenial(() =>
      assertDeclaredDigest(
        vectors.positive.find((p) => p.id === v.positiveVector).sha256,
        v.declaredDigest,
      ),
    );
  else if (v.wireEffectiveAt) pureDenial(() => normalizeInstant(v.wireEffectiveAt));
  else throw Error('Unhandled frozen negative ' + v.id);
  return { id: v.id, result: 'DENIED_AT_APPROVED_BOUNDARY', stage: v.stage };
}
function sqlBytes(runtime, db, facts) {
  return JSON.parse(
    sql(
      runtime,
      db,
      `BEGIN; SET LOCAL ROLE shifaa_f011_executor; SELECT json_build_object('hex',encode(b,'hex'),'sha256',encode(audit.sha256_v1(b),'hex')) FROM (SELECT clinical.f011_artifact_canonical_bytes_v1(${quote(JSON.stringify(facts))}::jsonb) AS b) q; ROLLBACK;`,
    ).stdout.trim(),
  );
}
const results = [];
for (const runtime of runtimes) {
  const proof = await withDatabase(
    runtime,
    (db) => {
      prepare(runtime, db);
      const health = smoke(runtime, db),
        before = baselineRows(runtime, db),
        migrations = checkpointMigrations([...storageSlugs, ...consumerSlugs]);
      migrations.forEach((p) => sql(runtime, db, readMigration(p)));
      const after = baselineRows(runtime, db);
      for (const [table, row] of Object.entries(before))
        assert.equal(after[table], row, 'Predecessor preservation ' + table);
      const executor = JSON.parse(
        sql(
          runtime,
          db,
          "SELECT row_to_json(r) FROM (SELECT rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname='shifaa_f011_executor') r;",
        ).stdout.trim(),
      );
      assert.equal(executor.rolsuper, false);
      assert.equal(executor.rolbypassrls, false);
      assert.equal(executor.rolcanlogin, false);
      const physical = canonicalProof(runtime, db, true);
      const positives = vectors.positive.map((v, i) => {
        const core = encodeArtifact(v.facts),
          sqlResult = physical.results[i],
          expected = Buffer.from(v.canonicalHex, 'hex');
        assert(Buffer.from(core).equals(expected), v.id + ' core frozen bytes');
        assert.equal(sqlResult.hex, v.canonicalHex, v.id + ' SQL frozen bytes');
        assert.equal(hash(core), v.sha256);
        assert.equal(sqlResult.sha256, v.sha256);
        assert.equal(hash(Buffer.from(sqlResult.hex, 'hex')), v.sha256);
        assert.deepEqual(decodeArtifact(core), v.facts);
        return {
          id: v.id,
          result: 'SQL_EQUALS_CORE_EQUALS_FROZEN',
          canonicalHex: v.canonicalHex,
          sha256: v.sha256,
          octets: core.length,
        };
      });
      const negatives = vectors.negative.map(coreNegative);
      assert.equal(negatives.length, 25);
      const normalized = [];
      const expectedTimes = {
        B01: '2026-10-01T00:00:00.000000Z',
        B02: '2026-10-01T00:00:00.123456Z',
        B03: '2026-10-01T00:00:00.100000Z',
      };
      for (const v of vectors.normalization) {
        const facts = structuredClone(vectors.positive[0].facts);
        if (v.wireSource) {
          facts.source = normalizeSource(v.wireSource);
          assert.deepEqual(facts.source, v.canonicalSource);
        } else {
          facts.effectiveAt = normalizeInstant(v.wireEffectiveAt);
          assert.equal(facts.effectiveAt, expectedTimes[v.id]);
        }
        const core = encodeArtifact(facts),
          database = sqlBytes(runtime, db, facts);
        assert.equal(database.hex, Buffer.from(core).toString('hex'));
        assert.equal(database.sha256, hash(core));
        normalized.push({
          id: v.id,
          result: 'BOUNDARY_NORMALIZED_SQL_CORE_EQUAL',
          effectiveAt: facts.effectiveAt,
        });
      }
      assert.notEqual(positives[5].sha256, positives[6].sha256, 'No NFC/NFD folding');
      const reordered = Object.fromEntries(Object.entries(vectors.positive[0].facts).reverse());
      assert.equal(sqlBytes(runtime, db, reordered).hex, vectors.positive[0].canonicalHex);
      assert.equal(
        Buffer.from(encodeArtifact(reordered)).toString('hex'),
        vectors.positive[0].canonicalHex,
      );
      verifyPins();
      return {
        result: 'PASS',
        runtime: runtime.name,
        serverVersion: health.manifest.serverVersion,
        executor,
        positives,
        negatives,
        normalization: normalized,
        sqlNegatives: physical.negatives,
        upstreamOnly: physical.upstreamOnly,
        unicodePreserved: true,
        keyOrderInvariant: true,
        field8InitialAndSuccessorExact: true,
        predecessorTablesPreserved: Object.keys(before).length,
        sqlDigests: Object.fromEntries(migrations.map((p) => [p, digest(p)])),
        sourceDigests: pins,
        expectedRegenerated: false,
        rawMaterialPassedIntoSql: false,
      };
    },
    'K08',
  );
  results.push(proof);
  verifyPins();
  write(e + '/runtime/' + runtime.name + '-equivalence.json', proof);
  console.log(runtime.name + ': SQL == core == frozen V01–V07 PASS');
}
write(e + '/equivalence.json', {
  checkpoint: 'K10',
  task: 'T043',
  result: 'PASS',
  vectors: { path: vectorPath, sha256: digest(vectorPath) },
  sourceDigests: pins,
  results,
  retainedGates:
    'All OPEN gates retained; no real evidence-source, production KMS or clinical approval; no P6/P7 owner acceptance inferred',
});
