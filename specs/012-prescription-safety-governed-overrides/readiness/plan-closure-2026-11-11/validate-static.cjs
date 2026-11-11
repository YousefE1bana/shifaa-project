const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const cp = require('node:child_process');
const worktree = path.resolve(__dirname, '../../../..');
const common = path.resolve(
  worktree,
  cp
    .execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: worktree, encoding: 'utf8' })
    .trim(),
);
const root = fs.existsSync(path.join(worktree, 'node_modules/.pnpm'))
  ? worktree
  : path.dirname(common);
const YAML = require(root + '/node_modules/.pnpm/yaml@2.8.3/node_modules/yaml');
const Ajv = require(root + '/node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/2020').default;
const formats = require(
  root + '/node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats',
);
const target = path.join(
  worktree,
  'specs/012-prescription-safety-governed-overrides/contracts/openapi.yaml',
);
const doc = YAML.parse(fs.readFileSync(target, 'utf8'));
assert.equal(doc.openapi, '3.1.1');
const ops = [];
for (const [p, item] of Object.entries(doc.paths))
  for (const [method, op] of Object.entries(item))
    if (['get', 'post', 'patch', 'put', 'delete'].includes(method)) ops.push({ p, method, ...op });
const expected = [
  'createPrescription',
  'updatePrescription',
  'getPrescription',
  'runPrescriptionSafety',
  'acknowledgeWarning',
  'requestContraindicatedOverride',
  'decideOverride',
  'signPrescription',
  'cancelPrescription',
  'listPatientMedications',
  'getOverrideReviewCases',
  'transitionOverrideReviewAssignment',
];
assert.deepEqual(ops.map((o) => o.operationId).sort(), expected.sort());
const scope = doc['x-shifaa-scope'];
assert.equal(scope.closureFRs.length, 7);
assert.equal(scope.prerequisiteOnlyFRs.length, 2);
assert.equal(scope.nfrs.length, 22);
assert.equal(scope.acceptanceCriteria, 16);
const acs = new Set();
for (const op of ops) {
  for (const m of JSON.stringify(op).matchAll(/AC-\d{2}/g)) acs.add(m[0]);
  assert.deepEqual(op.security || doc.security, [{ bearerAuth: [] }]);
  const params = op.parameters || [];
  for (const p of op.p.matchAll(/\{([^}]+)\}/g)) {
    const resolved = params.map((x) =>
      x.$ref ? doc.components.parameters[x.$ref.split('/').at(-1)] : x,
    );
    assert(resolved.some((x) => x.name === p[1] && x.in === 'path' && x.required));
  }
  assert(op.responses && Object.keys(op.responses).some((x) => x.startsWith('2')));
}
assert.equal(acs.size, 16);
let refs = 0;
function resolve(ref, file = target) {
  const [rel, pointer = ''] = ref.split('#');
  const filename = rel ? path.resolve(path.dirname(file), rel) : file;
  assert(!/^https?:/.test(filename), 'Remote schema reference needs explicit resolution');
  const d = filename === target ? doc : YAML.parse(fs.readFileSync(filename, 'utf8'));
  let current = d;
  for (const segment of pointer.split('/').slice(1))
    current = current[segment.replace(/~1/g, '/').replace(/~0/g, '~')];
  assert.notEqual(current, undefined, ref);
  return current;
}
function walk(x) {
  if (x && typeof x === 'object') {
    if (x.$ref) {
      resolve(x.$ref);
      refs++;
    }
    Object.values(x).forEach(walk);
  }
}
walk(doc);
const ajv = new Ajv({ strict: false, allErrors: true });
formats(ajv);
ajv.addSchema(
  JSON.parse(
    fs.readFileSync(
      path.resolve(path.dirname(target), '../readiness/engineering-fixtures.schema.json'),
      'utf8',
    ),
  ),
  '../readiness/engineering-fixtures.schema.json',
);
for (const [name, schema] of Object.entries(doc.components.schemas))
  ajv.addSchema(schema, '#/components/schemas/' + name);
for (const name of Object.keys(doc.components.schemas))
  assert(ajv.getSchema('#/components/schemas/' + name));

const checks = [];
function check(name, ok) {
  assert(ok, name);
  checks.push({ name, status: 'PASS_SCHEMA_OR_STATIC_ONLY' });
}
const validate = (n, v) => ajv.getSchema('#/components/schemas/' + n)(v);
const id = '00000000-0000-4000-8000-000000000001',
  digest = 'a'.repeat(64);
