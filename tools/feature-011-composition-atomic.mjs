// K22 adds failures at the real serialization and local AES boundaries to the
// accepted five-mutation harness. Original sources/evidence remain immutable.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
export async function atomicBoundaryProof({ command, evidence }) {
  const source = 'tools/run-feature-011-protection-test.mjs';
  const original = readFileSync(source, 'utf8');
  const sha256 = (text) => createHash('sha256').update(text).digest('hex');
  const output = evidence + '/reruns/atomic-boundaries';
  let suite = original;
  const replaceOnce = (from, to) => {
    assert.equal(suite.split(from).length, 2, 'Accepted harness seam must match exactly');
    suite = suite.replace(from, to);
  };
  replaceOnce(
    "import assert from 'node:assert/strict';",
    `import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';`,
  );
  const binding = /const f = 'specs\/011-allergies-clinical-content-governance',\s*e = [^;]+;/;
  assert.equal([...suite.matchAll(new RegExp(binding.source, 'g'))].length, 1);
  suite = suite.replace(
    binding,
    `const f = 'specs/011-allergies-clinical-content-governance', e = ${JSON.stringify(output)};`,
  );
  replaceOnce(
    'const dependencies = (sample, scope, fault) => ({',
    `const localFaultBoundaries = [];
  const dependencies = (sample, scope, fault) => ({`,
  );
  replaceOnce(
    'prepare: async () => prepareMutation(sample, scope),',
    `prepare: async () => {
      const prepared = await prepareMutation(sample, scope);
      if (fault === 'serialize') {
        const compose = prepared.compose;
        prepared.compose = (meta, projection) => {
          const response = compose(meta, projection);
          localFaultBoundaries.push({operation: sample.action, boundary: 'canonical-response-serialization'});
          return {...response, invalidNonJsonValue: 1n};
        };
      }
      return prepared;
    },`,
  );
  replaceOnce(
    'const result = work(meta, projection);',
    `let result;
            const originalCipher = crypto.createCipheriv;
            let intercepted = false;
            if (fault === 'local-aes') {
              crypto.createCipheriv = (algorithm) => {
                assert.equal(algorithm, 'aes-256-gcm');
                assert.equal(activeTransactions, 1);
                assert.equal(phase, 'locked');
                intercepted = true;
                localFaultBoundaries.push({operation: sample.action, boundary: 'local-receipt-aes'});
                throw Error('K22_LOCAL_AES_FAULT');
              };
              syncBuiltinESMExports();
            }
            try { result = work(meta, projection); }
            finally {
              if (fault === 'local-aes') {
                crypto.createCipheriv = originalCipher;
                syncBuiltinESMExports();
                assert.equal(intercepted, true, 'Real local AES boundary must be reached');
              }
            }`,
  );
  replaceOnce(
    "['compose', 'encrypt', 'finalizer', 'before-commit']",
    "['compose', 'serialize', 'local-aes', 'encrypt', 'finalizer', 'before-commit']",
  );
  replaceOnce(
    "fault === 'finalizer'\n                ?",
    "fault === 'serialize'\n                ? /Feature 011 protection denied/.test(error.message)\n                : fault === 'local-aes'\n                  ? error.message === 'K22_LOCAL_AES_FAULT'\n                  : fault === 'finalizer'\n                ?",
  );
  replaceOnce(
    'faultCases,\n      replayCases,',
    'faultCases,\n      localFaultBoundaries,\n      replayCases,',
  );
  replaceOnce(
    'const state = snapshot();',
    `const state = snapshot();
    for (const boundary of ['canonical-response-serialization', 'local-receipt-aes']) {
      assert.deepEqual([...new Set(localFaultBoundaries.filter(x=>x.boundary===boundary).map(x=>x.operation))].sort(),
        ['createAllergy','verifyAllergy','createClinicalContentRelease','signClinicalContentRelease','publishClinicalContentRelease'].sort());
    }`,
  );
  const temporary = 'tools/.f011-k22-' + randomUUID() + '.mjs';
  const originalHash = sha256(original);
  writeFileSync(temporary, suite, { flag: 'wx' });
  try {
    const result = await command('atomic-boundaries', ['--import', 'tsx', temporary]);
    mkdirSync(output, { recursive: true });
    const extension = {
      original: source,
      originalSha256: originalHash,
      temporarySha256: sha256(suite),
      testAssertionsChanged: true,
      addedScenarios: ['real canonical serialization failure', 'real local AES failure'],
      expectedValuesRegenerated: false,
    };
    writeFileSync(
      output + '/execution.json',
      JSON.stringify({ ...result, extension }, null, 2) + '\n',
    );
    return { ...result, output, extension };
  } finally {
    unlinkSync(temporary);
    assert.equal(sha256(readFileSync(source, 'utf8')), originalHash);
  }
}
