import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import { renderFeature011Contract } from './generate-feature-011-contract.mjs';
import { renderFeature011Client } from './generate-feature-011-client.mjs';
import {
  readDocumentationSuccessor,
  documentationSuccessorInputPaths,
  readHistoricalVerificationInputs,
} from './feature-011-documentation-successor.mjs';
const { verifyFeature011Contracts } = await import(
  process.env.F011_PROTOCOL_VERIFIER_MODULE ?? './verify-feature-011-contracts.mjs'
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feature = 'specs/011-allergies-clinical-content-governance';
const manifestPath = `${feature}/decisions/recovered-plan-approval-manifest-v1.json`;
const approvalPath = `${feature}/decisions/recovered-plan-approved-2026-10-06.md`;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (name) => JSON.parse(read(`${feature}/contracts/${name}.json`));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(read(manifestPath));
const normative = [
  ...manifest.normativeApprovalInputs.baselineAuthority,
  ...manifest.normativeApprovalInputs.featurePlanFamily,
];
const protocolInputs = normative.filter(({ path: file }) =>
  file.startsWith(`${feature}/contracts/`),
);
const successor = readDocumentationSuccessor(root);
const readHistorical = readHistoricalVerificationInputs(root);
const fixtureEvidenceRoot = successor
  ? `${feature}/evidence/fresh-implementation/K24/documentation-renewal`
  : `${feature}/evidence/fresh-implementation/K07`;
const currentNormative = normative.map((input) => ({
  ...input,
  sha256: successor?.inputDigests[input.path] ?? input.sha256,
}));
const profiles = [
  'content_material',
  'code_material',
  'test_vector_material',
  'signing',
  'credential',
  'designation',
  'signing_authority',
  'admissibility',
  'allergy_verification',
];
const copies = [
  ...new Set([
    ...normative.map(({ path: file }) => file),
    ...(successor
      ? [
          ...documentationSuccessorInputPaths,
          `${feature}/evidence/fresh-implementation/K24/documentation-renewal/authorization.json`,
        ]
      : []),
    'tools/feature-011-documentation-successor.mjs',
    manifestPath,
    approvalPath,
    'docs/architecture/SHIFAA-API-Catalog.md',
    'tools/generate-feature-011-contract.mjs',
    'tools/generate-feature-011-client.mjs',
    'tools/verify-feature-011-contracts.mjs',
    'packages/contracts/src/feature-011.ts',
    'packages/contracts/src/index.ts',
    'packages/contracts/package.json',
    'packages/api-client/src/feature-011.ts',
    'packages/api-client/package.json',
  ]),
];

async function fixture(run) {
  const parent = path.join(root, 'artifacts/feature-011/k02/fixtures');
  fs.mkdirSync(parent, { recursive: true });
  const target = fs.mkdtempSync(path.join(parent, 'protocol-'));
  try {
    for (const file of copies) {
      fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
      // These fixtures exercise frozen F011 approvals, using the existing
      // successor reader's verified historical bytes rather than incomplete live successors.
      const bytes = /^tools\/generate-feature-011-(?:contract|client)\.mjs$/.test(file)
        ? fs.readFileSync(path.join(root, file))
        : readHistorical(file);
      fs.writeFileSync(path.join(target, file), bytes);
    }
    return await run(target);
  } finally {
    assert.ok(path.resolve(target).startsWith(`${parent}${path.sep}`));
    fs.rmSync(target, { recursive: true });
  }
}

test('fixture health: all recovered approval inputs are intact and legacy public preparation runs', async () => {
  assert.equal(
    sha(read(manifestPath)),
    '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548',
  );
  assert.equal(normative.length, 42);
  for (const { path: file, sha256 } of currentNormative)
    assert.equal(sha(readHistorical(file)), sha256, file);
  await fixture(async (r) => {
    assert.ok((await renderFeature011Contract(r)).includes('feature011Operations'));
    assert.ok((await renderFeature011Client(r)).includes('generatedFeature011OperationIds'));
    assert.deepEqual(
      (await verifyFeature011Contracts({ root: r, contractsOnly: true })).failures,
      [],
    );
  });
});

test('frozen V01–V07 keep independent bytes, digests and the sole field-8 lineage exception', () => {
  const vectors = json('artifact-canonicalization-v1-vectors');
  assert.equal(
    sha(read(`${feature}/contracts/artifact-canonicalization-v1-vectors.json`)),
    '7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133',
  );
  assert.deepEqual(
    vectors.positive.map((v) => v.id),
    ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07'],
  );
  for (const v of vectors.positive) {
    const bytes = Buffer.from(v.canonicalHex, 'hex');
    assert.equal(bytes.length, v.octetLength);
    assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(bytes), v.canonicalUtf8);
    assert.equal(sha(bytes), v.sha256);
  }
  const p = json('artifact-canonicalization-v1');
  assert.equal(p.representation.fieldOrder[7].fact, 'predecessor.supersedesReleaseId');
  assert.equal(p.representation.fieldOrder[7].type, 'S|N');
  assert.ok(p.excludedFields.includes('any physical/database series UUID'));
});

