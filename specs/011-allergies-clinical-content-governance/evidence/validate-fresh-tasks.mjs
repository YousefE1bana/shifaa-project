// Tasks-stage static validation only. No generators, tests, services, SQL or lifecycle execution.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const feature = 'specs/011-allergies-clinical-content-governance';
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const hash = (p) => createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const text = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
function check(name, condition, details) {
  checks.push({ name, status: condition ? 'PASS' : 'FAIL', details });
}
const input = read(`${feature}/evidence/fresh-tasks-inputs-v1.json`);
const map = read(`${feature}/contracts/task-map.json`);
const approval = read(input.planApproval.path);
const md = text(`${feature}/tasks.md`);
const taskById = new Map(map.tasks.map((t) => [t.id, t]));
const checkpointById = new Map(map.checkpoints.map((c) => [c.id, c]));
const taskByKey = new Map(map.tasks.map((t) => [t.key, t]));
const normative = input.normativeApprovalInputs;
check('approved_manifest', hash(input.planApproval.path) === input.planApproval.sha256 &&
  input.planApproval.sha256 === '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548' &&
  map.planManifestId === `${approval.manifestId}@${approval.version}`, input.planApproval);
check('normative_hashes', normative.length === 42 && normative.every((x) => hash(x.path) === x.sha256), { count: normative.length });
check('ledger_output_hashes', input.outputs.every((x) => hash(x.path) === x.sha256), input.outputs);
const blocks = [...md.matchAll(/^- \[ \] (T\d{3})[^\n]*\n  - Depends on: ([^\n]+)\n  - Acceptance evidence: ([^\n]+)/gm)];
check('unchecked_three_line_template', blocks.length === map.tasks.length && !/^- \[[xX]\]/m.test(md) &&
  blocks.every((x, i) => x[1] === map.tasks[i].id), { blocks: blocks.length, tasks: map.tasks.length });
check('fresh_identity', map.ledgerId === 'SHIFAA-F011-FRESH-TASKS@1.0.0' && map.status === 'DRAFT_REVIEW_REQUIRED' &&
  map.executionAuthorized === false && map.analyzeAuthorized === false && map.tasks.every((t, i) =>
    t.id === `T${String(i + 1).padStart(3, '0')}` && t.status === 'UNCHECKED'), 'No historical completion transfer; no execution/Analyze authority');
check('task_dependencies', map.tasks.every((t) => t.dependsOn.every((d) => taskById.has(d) && d < t.id)), 'Every edge names an earlier fresh task');
function acyclic(nodes, id, edges) {
  const visiting = new Set(); const done = new Set();
  function visit(key) {
    if (visiting.has(key)) return false;
    if (done.has(key)) return true;
    const node = nodes.find((n) => n[id] === key);
    if (!node) return false;
    visiting.add(key);
    if (!node[edges].every(visit)) return false;
    visiting.delete(key); done.add(key); return true;
  }
  return nodes.every((n) => visit(n[id]));
}
check('checkpoint_DAG', acyclic(map.checkpoints, 'id', 'dependsOn'), { count: map.checkpoints.length });
check('checkpoint_ownership', map.checkpoints.flatMap((c) => c.tasks).length === map.tasks.length &&
  new Set(map.checkpoints.flatMap((c) => c.tasks)).size === map.tasks.length &&
  map.checkpoints.every((c) => c.tasks.every((id) => taskById.get(id)?.checkpoint === c.id)), 'Each task belongs to one checkpoint');
function reachableTask(start, required, seen = new Set()) {
  if (start === required) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  return taskById.get(start)?.dependsOn.some((d) => reachableTask(d, required, seen)) ?? false;
}
function existingAncestor(p) {
  if (path.isAbsolute(p) || p.includes('<') || p.includes('..')) return false;
  let candidate = path.join(root, p);
  while (!fs.existsSync(candidate) && candidate !== root) candidate = path.dirname(candidate);
  return candidate !== root && candidate.startsWith(root + path.sep);
}
check('concrete_path_and_handoff', map.tasks.every((t) => t.paths.length > 0 && t.paths.every(existingAncestor) &&
  t.evidencePath.startsWith(`${feature}/evidence/fresh-implementation/`) && t.acceptance && t.completionRule &&
  t.acceptanceOwner && t.proof && t.gateEffects.length && t.normativeRules.every((r) => hash(r.path) === r.sha256)), 'Concrete targets; CLI owns only future migration timestamp, never placeholder schema');
check('migration_generation_ownership', map.tasks.filter((t) => t.generatedOutput).every((t) =>
  t.paths.includes('supabase/migrations') && /^pnpm exec supabase migration new f011_/.test(t.generatedOutput.command)) &&
  new Set(map.tasks.filter((t) => t.generatedOutput).map((t) => t.generatedOutput.slug)).size === 10,
  'Ten distinct planned additive outputs, pinned local CLI; none created');
