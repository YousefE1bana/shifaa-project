import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Value } from '@sinclair/typebox/value';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const feature = 'specs/011-allergies-clinical-content-governance';

// Approved v1 inputs are frozen external expectations, not encoder-generated snapshots.
const canonicalizationPins = {
  [`${feature}/contracts/artifact-canonicalization-v1.md`]:
    'f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9',
  [`${feature}/contracts/artifact-canonicalization-v1.json`]:
    '88fc3961c18b868d38fda8b8f0d93c49e3cc8ccba64de4a63b66a2081c7f52f2',
  [`${feature}/contracts/artifact-canonicalization-v1-vectors.json`]:
    '7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133',
  [`${feature}/contracts/artifact-canonicalization-parity-v1.json`]:
    'b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523',
};
const expectedCanonicalizationMetadata = {
  contractId: 'SHIFAA-F011-ARTIFACT/1',
  normativeInputDigests: Object.fromEntries(Object.entries(canonicalizationPins).slice(0, 3)),
  parityRegistrySha256:
    canonicalizationPins[`${feature}/contracts/artifact-canonicalization-parity-v1.json`],
};

const uuid = 'f1100000-0000-4000-8000-000000000001';
const instant = '2026-10-06T10:00:00Z';
const unknown = { knowledge: 'unknown' };
const source = { display: 'SYNTHETIC-SOURCE' };
const meta = { nextCursor: null, lastUpdatedAt: instant, stale: false };
const artifact = { contentEvidenceRef: uuid, codeEvidenceRef: uuid, testVectorEvidenceRef: uuid };
const statusRelease = {
  releaseId: uuid,
  source,
  artifactVersion: 1,
  effectiveAt: instant,
  publicationState: 'published',
  eligibility: 'future',
  supersedesReleaseId: null,
  initial: true,
  signatureStatus: { physicianApproved: true, pharmacistApproved: true },
};

async function generated() {
  expect(
    fs.existsSync(path.join(root, 'packages/contracts/src/feature-011.ts')),
    'Feature 011 generated wire schemas are not yet implemented',
  ).toBe(true);
  return import('./feature-011.js');
}