test('recovered metadata is data only and binds all current approved profiles in both outputs', async () => {
  for (const render of [renderFeature011Contract, renderFeature011Client]) {
    const source = await render();
    const match = source.match(/export const feature011ProtocolMetadata = ([\s\S]*?) as const;/);
    assert.ok(match, 'missing recovered protocol metadata');
    const metadata = JSON.parse(
      JSON.stringify(vm.runInNewContext(`(${match[1]})`, {}, { timeout: 1000 })),
    );
    assert.equal(
      metadata.planManifestSha256,
      '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548',
    );
    assert.deepEqual(metadata.evidenceProfiles, profiles);
    assert.equal(metadata.nfrCount, 19);
    assert.equal(metadata.operationCount, 7);
    assert.equal(metadata.retainedGate, 'OPEN-TECH-002');
    assert.equal(metadata.consumptionAllowed, false);
    for (const { path: file, sha256 } of currentNormative)
      assert.equal(metadata.normativeInputDigests[file], sha256, file);
    assert.doesNotMatch(
      source,
      /export (?:function|const) \w*(?:encode|serialize|decrypt|encrypt)\w*/i,
    );
  }
});

for (const { path: file } of [...normative, { path: manifestPath }, { path: approvalPath }]) {
  test(`both generators and contracts-only reject missing approved input: ${file}`, async () =>
    fixture(async (r) => {
      fs.unlinkSync(path.join(r, file));
      for (const render of [renderFeature011Contract, renderFeature011Client])
        await assert.rejects(() => render(r), /canonicalization|protocol|approved input/i);
      const report = await verifyFeature011Contracts({ root: r, contractsOnly: true });
      assert.equal(report.result, 'FAIL');
      assert.equal(report.affectedConsumersAllowed, false);
    }));
}

for (const { path: file } of protocolInputs) {
  test(`both generators and verifier reject stale/inconsistent protocol input: ${file}`, async () =>
    fixture(async (r) => {
      fs.appendFileSync(path.join(r, file), '\nSTALE INPUT\n');
      for (const render of [renderFeature011Contract, renderFeature011Client])
        await assert.rejects(() => render(r), /canonicalization|protocol/i);
      const report = await verifyFeature011Contracts({ root: r, contractsOnly: true });
      assert.equal(report.result, 'FAIL');
    }));
}