const approvedNfr = new Set(approval.scope.nfr);
const nfr = new Set(map.requirements.filter((x) => x.startsWith('NFR-')));
const fr = new Set(map.requirements.filter((x) => x.startsWith('FR-')));
check('scope_19NFR_4FR', nfr.size === 19 && [...nfr].every((x) => approvedNfr.has(x)) &&
  fr.size === 4 && ['FR-SAFE-002', 'FR-SAFE-008', 'FR-SAFE-012', 'FR-ADMIN-004'].every((x) => fr.has(x)) &&
  map.tasks.every((t) => t.requirements.every((r) => map.requirements.includes(r))) &&
  !/\b(?:FR|NFR)-[A-Z]+-\d{3}\/\d{3}/.test(md), { nfr: nfr.size, fr: fr.size });
const prd = text('shifaa-prd.md');
check('active_PRD_targets', map.requirements.every((id) => prd.split('\n').some((l) =>
  l.startsWith(`| ${id} `) && !/RESERVED|RETIRED|DEFERRED/.test(l))), 'All targets exist in active FR/NFR tables; no reserved scope added');
check('implementation_and_verification_coverage', map.requirementCoverage.length === 23 && map.requirementCoverage.every((r) =>
  r.implementation.length > 0 && r.verification.length > 0 && r.implementation.every((id) => taskById.get(id)?.kind === 'implementation') &&
  r.verification.every((id) => taskById.get(id)?.kind === 'verification')), map.requirementCoverage.map((r) => ({ id: r.id, implementation: r.implementation.length, verification: r.verification.length })));
check('all_AC_01_16', map.acceptanceCoverage.length === 16 && map.acceptanceCoverage.every((a, i) =>
  a.id === `AC-${String(i + 1).padStart(2, '0')}` && a.tasks.length > 0 && a.tasks.every((id) => taskById.has(id))), 'Every Spec acceptance criterion mapped');
const opIds = text(`${feature}/contracts/openapi.yaml`).match(/operationId: (\w+)/g).map((s) => s.split(': ')[1]);
check('seven_public_operations', opIds.length === 7 && map.operations.length === 7 &&
  map.operations.every((o, i) => o.id === opIds[i] && o.id === approval.scope.operations[i].id &&
    o.method === approval.scope.operations[i].method && o.path === approval.scope.operations[i].path) &&
  map.tasks.every((t) => t.operations.every((o) => opIds.includes(o))), map.operations);
check('implementation_verification_pairing', map.tasks.filter((t) => t.kind === 'implementation').every((t) =>
  t.verificationTasks.length > 0 && t.verificationTasks.every((id) => taskById.get(id)?.kind === 'verification')), 'Each implementation has named executable test/evidence owner');
const scaffold = new Set(['harness', 'composition-harness', 'ops-hardening', 'doc-maintenance']);
check('test_first_behavior', map.tasks.filter((t) => t.kind === 'implementation' && !scaffold.has(t.key)).every((t) =>
  t.verificationTasks.some((id) => reachableTask(t.id, id))), 'Behavior/SQL/crypto/domain/API/UI consumers depend on RED test owner; scaffold/low-impact maintenance verified independently');
check('protocol_producer_consumer_evidence', map.contractCoverage.length === 7 && map.contractCoverage.every((c) =>
  c.producerTasks.length && c.consumerTasks.length && c.evidenceTasks.length && c.preparationTasks.length &&
  [...c.producerTasks, ...c.consumerTasks, ...c.evidenceTasks].every((id) => taskById.has(id)) &&
  c.normativeInputs.every((x) => hash(x.path) === x.sha256)), map.contractCoverage.map((c) => c.id));
check('physical_inventory', map.physicalCoverage.length === 15 && map.physicalCoverage.every((p) =>
  taskById.get(p.storageTask)?.kind === 'implementation' && taskById.get(p.redTestTask)?.kind === 'verification' &&
  reachableTask(p.storageTask, p.redTestTask) && p.physicalProofTasks.every((id) => taskById.has(id))), 'Exact typed structures plus baseline audit extension have storage/test/consumer ownership');
check('trusted_evidence_and_flow_ownership', map.flowCoverage.length === 7 && map.flowCoverage.every((f) =>
  opIds.includes(f.operation) && f.producerTasks.length && f.consumerTasks.length && f.evidenceTasks.length &&
  f.ownership && hash(f.normalizationValidationHashStorageSource) === f.normativeSourceSha256) &&
  map.evidenceFamilyCoverage.length === 8 && map.evidenceFamilyCoverage.every((f) => f.producerTasks.length && f.consumerTasks.length && f.evidenceTasks.length), 'No missing typed producer/consumer; current approved matrices define every trust/storage/hash/retry cell');
const gate = taskByKey.get('stage-assertion');
check('evidence_before_stage_assertion_before_consumers', reachableTask(gate.id, taskByKey.get('physical-green').id) &&
  reachableTask(gate.id, taskByKey.get('physical-races').id) && reachableTask(gate.id, taskByKey.get('protocol-proof').id) &&
  !reachableTask(gate.id, taskByKey.get('protection-proof').id) && !reachableTask(gate.id, taskByKey.get('evidence-proof').id) &&
  map.tasks.filter((t) => t.kind === 'implementation' && Number(t.checkpoint.slice(1)) >= 8).every((t) => reachableTask(t.id, gate.id)), 'P1–P4 exist before owned P5; P6 never prerequisite to its own producer');