describe('Feature 011 generated closed wire contract', () => {
  it('has exactly seven bindings, five idempotency and three workflow If-Match headers', async () => {
    const { feature011Operations } = await generated();
    expect(feature011Operations.map((o) => [o.operationId, o.method, o.path])).toEqual([
      ['listAllergies', 'GET', '/patients/{managedPatientId}/allergies'],
      ['createAllergy', 'POST', '/patients/{managedPatientId}/allergies'],
      ['verifyAllergy', 'POST', '/allergies/{allergyId}/verification'],
      ['listClinicalContent', 'GET', '/admin/clinical-content/{contentType}'],
      ['createClinicalContentRelease', 'POST', '/admin/clinical-content/{contentType}/releases'],
      [
        'signClinicalContentRelease',
        'POST',
        '/admin/clinical-content/releases/{releaseId}/signatures',
      ],
      [
        'publishClinicalContentRelease',
        'POST',
        '/admin/clinical-content/releases/{releaseId}/publish',
      ],
    ]);
    expect(
      feature011Operations.filter((o) =>
        o.headerParameters.some((h) => h.name === 'Idempotency-Key' && h.required),
      ),
    ).toHaveLength(5);
    expect(
      feature011Operations.filter((o) =>
        o.headerParameters.some((h) => h.name === 'If-Match' && h.required),
      ),
    ).toHaveLength(3);
  });

  it.each([
    [{ knowledge: 'known', value: 'SYNTHETIC-OPAQUE' }, true],
    [unknown, true],
    [{ knowledge: 'unknown', value: 'invented' }, false],
    [{ knowledge: 'known' }, false],
    [{ knowledge: 'known', value: '' }, false],
    [{ knowledge: 'unknown', fabricatedSeverity: 3 }, false],
  ])('KnownUnknownText %j validity is %s', async (payload, valid) => {
    const { feature011Schemas } = await generated();
    expect(Value.Check(feature011Schemas.KnownUnknownText, payload)).toBe(valid);
  });

  it('preserves opaque coded facts and rejects incomplete or invented coding', async () => {
    const { feature011Schemas: s } = await generated();
    expect(
      Value.Check(s.KnownUnknownCoding, {
        knowledge: 'known',
        value: { system: 'SYNTHETIC', code: 'A' },
      }),
    ).toBe(true);
    expect(Value.Check(s.KnownUnknownCoding, { knowledge: 'known', value: { code: 'A' } })).toBe(
      false,
    );
    expect(Value.Check(s.KnownUnknownCoding, { knowledge: 'unknown', value: null })).toBe(false);
  });

  it('allows omitted or explicitly unknown facts but requires substance/source and denies asserted authority/status', async () => {
    const { feature011Schemas: s } = await generated();
    const request = {
      substance: { identity: 'SYNTHETIC-A', display: 'Synthetic assertion' },
      source,
    };
    expect(Value.Check(s.CreateAllergyRequest, request)).toBe(true);
    expect(
      Value.Check(s.CreateAllergyRequest, {
        ...request,
        coding: unknown,
        reaction: unknown,
        severity: unknown,
        onset: unknown,
        correctsAllergyId: uuid,
      }),
    ).toBe(true);
    for (const injected of [
      { status: 'clinician_confirmed' },
      { actorPersonId: uuid },
      { approved: true },
    ]) {
      expect(Value.Check(s.CreateAllergyRequest, { ...request, ...injected })).toBe(false);
    }
    expect(Value.Check(s.CreateAllergyRequest, { substance: request.substance })).toBe(false);
  });

  it('bounds verification to confirmed/refuted/terminal error and preserves required reason/evidence', async () => {
    const { feature011Schemas: s } = await generated();
    for (const targetStatus of ['clinician_confirmed', 'refuted', 'entered_in_error']) {
      expect(
        Value.Check(s.VerifyAllergyRequest, {
          targetStatus,
          reason: 'SYNTHETIC',
          verificationEvidenceRef: uuid,
        }),
      ).toBe(true);
    }
    expect(
      Value.Check(s.VerifyAllergyRequest, {
        targetStatus: 'self_reported',
        reason: 'SYNTHETIC',
        verificationEvidenceRef: uuid,
      }),
    ).toBe(false);
    expect(Value.Check(s.VerifyAllergyRequest, { targetStatus: 'refuted', reason: '' })).toBe(
      false,
    );
  });

  it('closes the initial and explicit supersession union without fabricated predecessor defaults', async () => {
    const { feature011Schemas: s } = await generated();
    const draft = {
      governedContentKey: 'SYNTHETIC-A',
      effectiveScopeKey: 'SYNTHETIC-SCOPE',
      source,
      effectiveAt: instant,
      artifact,
    };
    for (const predecessor of [
      { initial: true, supersedesReleaseId: null },
      { initial: false, supersedesReleaseId: uuid },
    ]) {
      expect(Value.Check(s.CreateReleaseRequest, { ...draft, predecessor })).toBe(true);
    }
    for (const predecessor of [
      { initial: true, supersedesReleaseId: uuid },
      { initial: false, supersedesReleaseId: null },
      { initial: true },
    ]) {
      expect(Value.Check(s.CreateReleaseRequest, { ...draft, predecessor })).toBe(false);
    }
  });

  it('keeps exact artifact identity separate from workflow CAS and rejects signer/admin injection', async () => {
    const { feature011Schemas: s } = await generated();
    const sign = {
      capacity: 'physician',
      decision: 'approved',
      artifactVersion: 1,
      artifactDigest: 'a'.repeat(64),
      signingEvidenceRef: uuid,
    };
    expect(Value.Check(s.SignReleaseRequest, sign)).toBe(true);
    for (const injected of [
      { workflowVersion: 2 },
      { signerPersonId: uuid },
      { adminRole: 'ADM-MEDICAL' },
    ]) {
      expect(Value.Check(s.SignReleaseRequest, { ...sign, ...injected })).toBe(false);
    }
    expect(
      Value.Check(s.PublishReleaseRequest, {
        artifactVersion: 1,
        artifactDigest: 'a'.repeat(64),
        confirmPublication: true,
      }),
    ).toBe(true);
    expect(
      Value.Check(s.PublishReleaseRequest, {
        artifactVersion: 1,
        artifactDigest: 'a'.repeat(64),
        confirmPublication: false,
      }),
    ).toBe(false);
  });

  it('exposes three disjoint content projections and prevents clinic body/signature/authority leakage', async () => {
    const { feature011Schemas: s } = await generated();
    const review = { content: 'SYNTHETIC', code: 'SYNTHETIC', testVectors: 'SYNTHETIC' };
    const { eligibility, signatureStatus, ...common } = statusRelease;
    const artifactFields = {
      artifactDigest: 'a'.repeat(64),
      workflowVersion: 2,
      artifact,
      syntheticOnly: true,
      artifactReview: review,
    };
    const assigned = { ...common, ...artifactFields, signatureStatus };
    const governance = {
      ...common,
      ...artifactFields,
      eligibility,
      contentType: 'SYNTHETIC',
      governedContentKey: 'SYNTHETIC-A',
      effectiveScopeKey: 'SYNTHETIC-SCOPE',
      creatorPersonId: uuid,
      createdAt: instant,
      publisherPersonId: null,
      publishedAt: null,
      signatures: [],
    };
    for (const [projection, row] of [
      ['status', statusRelease],
      ['assigned_review', assigned],
      ['governance', governance],
    ]) {
      expect(Value.Check(s.ClinicalContentList, { projection, data: [row], meta })).toBe(true);
    }
    for (const extra of [
      { artifactReview: review },
      { signerPersonId: uuid },
      { workflowVersion: 2 },
      { artifact },
      { publicationState: 'draft' },
    ]) {
      expect(
        Value.Check(s.StatusList, {
          projection: 'status',
          data: [{ ...statusRelease, ...extra }],
          meta,
        }),
      ).toBe(false);
    }
  });

  it('keeps cursor/filter inputs closed and errors RFC 9457-shaped', async () => {
    const { feature011QuerySchemas: q, feature011Schemas: s } = await generated();
    expect(
      Value.Check(q.listAllergies, { cursor: 'opaque-bound-cursor', view: 'history', limit: 100 }),
    ).toBe(true);
    expect(Value.Check(q.listAllergies, { limit: 101 })).toBe(false);
    expect(Value.Check(q.listClinicalContent, { projection: 'governance' })).toBe(true);
    expect(Value.Check(q.listClinicalContent, { projection: 'unapproved' })).toBe(false);
    expect(
      Value.Check(q.listClinicalContent, { projection: 'status', authority: 'ADM-MEDICAL' }),
    ).toBe(false);
    expect(Value.Check(q.listClinicalContent, {})).toBe(false);
    const problem = {
      type: 'urn:shifaa:forbidden',
      title: 'Denied',
      status: 403,
      detail: 'Synthetic denial',
      instance: '/synthetic',
      code: 'forbidden',
      request_id: uuid,
    };
    expect(Value.Check(s.Problem, problem)).toBe(true);
    expect(Value.Check(s.Problem, { ...problem, rawClinicalContent: 'forbidden' })).toBe(false);
  });
});