const inconsistencies = [
  [
    'trusted-release-handoff-v1.json',
    (p) => {
      p.protectedAadContract.frameCount = 6;
    },
  ],
  [
    'trusted-release-handoff-v1-vectors.json',
    (p) => {
      p.fullHandoffPositive[0].handoff.trustedEvidence.content.verifiedSha256 = '0'.repeat(64);
    },
  ],
  [
    'allergy-protection-v1.json',
    (p) => {
      p.aad.frameOrder.reverse();
    },
  ],
  [
    'allergy-protection-v1-vectors.json',
    (p) => {
      p.payloadPositive[0].expectedBytes.sha256 = '0'.repeat(64);
    },
  ],
  [
    'mutation-receipt-v1.json',
    (p) => {
      p.allowedHeaders.push('Authorization');
    },
  ],
  [
    'mutation-receipt-v1-vectors.json',
    (p) => {
      p.positive[0].expectedAad.sha256 = '0'.repeat(64);
    },
  ],
  [
    'verified-evidence-binding-v1.json',
    (p) => {
      p.profiles.signing.additionalProperties = true;
    },
  ],
  [
    'verified-evidence-binding-v1-vectors.json',
    (p) => {
      p.positive[0].result.profile = 'unknown';
    },
  ],
  [
    'verified-evidence-binding-parity-v1.json',
    (p) => {
      p.inputs[0].sha256 = '0'.repeat(64);
    },
  ],
];
for (const [name, mutate] of inconsistencies) {
  test(`both generators reject valid JSON with inconsistent approved facts: ${name}`, async () =>
    fixture(async (r) => {
      const file = path.join(r, feature, 'contracts', name);
      const input = JSON.parse(fs.readFileSync(file, 'utf8'));
      mutate(input);
      fs.writeFileSync(file, JSON.stringify(input));
      for (const render of [renderFeature011Contract, renderFeature011Client])
        await assert.rejects(() => render(r), /protocol/i);
    }));
}

test('contracts-only binds P1–P3, including current vector/profile registries', async () =>
  fixture(async (r) => {
    const report = await verifyFeature011Contracts({ root: r, contractsOnly: true });
    assert.equal(report.result, 'PASS');
    assert.deepEqual(report.requiredStages, ['P1', 'P2', 'P3']);
    for (const { path: file, sha256 } of currentNormative)
      assert.equal(report.inputDigests[file], sha256, file);
    assert.equal(report.affectedConsumersAllowed, false);
  }));

test('default requires current P4 and separately owned P5, with no P6 backward prerequisite', async () =>
  fixture(async (r) => {
    const report = await verifyFeature011Contracts({ root: r });
    assert.equal(report.result, 'FAIL');
    assert.deepEqual(report.requiredStages, ['P1', 'P2', 'P3', 'P4', 'P5']);
    assert.ok(report.failures.some((f) => /P4|physical/i.test(f)));
    assert.ok(report.failures.some((f) => /P5.*missing/i.test(f)));
    assert.equal(report.retainedGate, 'OPEN-TECH-002');
    assert.equal(report.affectedConsumersAllowed, false);
  }));

test('historical R2 registry is bound as history without accepting its superseded current hashes', async () =>
  fixture(async (r) => {
    const report = await verifyFeature011Contracts({ root: r, contractsOnly: true });
    assert.equal(report.result, 'PASS');
    assert.deepEqual(report.supersededRegistries, [
      `${feature}/contracts/plan-protection-parity-r2.json`,
    ]);
  }));

// These file-validator fixtures never execute SQL or confer human acceptance.
// The physical record is deliberately incomplete; P5 is inspected separately so
// a missing P4 cannot conceal a broken owner/stage check.
async function stageFixture(r) {
  const write = (file, body) => {
    const target = path.join(r, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof body === 'string' ? body : JSON.stringify(body));
    return { path: file, sha256: sha(fs.readFileSync(target)) };
  };
  const sourceDigests = (await verifyFeature011Contracts({ root: r, contractsOnly: true }))
    .inputDigests;
  const publicProof = write(`${feature}/evidence/fresh-implementation/K02/protocol-proof.json`, {
    result: 'PASS',
    fixtureOnly: true,
  });
  const physical = write(`${fixtureEvidenceRoot}/physical-green.json`, {
    formatVersion: 1,
    syntheticOnly: true,
    result: 'FAIL',
    fixtureOnly: true,
  });
  const races = write(`${fixtureEvidenceRoot}/physical-races.json`, {
    result: 'FAIL',
    fixtureOnly: true,
  });
  const evidenceDigests = Object.fromEntries(
    [publicProof, physical, races].map((d) => [d.path, d.sha256]),
  );
  const ownerDispositions = ['API Lead', 'Data Lead', 'QA Lead'].map((role, i) => ({
    role,
    name: 'Yousef Osama',
    disposition: 'ACCEPTED',
    record: write(
      `${feature}/decisions/fixture-owner-${i}.md`,
      `FILE VALIDATOR FIXTURE ONLY; NO REAL ACCEPTANCE\nDisposition: **ACCEPTED**.\nApprover: **Yousef Osama — ${role}**.\nK07 P5 SHIFAA-F011-FRESH-TASKS@1.0.0\n${Object.values(evidenceDigests).join('\n')}`,
    ),
  }));
  const proof = {
    formatVersion: 1,
    stage: 'P5',
    ledgerId: 'SHIFAA-F011-FRESH-TASKS@1.0.0',
    result: 'PASS',
    disposition: 'ACCEPTED_FOR_AFFECTED_CONSUMERS',
    openTech002: 'OPEN',
    globalGateClosure: false,
    requiredStages: ['P1', 'P2', 'P3', 'P4'],
    head: '670b1e0fe15c719b98179805f2628d1b478a55dd',
    sourceDigests,
    evidenceDigests,
    ownerDispositions,
  };
  const file = `${fixtureEvidenceRoot}/stage-assertion.json`;
  return { proof, file, write };
}