check('default_off_before_all_routes_and_demo', ['allergy-routes', 'draft-api', 'sign-api', 'publish-api', 'governance-read', 'status', 'us1-demo'].every((key) =>
  reachableTask(taskByKey.get(key).id, taskByKey.get('exposure').id)), 'Exposure safety precedes every router consumer and synthetic demonstration');
check('authoritative_US4_before_UI_acceptance', reachableTask(taskByKey.get('status-ui').id, taskByKey.get('eligibility-proof').id) &&
  reachableTask(taskByKey.get('us4-demo').id, taskByKey.get('eligibility-proof').id), 'Projection/UI cannot claim full current eligibility first');
check('retained_open_gates', ['OPEN-UX-002', 'OPEN-TECH-002', 'OPEN-TECH-003', 'OPEN-CLIN-001', 'OPEN-LEGAL-001', 'OPEN-LEGAL-002', 'OPEN-LEGAL-007'].every((id) =>
  map.gates[id]?.status === 'OPEN') && map.gates['OPEN-UX-001']?.status === 'SATISFIED_FOR_F011_AFFECTED_UI_PLAN_ONLY', 'No automatic closure/waiver; stage-specific evidence and owner disposition remain separate');
check('nonfinal_UI_and_99_state_coverage', map.uiStateCoverage.families.length === 4 && map.uiStateCoverage.stateCount === 99 &&
  map.uiStateCoverage.referenceCount === 746 && map.uiStateCoverage.scope.includes('FUNCTIONAL_TEST_ONLY') &&
  hash(map.uiStateCoverage.manifestPath) === '59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432' &&
  map.uiStateCoverage.families.flatMap((f) => f.states).every((s) => s.implementationTasks.length && s.testTasks.length && s.proofTasks.length &&
    s.locales.includes('ar-EG') && s.locales.includes('en-EG')), 'All four approved engineering route/state families have implementation/test/live owners; no final pixel lock');
const refs = read(map.uiStateCoverage.manifestPath);
check('reference_inventory_integrity', refs.entryCount === 746 && refs.entries.length === 746 && refs.entries.every((e) =>
  hash(`${feature}/visual-baselines/${e.referenceArtifact}`) === e.sha256), 'All 746 immutable reference assets match current manifest');
check('parallel_claims_and_shared_i18n', !/^- \[ \] T\d+ \[P\]/m.test(md) &&
  reachableTask(taskByKey.get('admin-i18n').id, taskByKey.get('allergy-ui').id), 'No unsafe parallel marker; shared file owners explicitly sequenced; DB harness remains serial');
check('historical_archives_exact', map.historicalLedger.archives.every((a) => hash(a.archive) === a.sha256), map.historicalLedger.archives);
const crosswalk = read(`${feature}/evidence/historical-task-evidence-crosswalk-v1.json`);
check('historical_crosswalk_no_completion', crosswalk.items.length === 105 && crosswalk.completionTransferred === false &&
  crosswalk.items.every((x) => ['REUSABLE_CANDIDATE', 'PARTIALLY_REUSABLE', 'SUPERSEDED', 'NOT_APPLICABLE'].includes(x.classification) &&
    x.completionTransferred === false && x.revalidation && x.newTasks.every((id) => taskById.has(id)) && hash(x.historicalSource.path) === x.historicalSource.sha256), crosswalk.counts);
check('no_hidden_design_choice_or_excluded_task', !map.tasks.some((t) => /(?:design|choose|define) (?:a new|new) (?:protocol|schema|encryption|medical|role|route|operation)/i.test(t.description)) &&
  map.boundaryRules.feature012 === approval.scope.feature012 && map.boundaryRules.feature010.includes('patient_person_id'), 'Approved protocols/current matrices own architecture, Feature010 mapping preserved and Feature012 excluded');
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const main = execFileSync('git', ['rev-parse', 'main'], { cwd: root, encoding: 'utf8' }).trim();
check('branch_HEAD_main_preserved', branch === approval.context.branch && head === approval.context.head && main === approval.context.main, { branch, head, main });
const failures = checks.filter((c) => c.status === 'FAIL');
console.log(JSON.stringify({ validator: 'F011_FRESH_TASKS_STATIC_VALIDATION/1', status: failures.length ? 'FAIL' : 'PASS',
  scope: 'Tasks-stage static checks only; not speckit.analyze, implementation or runtime evidence', counts: { tasks: map.tasks.length, checkpoints: map.checkpoints.length, NFRs: nfr.size, operations: opIds.length, ACs: map.acceptanceCoverage.length },
  checks, failures }, null, 2));
if (failures.length) process.exitCode = 1;