const discover = { view: 'discover', lane: 'pharmacist', scope: 'eligible' };
const detail = {
  view: 'detail',
  overrideId: id,
  lane: 'pharmacist',
  requestVersion: 1,
  assignmentVersion: 1,
  evidenceRevision: digest,
};
check(
  'R1 exactly discover or detail valid',
  validate('ReviewQuery', discover) && validate('ReviewQuery', detail),
);
for (const [name, v] of [
  ['mixed', { ...discover, overrideId: id }],
  ['extra actor', { ...detail, actor: id }],
  ['unknown view', { ...discover, view: 'browse' }],
])
  check('R1 denies ' + name, !validate('ReviewQuery', v));
const assignment = {
  action: 'claim',
  lane: 'pharmacist',
  requestVersion: 1,
  assignmentVersion: 1,
  rosterRevision: 1,
  evidenceRevision: digest,
};
for (const action of ['claim', 'release_own', 'takeover_invalid'])
  check('R2 accepts closed ' + action, validate('AssignmentRequest', { ...assignment, action }));
for (const [name, v] of [
  ['renew', { ...assignment, action: 'renew' }],
  ['assign other', { ...assignment, assignee: id }],
  [
    'missing evidence',
    Object.fromEntries(Object.entries(assignment).filter(([k]) => k !== 'evidenceRevision')),
  ],
])
  check('R2 denies ' + name, !validate('AssignmentRequest', v));
const intent = {
  policyVersion: 'F012-VP-2/0.1.0',
  audience: 'subject',
  projections: ['P', 'M'],
  confirmation: true,
};
for (const projections of [['P'], ['M'], ['P', 'M']])
  check(
    'VP2 unique selection ' + projections.join('+'),
    validate('PatientProjectionReleaseIntent', { ...intent, projections }),
  );
for (const [name, v] of [
  ['no selection', { ...intent, projections: [] }],
  ['duplicate', { ...intent, projections: ['P', 'P'] }],
  ['guardian audience', { ...intent, audience: 'guardian' }],
  ['implicit confirmation', { ...intent, confirmation: false }],
  ['unknown field', { ...intent, releaseAll: true }],
  ['wrong policy', { ...intent, policyVersion: 'F012-VP-1' }],
])
  check('VP2 denies ' + name, !validate('PatientProjectionReleaseIntent', v));
const sign = {
  evidenceRevision: digest,
  signatureConfirmation: true,
  simulationConfirmation: true,
};
check('Sign absence of release intent is valid but no release', validate('SignRequest', sign));
check(
  'Sign explicit release intent shape valid',
  validate('SignRequest', { ...sign, patientProjectionReleaseIntent: intent }),
);
check('Sign rejects release implicit flag', !validate('SignRequest', { ...sign, release: true }));
const source = {
  sourceId: 'prescription',
  sourceState: 'present',
  freshness: 'unknown',
  completeness: 'complete_within_declared_scope',
  knownScope: 'released_prescription',
  capturedAt: '2026-11-11T12:00:00Z',
  overallAssessment: 'not_fully_checked',
};
check('Minimized source with unknown freshness valid', validate('PatientSource', source));
for (const [name, v] of [
  ['private path category', { ...source, sourceId: '.tmp/private' }],
  ['signer identity', { ...source, signerPersonRef: id }],
  ['hidden count', { ...source, count: 1 }],
  ['clinical completeness', { ...source, overallAssessment: 'safe' }],
])
  check('Patient source denies ' + name, !validate('PatientSource', v));
// Shape sentinel, not a medical input or approved executable fixture: no medicine/dose/classification is tested.
const coded = {
  system: 'urn:shifaa:contract-shape-only',
  code: 'OPAQUE-SHAPE-SENTINEL',
  version: 'shape-only',
};
const item = { itemRef: id, productCoding: coded };
check('Absent optional clinical facts do not require fabricated values', validate('ItemP', item));
const prescription = { prescriptionRef: id, status: 'signed', version: 1, items: [item], source };
for (const status of ['signed', 'cancelled', 'superseded', 'expired'])
  check(
    'P retained-status schema ' + status,
    validate('PrescriptionP', { ...prescription, status }),
  );
for (const [name, v] of [
  ['unsigned', { ...prescription, status: 'draft' }],
  ['cancellation reason', { ...prescription, cancellationReason: 'private' }],
  ['lineage', { ...prescription, successorRef: id }],
  ['issues', { ...prescription, issues: [] }],
  ['private nested item', { ...prescription, items: [{ ...item, monitoringPlan: 'private' }] }],
])
  check('P denies ' + name, !validate('PrescriptionP', v));
const med = {
  statementRef: id,
  productCoding: coded,
  status: 'prescribed',
  source: {
    ...source,
    sourceId: 'prescribed_statement',
    knownScope: 'released_prescribed_statements',
  },
};
check('M current prescribed candidate shape valid', validate('Medication', med));
for (const status of [
  'dispensed',
  'active',
  'completed',
  'discontinued',
  'expired',
  'entered_in_error',
])
  check(
    'M denies non-admitted producer status ' + status,
    !validate('Medication', { ...med, status }),
  );