const stageDefects = [
  [
    'failed',
    (p) => {
      p.result = 'FAIL';
    },
    /failed\/unaccepted/,
  ],
  [
    'unaccepted',
    (p) => {
      p.disposition = 'PENDING_REVIEW';
    },
    /failed\/unaccepted/,
  ],
  [
    'stale source',
    (p) => {
      p.sourceDigests[`${feature}/contracts/openapi.yaml`] = '0'.repeat(64);
    },
    /hashes stale/,
  ],
  [
    'missing source',
    (p) => {
      delete p.sourceDigests['packages/api-client/src/feature-011.ts'];
    },
    /hashes stale/,
  ],
  [
    'stale physical binding',
    (p) => {
      p.evidenceDigests[`${fixtureEvidenceRoot}/physical-green.json`] = '0'.repeat(64);
    },
    /physical-green proof binding/,
  ],
  [
    'missing race binding',
    (p) => {
      delete p.evidenceDigests[`${fixtureEvidenceRoot}/physical-races.json`];
    },
    /physical-races proof binding/,
  ],
  [
    'stale public proof',
    (p) => {
      p.evidenceDigests[`${feature}/evidence/fresh-implementation/K02/protocol-proof.json`] =
        '0'.repeat(64);
    },
    /P1–P3 proof binding/,
  ],
  [
    'stale HEAD',
    (p) => {
      p.head = '0'.repeat(40);
    },
    /HEAD provenance missing or foreign/,
  ],
  [
    'wrong ledger',
    (p) => {
      p.ledgerId = 'superseded-95-task-ledger';
    },
    /stage\/ledger identity/,
  ],
  [
    'missing owner',
    (p) => {
      p.ownerDispositions.pop();
    },
    /owner dispositions missing/,
  ],
  [
    'unaccepted owner',
    (p) => {
      p.ownerDispositions[0].disposition = 'PENDING';
    },
    /unaccepted attributable owner/,
  ],
  [
    'stale owner record',
    (p) => {
      p.ownerDispositions[0].record.sha256 = '0'.repeat(64);
    },
    /stale acceptance record/,
  ],
  [
    'missing owner record',
    (p) => {
      delete p.ownerDispositions[0].record;
    },
    /missing digest-bound Product Owner acceptance/,
  ],
  [
    'wrong owner role',
    (p) => {
      p.ownerDispositions[0].role = 'Product Owner';
    },
    /owner dispositions missing|role\/stage record mismatch/,
  ],
  [
    'gate closure',
    (p) => {
      p.openTech002 = 'CLOSED';
    },
    /retained gate\/global closure drift/,
  ],
  [
    'global waiver',
    (p) => {
      p.globalGateClosure = true;
    },
    /retained gate\/global closure drift/,
  ],
  [
    'P6 backward dependency',
    (p) => {
      p.requiredStages.push('P6');
    },
    /P6 cannot unlock itself/,
  ],
  [
    'unaccepted record despite accepted flag',
    (p, s) => {
      const d = p.ownerDispositions[0].record;
      p.ownerDispositions[0].record = s.write(
        d.path,
        fs
          .readFileSync(path.join(s.root, d.path), 'utf8')
          .replace('Disposition: **ACCEPTED**.', 'Disposition: **NOT_ACCEPTED**.'),
      );
    },
    /unaccepted current physical proof/,
  ],
  [
    'record outside decisions',
    (p) => {
      p.ownerDispositions[0].record.path = 'package.json';
    },
    /missing digest-bound Product Owner acceptance/,
  ],
];
for (const [name, mutate, expected] of stageDefects) {
  test(`default rejects P5 ${name} independently of missing physical behavior`, async () =>
    fixture(async (r) => {
      const s = await stageFixture(r);
      mutate(s.proof, { ...s, root: r });
      s.write(s.file, s.proof);
      const report = await verifyFeature011Contracts({ root: r });
      assert.equal(report.result, 'FAIL');
      assert.ok(
        report.failures.some((f) => f.startsWith('P5') && expected.test(f)),
        report.failures.join('\n'),
      );
      assert.equal(report.affectedConsumersAllowed, false);
    }));
}

