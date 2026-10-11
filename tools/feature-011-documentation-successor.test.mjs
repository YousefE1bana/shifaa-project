import assert from 'node:assert/strict';
import test from 'node:test';
import { renderFeature011Contract } from './generate-feature-011-contract.mjs';
import { mkdtempSync, mkdirSync, copyFileSync, appendFileSync, rmSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import {
  documentationSuccessorInputPaths,
  readDocumentationSuccessor,
} from './feature-011-documentation-successor.mjs';

test('approved documentation successor is current metadata without changing original approval', async () => {
  const output = await renderFeature011Contract();
  assert.ok(output.includes('3e01011f8f916535bef267845266bc5c3a3a7b1652b39afa3501dda6c9452757'));
  assert.ok(output.includes('79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548'));
  assert.ok(output.includes('SHIFAA-F011-DOCUMENTATION-SUCCESSOR@1.0.0'));
});

for (const file of [
  ...documentationSuccessorInputPaths,
  'specs/011-allergies-clinical-content-governance/decisions/recovered-plan-approval-manifest-v1.json',
]) {
  test(`documentation successor fails closed on drift: ${file}`, () => {
    const parent = resolve('artifacts/feature-011/k24/fixtures');
    mkdirSync(parent, { recursive: true });
    const fixture = mkdtempSync(join(parent, 'documentation-'));
    try {
      for (const p of [
        ...documentationSuccessorInputPaths,
        'specs/011-allergies-clinical-content-governance/decisions/recovered-plan-approval-manifest-v1.json',
      ]) {
        mkdirSync(dirname(join(fixture, p)), { recursive: true });
        copyFileSync(p, join(fixture, p));
      }
      assert.equal(
        readDocumentationSuccessor(fixture).bindingId,
        'SHIFAA-F011-DOCUMENTATION-SUCCESSOR@1.0.0',
      );
      appendFileSync(join(fixture, file), '\nUNAPPROVED DRIFT\n');
      assert.throws(() => readDocumentationSuccessor(fixture), /drift|immutable/i);
      unlinkSync(join(fixture, file));
      if (file.endsWith('/documentation-successor-v1.json'))
        assert.equal(
          readDocumentationSuccessor(fixture),
          null,
          'Missing successor authorizes no override',
        );
      else assert.throws(() => readDocumentationSuccessor(fixture), /ENOENT/);
    } finally {
      assert.ok(resolve(fixture).startsWith(parent + sep));
      rmSync(fixture, { recursive: true });
    }
  });
}