check(
  'P2 exact predecessor and version shape valid',
  validate('ReplacementIntent', { predecessorPrescriptionRef: id, expectedPredecessorVersion: 1 }),
);
check(
  'P2 rejects missing version',
  !validate('ReplacementIntent', { predecessorPrescriptionRef: id }),
);
check(
  'P2 rejects client authority',
  !validate('ReplacementIntent', {
    predecessorPrescriptionRef: id,
    expectedPredecessorVersion: 1,
    correctionGranted: true,
  }),
);
const mut = ops.filter((o) => o.method !== 'get');
check(
  'Nine I mutations',
  mut.length === 9 &&
    mut.every((o) =>
      (o.parameters || []).some((x) => x.$ref === '#/components/parameters/IdempotencyKey'),
    ),
);
check(
  'Six approved IfMatch carriers',
  ops.filter((o) => (o.parameters || []).some((x) => x.$ref === '#/components/parameters/IfMatch'))
    .length === 6,
);
for (const o of ops) {
  const names = (o.parameters || [])
    .map((x) => (x.$ref ? resolve(x.$ref) : x))
    .map((p) => p.in + ':' + p.name);
  check(o.operationId + ' no duplicate parameters', new Set(names).size === names.length);
  check(
    o.operationId + ' closed required security',
    JSON.stringify(o.security || doc.security) === '[{"bearerAuth":[]}]',
  );
  for (const [status, res] of Object.entries(o.responses)) {
    const r = res.$ref ? resolve(res.$ref) : res;
    check(
      o.operationId + ' response ' + status + ' described',
      typeof r.description === 'string' && !!r.description,
    );
  }
}
const schemes = doc.components.securitySchemes;
check(
  'Bearer HTTP JWT scheme',
  schemes.bearerAuth.type === 'http' && schemes.bearerAuth.scheme === 'bearer',
);
const disallowed = [
  'patientRef',
  'syntheticPatientRef',
  'items',
  'medicine',
  'issue',
  'rationale',
  'requesterPersonRef',
];
check(
  'R1 discovery field ceiling',
  disallowed.every((k) => !Object.hasOwn(doc.components.schemas.DiscoverCase.properties, k)),
);
const result = {
  kind: 'F012_PLAN_CLOSURE_STATIC_EVIDENCE',
  status: 'PASS_STATIC_ONLY',
  openapi: doc.openapi,
  operations: ops.map((o) => ({
    method: o.method,
    path: o.p,
    id: o.operationId,
    request: o.requestBody?.content?.['application/json']?.schema || null,
    responses: Object.fromEntries(
      Object.entries(o.responses).map(([code, r]) => [
        code,
        r.$ref || r.content?.['application/json']?.schema || null,
      ]),
    ),
  })),
  scope: { closure: 7, prerequisites: 2, nfr: 22, ac: acs.size },
  schemas: Object.keys(doc.components.schemas).length,
  resolvedReferences: refs,
  checks,
  completeOpenAPIValidation: 'VALIDATION_NOT_AVAILABLE',
  validatorAvailabilityEvidence:
    'No installed swagger-parser, Redocly CLI, OpenAPI-spec-validator or equivalent complete 3.1 validator identified in existing lockfile/package inventory; no tool installed. Ajv validates component JSON Schemas, not full OpenAPI semantics.',
  manualSemanticReview: {
    security: 'Bearer and contextual server authorization; no anonymous operation',
    unions:
      'R1 semantic closed query union plus closed R2 action enum; no extra selectors/actor/assignee',
    responses:
      'Success and RFC9457 error families; headers/path parameters/read/write contracts reviewed',
    disclosure:
      'D3 P/M/C/R ceiling and issue-necessary R1; new optional fields are candidates only',
    limits:
      'Cross-parameter query union enforcement requires future generated/server middleware; no runtime proof. Source/authorization relationships are not established by schema compilation.',
  },
  runtime: 'F012_NOT_IMPLEMENTED_NOT_RUN',
  shapeExamples: 'Nonclinical opaque shape sentinels only; not executable scenario vectors',
};
const index = process.argv.indexOf('--output');
if (index >= 0) {
  assert(process.argv[index + 1], '--output requires a new explicit path');
  const output = path.resolve(process.argv[index + 1]);
  assert(!fs.existsSync(output), 'Never overwrite evidence');
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
}
console.log(
  JSON.stringify({
    status: result.status,
    checks: checks.length,
    operations: ops.length,
    schemas: result.schemas,
    resolvedReferences: refs,
    completeOpenAPIValidation: result.completeOpenAPIValidation,
  }),
);