async function verifierFixture(
  mutate?: (fixtureRoot: string) => void | Promise<void>,
  full = false,
  inspect?: (fixtureRoot: string) => Promise<void>,
) {
  const tool = path.join(root, 'tools/verify-feature-011-contracts.mjs');
  expect(fs.existsSync(tool), 'Feature 011 contracts verifier is not yet implemented').toBe(true);
  const parent = path.join(root, 'artifacts/feature-011/c02-fixtures');
  fs.mkdirSync(parent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(parent, 'contracts-'));
  const {
    readDocumentationSuccessor,
    documentationSuccessorInputPaths,
    constitutionSuccessorInputPaths,
  } = await import(
    pathToFileURL(path.join(root, 'tools/feature-011-documentation-successor.mjs')).href
  );
  const copies = [
    // Legacy assertions run unchanged against the current approved P3 fixture.
    `${feature}/decisions/recovered-plan-approval-manifest-v1.json`,
    `${feature}/decisions/recovered-plan-approved-2026-10-06.md`,
    // Current canonical docs require their exact approved maintenance binding.
    // Physical evidence stays absent: preparation must never unlock consumers.
    ...(readDocumentationSuccessor(root)
      ? [
          ...documentationSuccessorInputPaths,
          `${feature}/evidence/fresh-implementation/K24/documentation-renewal/authorization.json`,
        ]
      : []),
    'tools/feature-011-documentation-successor.mjs',
    ...constitutionSuccessorInputPaths.filter((file: string) =>
      fs.existsSync(path.join(root, file)),
    ),
    ...(() => {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(root, feature, 'decisions/recovered-plan-approval-manifest-v1.json'),
          'utf8',
        ),
      );
      return [
        ...manifest.normativeApprovalInputs.baselineAuthority,
        ...manifest.normativeApprovalInputs.featurePlanFamily,
      ].map((input: { path: string }) => input.path);
    })(),
    `${feature}/contracts/openapi.yaml`,
    `${feature}/contracts/scope-manifest.json`,
    ...Object.keys(canonicalizationPins),
    `${feature}/data-model.md`,
    'docs/architecture/SHIFAA-API-Catalog.md',
    'docs/governance/SHIFAA-Feature-011-Reconciliation-2026-10-01.md',
    'tools/generate-feature-011-contract.mjs',
    'tools/generate-feature-011-client.mjs',
    'tools/verify-feature-011-contracts.mjs',
    'packages/contracts/src/feature-011.ts',
    'packages/contracts/src/index.ts',
    'packages/contracts/package.json',
    'packages/api-client/src/feature-011.ts',
    'packages/api-client/package.json',
  ];
  try {
    for (const file of copies) {
      const target = path.join(fixtureRoot, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, file), target);
    }
    await mutate?.(fixtureRoot);
    await inspect?.(fixtureRoot);
    const { verifyFeature011Contracts } = await import(pathToFileURL(tool).href);
    return await verifyFeature011Contracts({ root: fixtureRoot, contractsOnly: !full });
  } finally {
    expect(path.resolve(fixtureRoot).startsWith(`${parent}${path.sep}`)).toBe(true);
    fs.rmSync(fixtureRoot, { recursive: true });
  }
}

