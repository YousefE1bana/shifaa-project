import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  feature011CanonicalizationInputPaths,
  readFeature011ProtocolMetadata,
  renderFeature011Contract,
} from './generate-feature-011-contract.mjs';
import { renderFeature011Client } from './generate-feature-011-client.mjs';
import { evidenceHeadBelongsToCurrentHistory } from './feature-011-evidence-head.mjs';
import {
  readDocumentationSuccessor,
  documentationSuccessorInputPaths,
} from './feature-011-documentation-successor.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feature = 'specs/011-allergies-clinical-content-governance';
export const documentationRenewalAuthorizationPath = `${feature}/evidence/fresh-implementation/K24/documentation-renewal/authorization.json`;
export const nativeDigestAuthorizationPath = `${feature}/evidence/fresh-implementation/K24/prerequisite-remediation/authorization.json`;
export const nativeDigestRecordPath = `${feature}/decisions/k24-native-receipt-digest-remediation-v3-2026-10-09.md`;
export const prReviewEvidenceRoot = `${feature}/evidence/fresh-implementation/K24/pr-review-remediation-2026-10-11/prerequisite-remediation`;
export const prReviewAuthorizationPath = `${prReviewEvidenceRoot}/authorization.json`;
export const prReviewRecordPath = `${feature}/decisions/pr-490-remediation-authorized-2026-10-11.md`;
// An explicitly authorized remediation keeps prior acceptance evidence intact.
// Once selected, incomplete/stale renewed proofs fail closed; no old fallback.
export function currentEvidenceRoot(root = defaultRoot) {
  if (fs.existsSync(path.join(root, prReviewAuthorizationPath))) {
    if (
      sha256(fs.readFileSync(path.join(root, prReviewAuthorizationPath))) !==
        'c6cf223e031d9f09917285ad5e250597b60a6c7cc365cb7ffb897cd562d10afa' ||
      sha256(fs.readFileSync(path.join(root, prReviewRecordPath))) !==
        '7fc270ebad449f3198fae1fe21ff42fb5bbbb6b7a3479f25d0daafc9dd278220'
    )
      throw new Error('PR review remediation authorization drift');
    return prReviewEvidenceRoot;
  }
  if (readDocumentationSuccessor(root)) {
    if (
      sha256(fs.readFileSync(path.join(root, documentationRenewalAuthorizationPath))) !==
      '02d46d6ebdbd6a48c9f3fc2fa1bc0703cd20b5bb953638eb981088f7a56be264'
    )
      throw new Error('Documentation renewal authorization drift');
    if (fs.existsSync(path.join(root, nativeDigestAuthorizationPath))) {
      if (
        sha256(fs.readFileSync(path.join(root, nativeDigestAuthorizationPath))) !==
          '15deca786329aa6632d92b9317605e5c65edc1e57b8a83b15bb5ecb2bed35b8b' ||
        sha256(fs.readFileSync(path.join(root, nativeDigestRecordPath))) !==
          'd7030c8028c84598f9819919cf349ec362a381c3efaa938c1c016c7fdc81895e'
      )
        throw new Error('Native receipt digest remediation authorization drift');
      return `${feature}/evidence/fresh-implementation/K24/prerequisite-remediation`;
    }
    return `${feature}/evidence/fresh-implementation/K24/documentation-renewal`;
  }
  const publication = `${feature}/evidence/fresh-implementation/K17/prerequisite-remediation`;
  const publicationAuthorization = path.join(root, publication, 'authorization.json');
  if (fs.existsSync(publicationAuthorization)) {
    const record = JSON.parse(fs.readFileSync(publicationAuthorization, 'utf8'));
    if (
      record.authorization !== 'K15_ACCEPTED_K16_ACCEPTED_PAIRED_K17_K18_APPROVED' ||
      record.completionBoundary !== 62 ||
      record.record !== `${feature}/decisions/k17-exact-admission-remediation-2026-10-08.md` ||
      sha256(fs.readFileSync(path.join(root, record.record))) !== record.recordSha256
    )
      throw new Error('Unrecognized or stale exact-admission revalidation authorization');
    return publication;
  }
  const handoff = `${feature}/evidence/fresh-implementation/K12/identifier-reconciliation/prerequisite-remediation`;
  const handoffAuthorization = path.join(root, handoff, 'authorization.json');
  if (fs.existsSync(handoffAuthorization)) {
    const record = JSON.parse(fs.readFileSync(handoffAuthorization, 'utf8'));
    if (
      record.authorization !== 'F011_K12_BASELINE_RECONCILIATION_APPROVED' ||
      record.record !== 'docs/governance/SHIFAA-Identifier-Handoff-Amendment-2026-10-08.md' ||
      sha256(fs.readFileSync(path.join(root, record.record))) !== record.recordSha256
    )
      throw new Error('Unrecognized or stale additive identifier revalidation authorization');
    return handoff;
  }
  const renewed = `${feature}/evidence/fresh-implementation/K08/prerequisite-remediation`;
  const authorization = path.join(root, renewed, 'authorization.json');
  if (!fs.existsSync(authorization)) return `${feature}/evidence/fresh-implementation/K07`;
  const record = JSON.parse(fs.readFileSync(authorization, 'utf8'));
  if (record.authorization !== 'K08_PREREQUISITE_REMEDIATION_SWEEP_APPROVED')
    throw new Error('Unrecognized physical revalidation authorization');
  return renewed;
}
const bindings = [
  ['listAllergies', 'get', '/patients/{managedPatientId}/allergies'],
  ['createAllergy', 'post', '/patients/{managedPatientId}/allergies'],
  ['verifyAllergy', 'post', '/allergies/{allergyId}/verification'],
  ['listClinicalContent', 'get', '/admin/clinical-content/{contentType}'],
  ['createClinicalContentRelease', 'post', '/admin/clinical-content/{contentType}/releases'],
  ['signClinicalContentRelease', 'post', '/admin/clinical-content/releases/{releaseId}/signatures'],
  ['publishClinicalContentRelease', 'post', '/admin/clinical-content/releases/{releaseId}/publish'],
];
const contractInputs = [
  `${feature}/decisions/recovered-plan-approval-manifest-v1.json`,
  `${feature}/decisions/recovered-plan-approved-2026-10-06.md`,
  ...feature011CanonicalizationInputPaths,
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
];
const physicalInputs = [
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
];
const currentProofInputs = [
  'tools/feature-011-pr-authority.mjs',
  'infra/db/tests/feature-011-pr-authority.sql',
  'tools/feature-011-evidence-head.mjs',
  'tools/feature-011-evidence-head.test.mjs',
  'tools/feature-011-native-supabase-bootstrap.mjs',
  'tools/feature-011-native-supabase-bootstrap.test.mjs',
  'tools/start-feature-011-native-supabase.mjs',
  'tools/start-feature-011-native-supabase.test.mjs',
  'tools/reset-feature-011-native-supabase.mjs',
  'tools/reset-feature-011-native-supabase.test.mjs',
  'tools/feature-011-pr-review-binding.test.mjs',
  'package.json',
  '.github/workflows/ci.yml',
  'services/api/src/modules/feature-011/allergies.ts',
  'services/api/src/modules/feature-011/allergies.test.ts',
  'services/api/src/routes/feature-011-allergies.ts',
  'services/api/src/routes/feature-011-allergies.contract.test.ts',
  'services/api/src/routes/feature-011-content.ts',
  'services/api/src/routes/feature-011-content.test.ts',
  'tools/run-feature-011-handoff-test.mjs',
  'tools/run-feature-011-composition-test.mjs',
  'docs/governance/SHIFAA-Identifier-Handoff-Amendment-2026-10-08.md',
  'docs/architecture/SHIFAA-Data-RLS.md',
  'docs/traceability/SHIFAA-Traceability-Matrix.md',
  'specs/001-identity-onboarding/contracts/openapi.yaml',
  'specs/010-encounters-referrals-contextual-chat/contracts/openapi.yaml',
  'packages/contracts/src/identity-onboarding.ts',
  'packages/contracts/src/feature-010.ts',
  'packages/api-client/src/identity-onboarding.ts',
  'packages/api-client/src/feature-010.ts',
  'services/api/src/adapters/postgres/identity-repository.ts',
  'tools/feature-011-k08-preflight.mjs',
  'tools/feature-011-physical-green.mjs',
  'tools/feature-011-physical-races.mjs',
  'tools/feature-011-consumer-fixtures.mjs',
  'tools/run-feature-011-consumer-test.mjs',
  'tools/run-feature-011-storage-test.mjs',
  'tools/feature-011-support-lifecycle.mjs',
  'infra/db/fixtures/feature-011-k04.sql',
  'infra/db/fixtures/feature-011-k06.sql',
  'infra/db/tests/feature-011-k05-storage.sql',
  'packages/test-kit/src/feature-011/fixtures.ts',
  'services/api/src/feature-011-exposure.ts',
  'services/api/src/feature-011-exposure.test.ts',
  'tools/feature-011-predecessor-races.mjs',
  'infra/db/tests/feature-010-api.sql',
  'services/api/src/adapters/postgres/facility-service.ts',
  'services/api/src/adapters/postgres/identity-repository.ts',
];
export function currentPhysicalSourceDigests(root = defaultRoot, { includeRaces = true } = {}) {
  const metadata = readFeature011ProtocolMetadata(root);
  const files = new Set([
    ...contractInputs,
    ...(fs.existsSync(path.join(root, prReviewAuthorizationPath))
      ? [prReviewAuthorizationPath, prReviewRecordPath]
      : []),
    ...(metadata.documentationSuccessor
      ? [
          ...documentationSuccessorInputPaths,
          documentationRenewalAuthorizationPath,
          ...(fs.existsSync(path.join(root, nativeDigestAuthorizationPath))
            ? [nativeDigestAuthorizationPath, nativeDigestRecordPath]
            : []),
          'tools/feature-011-documentation-successor.mjs',
        ]
      : []),
    ...Object.keys(metadata.normativeInputDigests),
    'infra/db/migrations/001_identity_onboarding.sql',
    'supabase/config.toml',
    'compose.yml',
    ...physicalInputs.filter((file) => file !== 'infra/db/policies/feature-011.sql'),
    'infra/db/tests/feature-011-receipts.sql',
    'infra/db/tests/feature-011-concurrency.sql',
    ...currentProofInputs.filter(
      (file) => includeRaces || file !== 'tools/feature-011-physical-races.mjs',
    ),
    ...fs
      .readdirSync(path.join(root, 'supabase/migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => `supabase/migrations/${name}`),
  ]);
  return Object.fromEntries(
    [...files].map((file) => [file, sha256(fs.readFileSync(path.join(root, file)))]),
  );
}
// These are evidence categories, not new medical or product policy.
const physicalAssertions = [
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
const currentPhysicalAssertions = [
  ...physicalAssertions,
  'trusted-handoff-body-aad',
  'allergy-protection-v1',
  'mutation-receipt-v1',
  'verified-evidence-bindings',
  'deferred-commit-obligations',
  'predecessor-writer-lock-order',
];
const currentMigrationSuffixes = [
  'allergy_revisions.sql',
  'content_artifacts.sql',
  'governance_evidence.sql',
  'atomic_receipts.sql',
  'allergy_functions.sql',
  'release_functions.sql',
  'signing_functions.sql',
  'publication_functions.sql',
  'rls_grants.sql',
  'receipt_functions.sql',
];
const currentRaceAssertions = [
  'allergy-head-cas',
  'signature-independence',
  'current-authority-revoke-first-action-first',
  'initial-published-root',
  'published-successor-lineage',
  'release-allocation-version',
  'effective-time-after-wait',
  'idempotency-replay',
  'receipt-fault-atomicity',
  'actual-facility-writer',
  'actual-continuity-writer',
  'actual-encounter-writer',
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
function currentCaptureBinding(root) {
  if (currentEvidenceRoot(root) !== prReviewEvidenceRoot) return undefined;
  return JSON.parse(fs.readFileSync(path.join(root, prReviewAuthorizationPath), 'utf8')).capture;
}
const equal = (a, b) => canonical(a) === canonical(b);
const exactSet = (a, b) =>
  Array.isArray(a) &&
  a.length === b.length &&
  new Set(a).size === a.length &&
  equal([...a].sort(), [...b].sort());

function resolve(document, reference) {
  if (typeof reference !== 'string' || !reference.startsWith('#/'))
    throw new Error(`Unsupported non-local reference: ${reference}`);
  const parts = reference
    .slice(2)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  const value = parts.reduce((current, part) => current?.[part], document);
  if (!value || typeof value !== 'object')
    throw new Error(`Unresolved local reference: ${reference}`);
  return value;
}

function validateDocument(document) {
  const failures = [];
  const visit = (value, location) => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) resolve(document, value.$ref);
    if ((value.type === 'object' || value.properties) && value.additionalProperties !== false)
      failures.push(`Object shape must be closed: ${location}`);
    for (const [key, child] of Object.entries(value)) visit(child, `${location}/${key}`);
  };
  visit(document, '#');
  const actual = [];
  let idempotency = 0;
  let versions = 0;
  for (const [apiPath, item] of Object.entries(document.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
      const operation = item[method];
      if (!operation) continue;
      actual.push([operation.operationId, method, apiPath]);
      const params = [...(item.parameters ?? []), ...(operation.parameters ?? [])].map((p) =>
        p.$ref ? resolve(document, p.$ref) : p,
      );
      const required = (name) =>
        params.some((p) => p.in === 'header' && p.name === name && p.required);
      if (required('Idempotency-Key')) idempotency++;
      if (required('If-Match')) versions++;
      if (required('Idempotency-Key') !== (method === 'post'))
        failures.push(`Idempotency-Key binding drift: ${operation.operationId}`);
      if (
        required('If-Match') !==
        ['verifyAllergy', 'signClinicalContentRelease', 'publishClinicalContentRelease'].includes(
          operation.operationId,
        )
      )
        failures.push(`If-Match binding drift: ${operation.operationId}`);
      for (const response of Object.values(operation.responses ?? {})) {
        const resolved = response.$ref ? resolve(document, response.$ref) : response;
        if (resolved.headers?.['Cache-Control']?.schema?.const !== 'private, no-store')
          failures.push(`Sensitive response cache binding drift: ${operation.operationId}`);
      }
    }
  }
  if (document.openapi !== '3.1.1' || !equal(actual, bindings))
    failures.push('Seven approved method/path mappings drifted');
  if (idempotency !== 5 || versions !== 3)
    failures.push('Five idempotency/three If-Match bindings required');
  return failures;
}

function catalogFailures(read) {
  const catalog = read('docs/architecture/SHIFAA-API-Catalog.md');
  const reconciliation = read('docs/governance/SHIFAA-Feature-011-Reconciliation-2026-10-01.md');
  const row = (name) => catalog.split('\n').find((line) => line.startsWith(`| \`${name}\``)) ?? '';
  const failures = [];
  if (
    !row('verifyAllergy').includes('terminal entered_in_error') ||
    !reconciliation.includes('new linked `self_reported` record')
  )
    failures.push('verifyAllergy correction reconciliation missing');
  if (
    !row('listClinicalContent').includes('metadata and minimum signature-status evidence only') ||
    !reconciliation.includes('same GET serves authority-selected projections')
  )
    failures.push('listClinicalContent projection reconciliation missing');
  return failures;
}

// C03 supplies catalog snapshots and execution records. This reader never starts a DB,
// executes SQL, or treats a preparation pass as an owner/stage gate disposition.
function validatePhysicalCatalog(expected, model, require, current = false) {
  const modelTables = [
    ...new Set([...model.matchAll(/\| (clinical\.[a-z_]+)\s+\|/g)].map((match) => match[1])),
  ];
  require(modelTables.length === 8, 'approved data-model table inventory unavailable');
  require(typeof expected.signatureSidecar === 'string' &&
    expected.signatureSidecar.startsWith(
      'clinical.',
    ), 'restricted signature-binding sidecar missing');
  const tableNames = current
    ? [
        ...new Set([
          ...modelTables,
          ...[...model.matchAll(/^### (clinical\.[a-z_]+)$/gm)].map((m) => m[1]),
          'clinical.mutation_commit_obligations',
          'audit.signature_evidence',
        ]),
      ]
    : [...modelTables, 'audit.signature_evidence', expected.signatureSidecar];
  if (current)
    require(expected.signatureSidecar ===
      'clinical.content_signature_bindings', 'current typed signature sidecar required');
  require(exactSet(
    expected.tables?.map((t) => t.name),
    tableNames,
  ), 'catalog table inventory differs from approved owned/support areas');
  for (const table of expected.tables ?? []) {
    require(table.rlsEnabled === true &&
      table.rlsForced === true, `${table.name} requires ENABLE/FORCE RLS`);
    require(Array.isArray(table.columns) &&
      table.columns.length > 0 &&
      table.columns.every(
        (c) =>
          typeof c.name === 'string' &&
          typeof c.type === 'string' &&
          typeof c.nullable === 'boolean',
      ), `${table.name} column/type/nullability shape incomplete`);
    require(Array.isArray(table.constraints) &&
      table.constraints.length > 0 &&
      table.constraints.every(
        (c) => typeof c.name === 'string' && typeof c.definition === 'string',
      ), `${table.name} constraints incomplete`);
    require(Array.isArray(table.policies) &&
      table.policies.length > 0 &&
      table.policies.every(
        (p) =>
          typeof p.name === 'string' &&
          typeof p.command === 'string' &&
          Array.isArray(p.roles) &&
          'using' in p &&
          'withCheck' in p,
      ), `${table.name} policy expressions incomplete`);
    require(Array.isArray(table.grants), `${table.name} grants missing`);
    const preservedAdminRead =
      current &&
      table.name === 'audit.signature_evidence' &&
      table.policies.some(
        (p) =>
          p.name === 'audit_signature_super_admin_select_v1' &&
          p.command === 'r' &&
          exactSet(p.roles, ['shifaa_api']) &&
          p.using === "audit.current_super_admin_context_v1('security.audit.review'::text)",
      );
    require(!(table.grants ?? []).some(
      (g) =>
        ['PUBLIC', 'anon', 'authenticated', 'service_role', 'shifaa_api', 'shifaa_worker'].includes(
          g.grantee,
        ) && !(preservedAdminRead && g.grantee === 'shifaa_api' && g.privilege === 'SELECT'),
    ), `${table.name} exposes domain table grants beyond the preserved baseline audit reader`);
  }
  require(exactSet(
    expected.functions?.map((f) => f.operationId),
    bindings.map(([id]) => id),
  ), 'seven SQL operation/function bindings missing');
  require(new Set(expected.functions?.map((f) => f.identity)).size ===
    7, 'distinct SQL function identities required');
  for (const fn of expected.functions ?? []) {
    const binding = bindings.find(([id]) => id === fn.operationId);
    require(binding &&
      fn.method === binding[1] &&
      fn.path === binding[2], `${fn.operationId} physical method/path binding drift`);
    require(typeof fn.identity === 'string' &&
      /^clinical\.[a-z0-9_]+\(/.test(fn.identity) &&
      typeof fn.arguments === 'string' &&
      typeof fn.result === 'string' &&
      typeof fn.definitionSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(fn.definitionSha256) &&
      fn.owner === 'shifaa_f011_executor' &&
      fn.securityDefiner === true &&
      fn.searchPath === '', `${fn.operationId} narrow function shape/owner/search_path missing`);
    require(Array.isArray(fn.grants) &&
      fn.grants.some((g) => g.grantee === 'shifaa_api' && g.privilege === 'EXECUTE') &&
      fn.grants.every(
        (g) =>
          ['shifaa_api', 'shifaa_f011_executor'].includes(g.grantee) && g.privilege === 'EXECUTE',
      ), `${fn.operationId} EXECUTE grants not narrow`);
  }
  for (const name of ['shifaa_api', 'shifaa_f011_executor']) {
    const role = expected.roles?.find((r) => r.name === name);
    require(role?.superuser === false &&
      role?.bypassRls === false &&
      role?.ownsDomainTables === false, `${name} must be non-owner/NOSUPERUSER/NOBYPASSRLS`);
    if (name === 'shifaa_f011_executor') require(role?.login === false, 'executor must be NOLOGIN');
  }
}

function validateRuntimeEvidence(
  runtime,
  expected,
  expectedDigests,
  artifact,
  require,
  assertionIds = physicalAssertions,
) {
  const observed = JSON.parse(artifact(runtime.catalog));
  require(equal(
    observed,
    expected,
  ), `${runtime.id} complete schema/RLS/grants/functions differ from expected catalog`);
  require(runtime.postgresMajor === 17 &&
    runtime.isolated === true &&
    typeof runtime.database === 'string' &&
    runtime.database.length > 0 &&
    runtime.kind === 'real', `${runtime.id} isolated real PostgreSQL 17 identity missing`);
  if (runtime.id === 'shifaa-local-supabase')
    require(runtime.supabaseCliVersion ===
      '2.113.0', 'project-local Supabase CLI version proof missing');
  require(exactSet(runtime.executionRoles, [
    'shifaa_api',
    'shifaa_f011_executor',
  ]), `${runtime.id} online/non-owner execution proof missing`);
  const execution = JSON.parse(artifact(runtime.execution));
  require(execution.runtimeId === runtime.id &&
    execution.database === runtime.database &&
    equal(
      execution.sourceDigests,
      expectedDigests,
    ), `${runtime.id} execution/source/database bindings stale`);
  require(exactSet(
    execution.assertions?.map((a) => a.id),
    assertionIds,
  ), `${runtime.id} required physical assertion coverage incomplete`);
  require(exactSet(
    [...new Set(execution.assertions?.map((a) => a.currentUser))],
    ['shifaa_api', 'shifaa_f011_executor'],
  ), `${runtime.id} measured online/executor identities incomplete`);
  for (const assertion of execution.assertions ?? []) {
    require(assertion.exitCode === 0 &&
      assertion.passed > 0 &&
      assertion.failed === 0 &&
      assertion.skipped === 0 &&
      Array.isArray(assertion.command) &&
      assertion.command.length > 0 &&
      ['shifaa_api', 'shifaa_f011_executor'].includes(
        assertion.currentUser,
      ), `${runtime.id}/${assertion.id} failed/skipped/owner-only or command evidence missing`);
    const log = artifact(assertion.log);
    require(log.length > 0, `${runtime.id}/${assertion.id} empty evidence log`);
  }
}

function verifyPhysical(root, read, inputDigests, current = false) {
  const failures = [];
  const require = (condition, message) => {
    if (!condition) failures.push(`Physical parity: ${message}`);
  };
  const proofPath = current
    ? `${currentEvidenceRoot(root)}/physical-green.json`
    : `${feature}/evidence/implementation/physical-parity.json`;
  const proof = JSON.parse(read(proofPath));
  require(proof.formatVersion === 1 &&
    proof.syntheticOnly === true, 'versioned synthetic evidence required');
  require(evidenceHeadBelongsToCurrentHistory(
    root,
    proof.head,
    current ? currentCaptureBinding(root) : undefined,
  ), 'HEAD provenance missing or foreign');
  if (current) {
    require(proof.stage === 'P4' &&
      proof.result === 'PASS' &&
      proof.ledgerId === 'SHIFAA-F011-FRESH-TASKS@1.0.0', 'current P4 identity/result required');
    require(proof.planManifestSha256 ===
      readFeature011ProtocolMetadata(root)
        .planManifestSha256, 'current Plan manifest binding stale');
    require(Object.entries(inputDigests).every(
      ([file, digest]) => proof.sourceDigests?.[file] === digest,
    ), 'current P4 source/generated hashes stale or incomplete');
    if (failures.length) return failures;
  }
  const migrations = fs
    .readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => `supabase/migrations/${name}`);
  require(exactSet(
    migrations.filter((file) => /_f011_/.test(file)).map((file) => file.split('_f011_')[1]),
    current
      ? currentMigrationSuffixes
      : [
          'foundation.sql',
          'allergy_entrypoints.sql',
          'allergy_verification.sql',
          'content_entrypoints.sql',
          'content_signatures.sql',
          'content_publication.sql',
          'content_status_projection.sql',
        ],
  ), current
    ? 'complete current ten-migration chain missing'
    : 'complete historical seven-migration chain missing');
  const sourceFiles = [
    ...new Set([...contractInputs, ...Object.keys(inputDigests)]),
    'tools/verify-feature-011-contracts.mjs',
    ...(current
      ? [
          'infra/db/migrations/001_identity_onboarding.sql',
          'supabase/config.toml',
          'compose.yml',
          ...physicalInputs.filter((f) => f !== 'infra/db/policies/feature-011.sql'),
          'infra/db/tests/feature-011-receipts.sql',
          'infra/db/tests/feature-011-concurrency.sql',
        ]
      : physicalInputs),
    ...migrations,
  ];
  const expectedDigests = current
    ? currentPhysicalSourceDigests(root, { includeRaces: false })
    : Object.fromEntries(sourceFiles.map((file) => [file, sha256(read(file))]));
  require(equal(
    proof.sourceDigests,
    expectedDigests,
  ), 'source/fixture/full migration chain digests stale or incomplete');
  Object.assign(inputDigests, expectedDigests);

  const artifact = (descriptor) => {
    if (
      !descriptor ||
      typeof descriptor.path !== 'string' ||
      !/^[a-f0-9]{64}$/.test(descriptor.sha256 ?? '')
    )
      throw new Error('Physical parity: missing digest-bound evidence artifact');
    const absolute = path.resolve(root, descriptor.path);
    const evidenceRoot = path.resolve(
      root,
      feature,
      current ? 'evidence/fresh-implementation' : 'evidence/implementation',
    );
    if (!absolute.startsWith(`${evidenceRoot}${path.sep}`))
      throw new Error(
        'Physical parity: evidence artifact escapes implementation evidence directory',
      );
    const bytes = fs.readFileSync(absolute);
    require(sha256(bytes) === descriptor.sha256, `stale artifact ${descriptor.path}`);
    return bytes.toString('utf8');
  };
  const expected = JSON.parse(artifact(proof.expectedCatalog));
  const model = read(`${feature}/data-model.md`);
  validatePhysicalCatalog(expected, model, require, current);
  if (current) {
    const profile = JSON.parse(read(`${feature}/contracts/verified-evidence-binding-v1.json`));
    for (const [table, columns] of Object.entries(profile.physical)) {
      const observed = expected.tables?.find((t) => t.name === `clinical.${table}`);
      require(columns.every((c) =>
        observed?.columns?.some((actual) => equal(actual, c)),
      ), `current typed columns/nullability missing for ${table}`);
    }
    const racesPath = `${currentEvidenceRoot(root)}/physical-races.json`;
    const races = JSON.parse(read(racesPath));
    const raceDigests = currentPhysicalSourceDigests(root);
    require(races.stage === 'P4' &&
      races.result === 'PASS' &&
      races.syntheticOnly === true &&
      equal(races.sourceDigests, raceDigests), 'P4 current race result/source binding stale');
    Object.assign(inputDigests, raceDigests);
    require(races.head === proof.head &&
      races.ledgerId === 'SHIFAA-F011-FRESH-TASKS@1.0.0', 'P4 race HEAD/ledger binding stale');
    require(exactSet(
      races.runtimes?.map((r) => r.id),
      ['shifaa-local-postgres', 'shifaa-local-supabase'],
    ), 'both current race runtime bundles required');
    for (const runtime of races.runtimes ?? []) {
      validateRuntimeEvidence(
        runtime,
        expected,
        raceDigests,
        artifact,
        require,
        currentRaceAssertions,
      );
      const execution = JSON.parse(artifact(runtime.execution));
      require(Array.isArray(execution.independentSessions) &&
        execution.independentSessions.length >= 2 &&
        new Set(execution.independentSessions.map((s) => s.backendPid)).size ===
          execution.independentSessions.length &&
        execution.independentSessions.every(
          (s) =>
            Number.isInteger(s.backendPid) &&
            s.backendPid > 0 &&
            ['shifaa_api', 'shifaa_f011_executor'].includes(s.currentUser),
        ), `${runtime.id} independent non-owner race sessions missing`);
      require(Array.isArray(execution.barriers) &&
        execution.barriers.length > 0, `${runtime.id} race barriers missing`);
      for (const barrier of execution.barriers ?? [])
        require(artifact(barrier).length > 0, `${runtime.id} empty barrier trace`);
      require(artifact(execution.pgLocks).length > 0, `${runtime.id} observed pg_locks missing`);
    }
  }
  require(exactSet(
    proof.runtimes?.map((r) => r.id),
    ['shifaa-local-postgres', 'shifaa-local-supabase'],
  ), 'both named real runtime bundles required');
  for (const runtime of proof.runtimes ?? [])
    validateRuntimeEvidence(
      runtime,
      expected,
      expectedDigests,
      artifact,
      require,
      current ? currentPhysicalAssertions : physicalAssertions,
    );

  return failures;
}

// Evidence acceptance and owner disposition are separate from a tool PASS. These
// readers only verify records; they neither create acceptance nor close the gate.
function validateOwnerAcceptance(owner, root, read, require) {
  const descriptor = owner.record;
  const stage = `P5 ${owner.role}`;
  const decisions = path.resolve(root, feature, 'decisions');
  const target = path.resolve(root, descriptor?.path ?? '');
  require(target.startsWith(`${decisions}${path.sep}`) &&
    /^[a-f0-9]{64}$/.test(
      descriptor?.sha256 ?? '',
    ), `${stage} missing digest-bound Product Owner acceptance`);
  if (
    !target.startsWith(`${decisions}${path.sep}`) ||
    !/^[a-f0-9]{64}$/.test(descriptor?.sha256 ?? '')
  )
    return;
  const bytes = read(descriptor.path);
  require(sha256(bytes) === descriptor.sha256, `${stage} stale acceptance record`);
  require(bytes.includes('Disposition: **ACCEPTED**.') &&
    bytes.includes('K07') &&
    bytes.includes('SHIFAA-F011-FRESH-TASKS@1.0.0') &&
    bytes.includes(
      sha256(read(`${currentEvidenceRoot(root)}/physical-green.json`)),
    ), `${stage} unaccepted current physical proof`);
  require(bytes.includes(
    sha256(read(`${currentEvidenceRoot(root)}/physical-races.json`)),
  ), `${stage} unaccepted current race proof`);
  require(bytes.includes(
    sha256(read(`${feature}/evidence/fresh-implementation/K02/protocol-proof.json`)),
  ), `${stage} unaccepted current P1–P3 proof`);
  require(bytes.includes(`Approver: **${owner.name} — ${owner.role}**.`) &&
    bytes.includes('P5'), `${owner.role}: role/stage record mismatch`);
}

function verifyStageDisposition(root, read, inputDigests) {
  const failures = [];
  const require = (condition, message) => {
    if (!condition) failures.push(`P5 stage disposition: ${message}`);
  };
  const file = `${currentEvidenceRoot(root)}/stage-assertion.json`;
  if (!fs.existsSync(path.join(root, file))) return [`P5 stage disposition: missing ${file}`];
  try {
    const proof = JSON.parse(read(file));
    require(proof.formatVersion === 1 &&
      proof.stage === 'P5' &&
      proof.ledgerId === 'SHIFAA-F011-FRESH-TASKS@1.0.0', 'current stage/ledger identity required');
    require(proof.result === 'PASS' &&
      proof.disposition === 'ACCEPTED_FOR_AFFECTED_CONSUMERS', 'failed/unaccepted disposition');
    require(proof.openTech002 === 'OPEN' &&
      proof.globalGateClosure === false, 'retained gate/global closure drift');
    require(exactSet(proof.requiredStages, [
      'P1',
      'P2',
      'P3',
      'P4',
    ]), 'requires accepted P1–P4 only; P6 cannot unlock itself');
    require(equal(
      proof.sourceDigests,
      inputDigests,
    ), 'current source/generated/physical hashes stale or incomplete');
    require(evidenceHeadBelongsToCurrentHistory(
      root,
      proof.head,
      currentCaptureBinding(root),
    ), 'HEAD provenance missing or foreign');
    for (const name of ['physical-green', 'physical-races']) {
      const physicalPath = `${currentEvidenceRoot(root)}/${name}.json`;
      require(proof.evidenceDigests?.[physicalPath] ===
        sha256(read(physicalPath)), `stale/missing ${name} proof binding`);
    }
    const publicProof = `${feature}/evidence/fresh-implementation/K02/protocol-proof.json`;
    require(proof.evidenceDigests?.[publicProof] ===
      sha256(read(publicProof)), 'stale/missing accepted P1–P3 proof binding');
    require(exactSet(
      proof.ownerDispositions?.map((d) => d.role),
      ['API Lead', 'Data Lead', 'QA Lead'],
    ), 'applicable API/Data/QA owner dispositions missing');
    for (const owner of proof.ownerDispositions ?? []) {
      require(typeof owner.name === 'string' &&
        owner.name.trim().length > 0 &&
        owner.disposition === 'ACCEPTED', `${owner.role}: unaccepted attributable owner`);
      validateOwnerAcceptance(owner, root, read, require);
    }
  } catch (error) {
    failures.push(`P5 stage disposition: invalid/missing evidence (${error.message})`);
  }
  return failures;
}

export async function verifyFeature011Contracts({
  root = defaultRoot,
  contractsOnly = false,
} = {}) {
  const failures = [];
  const inputDigests = {};
  let protocolMetadata;
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  try {
    const document = parse(read(`${feature}/contracts/openapi.yaml`));
    failures.push(...validateDocument(document));
    const scope = JSON.parse(read(`${feature}/contracts/scope-manifest.json`));
    if (
      !equal(
        scope.operations.map((o) => [o.id, o.method, o.path]),
        bindings,
      )
    )
      failures.push('Scope operation bindings drifted');
    failures.push(...catalogFailures(read));
    protocolMetadata = readFeature011ProtocolMetadata(root);
    Object.assign(inputDigests, protocolMetadata.normativeInputDigests);
    for (const kind of ['contract', 'client']) {
      const file = `tools/generate-feature-011-${kind}.mjs`;
      if (!fs.existsSync(path.join(root, file))) failures.push(`Missing generator: ${file}`);
      // Even fixtures must use the exact verifier-associated generator bytes.
      else if (read(file) !== fs.readFileSync(path.join(defaultRoot, file), 'utf8'))
        failures.push(`Stale generator: ${file}`);
    }
    if (!failures.length) {
      const generated = [
        ['packages/contracts/src/feature-011.ts', await renderFeature011Contract(root)],
        ['packages/api-client/src/feature-011.ts', await renderFeature011Client(root)],
      ];
      for (const [file, bytes] of generated)
        if (read(file) !== bytes) failures.push(`Generated output stale: ${file}`);
      if (
        !read('packages/contracts/src/index.ts')
          .split(/\r?\n/)
          .includes("export * from './feature-011.js';")
      )
        failures.push('Generated contracts root export stale');
      for (const [pkg, kind] of [
        ['contracts', 'contract'],
        ['api-client', 'client'],
      ]) {
        const config = JSON.parse(read(`packages/${pkg}/package.json`));
        if (
          config.exports?.['./feature-011'] !== './src/feature-011.ts' ||
          config.scripts?.['generate:feature-011'] !==
            `node ../../tools/generate-feature-011-${kind}.mjs` ||
          config.scripts?.['generate:feature-011:check'] !==
            `node ../../tools/generate-feature-011-${kind}.mjs --check`
        )
          failures.push(`${pkg} generated package export/check wiring stale`);
      }
    }
    for (const file of contractInputs) inputDigests[file] = sha256(read(file));
  } catch (error) {
    failures.push(`Contract verification: ${error.message}`);
  }
  if (!contractsOnly) {
    // Preserve legacy negative diagnostics, never transfer historical acceptance.
    if (fs.existsSync(path.join(root, feature, 'evidence/implementation/physical-parity.json'))) {
      try {
        failures.push(...verifyPhysical(root, read, { ...inputDigests }));
      } catch (error) {
        failures.push(`Historical physical candidate invalid: ${error.message}`);
      }
    }
    try {
      failures.push(...verifyPhysical(root, read, inputDigests, true));
    } catch (error) {
      failures.push(`Physical parity evidence missing/invalid: ${error.message}`);
    }
    failures.push(...verifyStageDisposition(root, read, inputDigests));
  }
  return {
    feature: '011-allergies-clinical-content-governance',
    mode: contractsOnly ? 'CONTRACT_PREPARATION_ONLY' : 'FULL_PARITY_EVIDENCE',
    result: failures.length ? 'FAIL' : 'PASS',
    failures,
    inputDigests,
    physicalParity: contractsOnly || failures.length ? 'PENDING' : 'EVIDENCE_VERIFIED',
    retainedGate: 'OPEN-TECH-002',
    affectedConsumersAllowed: !contractsOnly && failures.length === 0,
    requiredStageAssertion:
      'K07/T029 (P5); accepted current P1–P4 and separate applicable owner disposition',
    requiredStages: contractsOnly ? ['P1', 'P2', 'P3'] : ['P1', 'P2', 'P3', 'P4', 'P5'],
    supersededRegistries: protocolMetadata?.supersededRegistries ?? [],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--contracts-only');
  if (unknown.length) {
    console.error(`Unsupported verifier arguments: ${unknown.join(', ')}`);
    process.exitCode = 1;
  } else {
    const report = await verifyFeature011Contracts({
      contractsOnly: process.argv.includes('--contracts-only'),
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.failures.length ? 1 : 0;
  }
}