test('P5 input set has no circular P6 prerequisite; an incomplete P4 still prevents full PASS', async () =>
  fixture(async (r) => {
    const s = await stageFixture(r);
    s.write(s.file, s.proof);
    const report = await verifyFeature011Contracts({ root: r });
    assert.equal(report.result, 'FAIL');
    assert.ok(report.failures.some((f) => /physical/i.test(f)));
    assert.deepEqual(
      report.failures.filter((f) => f.startsWith('P5')),
      [],
    );
    assert.equal(report.affectedConsumersAllowed, false);
  }));

const physicalDefects = [
  [
    'failed result',
    (p) => {
      p.result = 'FAIL';
    },
    /current P4 identity\/result/,
  ],
  [
    'wrong ledger',
    (p) => {
      p.ledgerId = 'historical-95-task-ledger';
    },
    /current P4 identity\/result/,
  ],
  [
    'stale HEAD',
    (p) => {
      p.head = '0'.repeat(40);
    },
    /HEAD provenance missing or foreign/,
  ],
  [
    'stale Plan',
    (p) => {
      p.planManifestSha256 = '0'.repeat(64);
    },
    /Plan manifest binding stale/,
  ],
  [
    'stale generated hash',
    (p) => {
      p.sourceDigests['packages/contracts/src/feature-011.ts'] = '0'.repeat(64);
    },
    /P4 source\/generated hashes stale/,
  ],
  [
    'missing input hash',
    (p) => {
      delete p.sourceDigests[`${feature}/contracts/verified-evidence-binding-v1.json`];
    },
    /P4 source\/generated hashes stale/,
  ],
  [
    'non-synthetic claim',
    (p) => {
      p.syntheticOnly = false;
    },
    /versioned synthetic evidence/,
  ],
];
for (const [name, mutate, expected] of physicalDefects) {
  test(`default rejects current P4 ${name} before physical consumer preparation`, async () =>
    fixture(async (r) => {
      const s = await stageFixture(r);
      const p = {
        formatVersion: 1,
        stage: 'P4',
        ledgerId: 'SHIFAA-F011-FRESH-TASKS@1.0.0',
        result: 'PASS',
        syntheticOnly: true,
        fixtureOnly: true,
        head: s.proof.head,
        planManifestSha256: '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548',
        sourceDigests: s.proof.sourceDigests,
      };
      mutate(p);
      s.write(`${fixtureEvidenceRoot}/physical-green.json`, p);
      s.write(s.file, s.proof);
      const report = await verifyFeature011Contracts({ root: r });
      assert.equal(report.result, 'FAIL');
      assert.ok(
        report.failures.some((f) => /^Physical/.test(f) && expected.test(f)),
        report.failures.join('\n'),
      );
      assert.equal(report.affectedConsumersAllowed, false);
    }));
}