// Deliberately invalid evidence records exercise the file validator, not database
// behavior. These copies live only in the isolated, disposable test directory.
async function invalidPhysicalFixture(
  fixtureRoot: string,
  defect: 'stale' | 'owner' | 'race' | 'rls' | 'canonical' | 'canonical-digest',
) {
  const write = (file: string, body: string) => {
    const target = path.join(fixtureRoot, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  };
  const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const files = [
    'infra/db/policies/feature-011.sql',
    'infra/db/fixtures/feature-011.sql',
    'infra/db/tests/feature-011-schema.sql',
    'infra/db/tests/feature-011-rls.sql',
    'infra/db/tests/feature-011-allergy-create-read.sql',
    'infra/db/tests/feature-011-allergy-verification.sql',
    'infra/db/tests/feature-011-content-draft.sql',
    'infra/db/tests/feature-011-signatures.sql',
    'infra/db/tests/feature-011-publication.sql',
    'infra/db/tests/feature-011-content-projections.sql',
    'tools/run-feature-011-postgres-test.mjs',
    'tools/run-feature-011-concurrency-test.mjs',
    ...[
      'foundation',
      'allergy_entrypoints',
      'allergy_verification',
      'content_entrypoints',
      'content_signatures',
      'content_publication',
      'content_status_projection',
    ].map((suffix, index) => `supabase/migrations/2026100200110${index + 1}_f011_${suffix}.sql`),
  ];
  const { readHistoricalVerificationInputs } = await import(
    pathToFileURL(path.join(root, 'tools/feature-011-documentation-successor.mjs')).href
  );
  for (const file of files)
    write(
      file,
      // Keep the source-admission prerequisite valid so each deliberately invalid
      // physical bundle reaches its own security/coverage rejection below.
      file === 'tools/run-feature-011-postgres-test.mjs'
        ? readHistoricalVerificationInputs(root)(file).toString('utf8')
        : 'SYNTHETIC INVALID EVIDENCE FIXTURE; NEVER EXECUTED',
    );
  const inputs = [
    `${feature}/contracts/openapi.yaml`,
    `${feature}/contracts/scope-manifest.json`,
    `${feature}/data-model.md`,
    'docs/architecture/SHIFAA-API-Catalog.md',
    'docs/governance/SHIFAA-Feature-011-Reconciliation-2026-10-01.md',
    'tools/generate-feature-011-contract.mjs',
    'tools/generate-feature-011-client.mjs',
    'tools/verify-feature-011-contracts.mjs',
    'packages/contracts/src/feature-011.ts',
    'packages/contracts/src/index.ts',
    'packages/contracts/package.json',
    'packages/api-client/src/feature-011.ts',
    'packages/api-client/package.json',
    ...files,
  ];
  const sourceDigests = Object.fromEntries(
    inputs.map((file) => [file, sha(fs.readFileSync(path.join(fixtureRoot, file), 'utf8'))]),
  );
  const record = (name: string, body: unknown) => {
    const file = `${feature}/evidence/implementation/${name}.json`;
    const bytes = JSON.stringify(body);
    write(file, bytes);
    return { path: file, sha256: sha(bytes) };
  };
  const operations = [
    'listAllergies',
    'createAllergy',
    'verifyAllergy',
    'listClinicalContent',
    'createClinicalContentRelease',
    'signClinicalContentRelease',
    'publishClinicalContentRelease',
  ];
  const document = parse(
    fs.readFileSync(path.join(fixtureRoot, feature, 'contracts/openapi.yaml'), 'utf8'),
  );
  const wireBindings = Object.entries(document.paths).flatMap(([apiPath, methods]) =>
    Object.entries(methods as Record<string, { operationId: string }>).map(
      ([method, operation]) => ({ operationId: operation.operationId, method, path: apiPath }),
    ),
  );
  const signatureSidecar = 'clinical.synthetic_signature_bindings';
  const catalog = {
    signatureSidecar,
    tables: [
      'clinical.allergy_heads',
      'clinical.allergies',
      'clinical.mutation_receipts',
      'clinical.content_series',
      'clinical.content_releases',
      'clinical.content_governance_authorities',
      'clinical.content_reviewer_designations',
      'clinical.content_admissibility_evidence',
      'audit.signature_evidence',
      signatureSidecar,
    ].map((name) => ({
      name,
      rlsEnabled: true,
      rlsForced: true,
      columns: [{ name: 'synthetic', type: 'uuid', nullable: false }],
      constraints: [{ name: 'synthetic', definition: 'SYNTHETIC INVALID EXPECTATION' }],
      policies: [
        {
          name: 'synthetic',
          command: 'SELECT',
          roles: ['shifaa_f011_executor'],
          using: 'synthetic',
          withCheck: null,
        },
      ],
      grants: [],
    })),
    functions: operations.map((operationId) => ({
      operationId,
      method: wireBindings.find((binding) => binding.operationId === operationId)!.method,
      path: wireBindings.find((binding) => binding.operationId === operationId)!.path,
      identity: `clinical.synthetic_${operationId.toLowerCase()}(jsonb)`,
      arguments: 'jsonb',
      result: 'jsonb',
      definitionSha256: 'a'.repeat(64),
      owner: 'shifaa_f011_executor',
      securityDefiner: true,
      searchPath: '',
      grants: [{ grantee: 'shifaa_api', privilege: 'EXECUTE' }],
    })),
    roles: ['shifaa_api', 'shifaa_f011_executor'].map((name) => ({
      name,
      superuser: false,
      bypassRls: false,
      ownsDomainTables: false,
      login: false,
    })),
  };
  const expectedCatalog = record('expected', catalog);
  const ids = [
    'schema-constraints',
    'forced-rls',
    'non-owner-execution',
    'direct-public-service-denial',
    'seven-function-bindings',
    'predecessor-compatibility',
    'append-error-correction',
    'exact-artifact-independent-signing',
    'current-qualification-authority-loss',
    'initial-supersession-rollback-future-races',
    'closed-status-projection',
    'artifact-canonicalization-v1',
  ];
  const log = record('log', 'SYNTHETIC INVALID EVIDENCE; NOT A REAL DATABASE RUN');
  const runtimes = ['shifaa-local-postgres', 'shifaa-local-supabase'].map((id) => {
    const observed = structuredClone(catalog);
    if (defect === 'rls') observed.tables[0]!.rlsForced = false;
    const assertions = ids.map((assertionId) => ({
      id: assertionId,
      exitCode: 0,
      passed: 1,
      failed: 0,
      skipped: 0,
      currentUser:
        defect === 'owner'
          ? 'shifaa_owner'
          : assertionId === 'non-owner-execution'
            ? 'shifaa_f011_executor'
            : 'shifaa_api',
      command: ['SYNTHETIC-NOT-EXECUTED'],
      log,
    }));
    if (defect === 'canonical') assertions.splice(ids.indexOf('artifact-canonicalization-v1'), 1);
    if (defect === 'race')
      assertions.splice(ids.indexOf('initial-supersession-rollback-future-races'), 1);
    return {
      id,
      postgresMajor: 17,
      supabaseCliVersion: '2.113.0',
      isolated: true,
      kind: 'real',
      database: 'synthetic-invalid',
      executionRoles: ['shifaa_api', 'shifaa_f011_executor'],
      catalog: record(`${id}-catalog`, observed),
      execution: record(`${id}-execution`, {
        runtimeId: id,
        database: 'synthetic-invalid',
        sourceDigests,
        assertions,
      }),
    };
  });
  const proof = {
    formatVersion: 1,
    syntheticOnly: true,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceDigests,
    expectedCatalog,
    runtimes,
  };
  if (defect === 'stale') proof.sourceDigests[`${feature}/contracts/openapi.yaml`] = '0'.repeat(64);
  if (defect === 'canonical-digest')
    proof.sourceDigests[`${feature}/contracts/artifact-canonicalization-v1-vectors.json`] =
      '0'.repeat(64);
  record('physical-parity', proof);
}

describe('contract preparation and fail-closed full verification', () => {
  // Cold verifier imports compete with the parallel package suites. This is a
  // correctness/setup budget, separate from the operation latency requirements.
  it('passes preparation without physical outputs, with consumers denied', async () => {
    const report = await verifierFixture();
    expect(report.failures).toEqual([]);
    expect(report.mode).toBe('CONTRACT_PREPARATION_ONLY');
    expect(report.affectedConsumersAllowed).toBe(false);
  }, 15_000);
  it.each([
    [
      'unresolved ref',
      `${feature}/contracts/openapi.yaml`,
      (text: string) =>
        text.replace('#/components/schemas/Substance', '#/components/schemas/Missing'),
      /reference/i,
    ],
    [
      'open payload',
      `${feature}/contracts/openapi.yaml`,
      (text: string) => text.replace('additionalProperties: false', 'additionalProperties: true'),
      /closed|stale/i,
    ],
    [
      'stale client',
      'packages/api-client/src/feature-011.ts',
      (text: string) => text + '\n// stale\n',
      /stale/i,
    ],
  ])('rejects %s', async (_label, file, mutate, expected) => {
    const report = await verifierFixture((fixtureRoot) => {
      const target = path.join(fixtureRoot, file);
      fs.writeFileSync(target, mutate(fs.readFileSync(target, 'utf8')));
    });
    expect(report.failures.some((f: string) => expected.test(f))).toBe(true);
  });
  it('rejects missing generators', async () => {
    const report = await verifierFixture((fixtureRoot) =>
      fs.unlinkSync(path.join(fixtureRoot, 'tools/generate-feature-011-client.mjs')),
    );
    expect(report.failures.some((f: string) => /generator/i.test(f))).toBe(true);
  });
  it('full verification rejects missing or fabricated incomplete/owner-only physical evidence', async () => {
    const missing = await verifierFixture(undefined, true);
    expect(missing.failures.some((f: string) => /physical/i.test(f))).toBe(true);
    const incomplete = await verifierFixture((fixtureRoot) => {
      const target = path.join(
        fixtureRoot,
        feature,
        'evidence/implementation/physical-parity.json',
      );
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(
        target,
        JSON.stringify({
          result: 'PASS',
          runtime: 'shifaa-local-postgres',
          role: 'shifaa_owner',
          rls: true,
        }),
      );
    }, true);
    expect(incomplete.failures.length).toBeGreaterThan(0);
    expect(incomplete.affectedConsumersAllowed).toBe(false);
  }, 30_000); // Two filesystem/process-backed verifications under package-suite contention.
  it.each([
    ['stale', /digests stale/i],
    ['owner', /owner-only/i],
    ['race', /coverage incomplete/i],
    ['rls', /differ from expected catalog/i],
    ['canonical', /coverage incomplete/i],
    ['canonical-digest', /digests stale/i],
  ] as const)(
    'rejects a %s defect in a populated, deliberately invalid physical bundle',
    async (defect, expected) => {
      const report = await verifierFixture(
        (fixtureRoot) => invalidPhysicalFixture(fixtureRoot, defect),
        true,
      );
      expect(
        report.failures.some((failure: string) => expected.test(failure)),
        report.failures.join('\n'),
      ).toBe(true);
      expect(report.result).toBe('FAIL');
      expect(report.affectedConsumersAllowed).toBe(false);
    },
    15_000, // Filesystem/process-backed verifier under concurrent package-suite load.
  );
});

describe('C02A approved canonicalization input and metadata parity', () => {
  it('exports data-only metadata with the exact four approved input hashes', async () => {
    const module = await generated();
    expect(module).toHaveProperty(
      'feature011ArtifactCanonicalizationMetadata',
      expectedCanonicalizationMetadata,
    );
    expect(Object.keys(module).filter((name) => /encod|canonicaliz/i.test(name))).toEqual([
      'feature011ArtifactCanonicalizationMetadata',
    ]);
  });
  it('binds every canonical input in contracts-only and fail-closed full reports', async () => {
    for (const full of [false, true]) {
      const report = await verifierFixture(undefined, full);
      for (const [file, digest] of Object.entries(canonicalizationPins))
        expect(report.inputDigests[file]).toBe(digest);
      expect(report.affectedConsumersAllowed).toBe(false);
      expect(report.physicalParity).toBe('PENDING');
      expect(report.result).toBe(full ? 'FAIL' : 'PASS');
    }
  });
  it.each(Object.keys(canonicalizationPins))(
    'both generators and verifier reject missing canonical input %s',
    async (file) => {
      const report = await verifierFixture(
        (r) => fs.unlinkSync(path.join(r, file)),
        false,
        async (r) => {
          const contract = await import(
            pathToFileURL(path.join(root, 'tools/generate-feature-011-contract.mjs')).href
          );
          const client = await import(
            pathToFileURL(path.join(root, 'tools/generate-feature-011-client.mjs')).href
          );
          await expect(contract.renderFeature011Contract(r)).rejects.toThrow(
            /canonicalization|ENOENT/i,
          );
          await expect(client.renderFeature011Client(r)).rejects.toThrow(
            /canonicalization|ENOENT/i,
          );
        },
      );
      expect(report.result).toBe('FAIL');
      expect(report.failures.some((f: string) => /canonicalization|ENOENT/i.test(f))).toBe(true);
    },
  );
  it.each([
    [
      'contract contradiction',
      'artifact-canonicalization-v1.md',
      (text: string) =>
        text.replace(
          'the current release UUID and any physical/database series UUID',
          'all release UUIDs',
        ),
    ],
    [
      'profile ordinal 8 drift',
      'artifact-canonicalization-v1.json',
      (text: string) => text.replace('predecessor.supersedesReleaseId', 'currentReleaseId'),
    ],
    [
      'fixed vector byte corruption',
      'artifact-canonicalization-v1-vectors.json',
      (text: string) => text.replace('534849464141', '534849464142'),
    ],
    [
      'fixed vector digest corruption',
      'artifact-canonicalization-v1-vectors.json',
      (text: string) =>
        text.replace(
          'd6527da9019430db441226d26efdeca86dfd6c4da55d81d4429e603dff3fe9b0',
          '0'.repeat(64),
        ),
    ],
    [
      'registry hash mismatch',
      'artifact-canonicalization-parity-v1.json',
      (text: string) =>
        text.replace(
          'f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9',
          '0'.repeat(64),
        ),
    ],
    ['malformed profile', 'artifact-canonicalization-v1.json', () => '{'],
  ] as const)('both generators and verifier fail closed on %s', async (_label, name, mutate) => {
    const file = `${feature}/contracts/${name}`;
    const report = await verifierFixture(
      (r) => {
        const target = path.join(r, file);
        fs.writeFileSync(target, mutate(fs.readFileSync(target, 'utf8')));
      },
      false,
      async (r) => {
        const contract = await import(
          pathToFileURL(path.join(root, 'tools/generate-feature-011-contract.mjs')).href
        );
        const client = await import(
          pathToFileURL(path.join(root, 'tools/generate-feature-011-client.mjs')).href
        );
        await expect(contract.renderFeature011Contract(r)).rejects.toThrow(/canonicalization/i);
        await expect(client.renderFeature011Client(r)).rejects.toThrow(/canonicalization/i);
      },
    );
    expect(report.result).toBe('FAIL');
    expect(report.failures.some((f: string) => /canonicalization/i.test(f))).toBe(true);
  });
  it.each(['packages/contracts/src/feature-011.ts', 'packages/api-client/src/feature-011.ts'])(
    'rejects stale metadata in %s',
    async (file) => {
      const report = await verifierFixture((r) => {
        const target = path.join(r, file);
        const current = fs.readFileSync(target, 'utf8');
        expect(current).toContain(
          'b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523',
        );
        fs.writeFileSync(
          target,
          current.replace(
            'b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523',
            '0'.repeat(64),
          ),
        );
      });
      expect(report.result).toBe('FAIL');
      expect(report.failures.some((f: string) => /stale/i.test(f))).toBe(true);
    },
  );
});
