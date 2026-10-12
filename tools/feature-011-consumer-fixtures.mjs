// K06 isolated component calls. These envelopes and source records are synthetic
// structural fixtures, never AES/KMS or real evidence-source acceptance.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, sql } from './run-feature-011-postgres-test.mjs';

const feature = 'specs/011-allergies-clinical-content-governance';
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const person = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const patient = 'f0110000-0000-4000-8100-000000000001';
const facility = 'f0110000-0000-4000-8200-000000000001';
const encounter = 'f0110000-0000-4000-8400-000000000001';
const verifiedAt = '2026-10-06T10:00:00.000000Z';
const bindingContract = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1';
const protectedEnvelope = (contractId, suffix = 'facts') => ({
  contractId,
  keyRef: `synthetic-kms/${suffix}/versions/1`,
  nonce: '0102030405060708090a0b0c',
  ciphertext: 'aabb',
  authTag: '0102030405060708090a0b0c0d0e0f10',
});
const responseContext = () => ({ responseLanguage: 'en-EG', responseRequestId: randomUUID() });

function lastJson(output) {
  const line = output
    .trim()
    .split(/\r?\n/)
    .findLast((value) => value.startsWith('{') || value.startsWith('['));
  assert.ok(line, 'SQL component must return JSON');
  return JSON.parse(line);
}
function context(n, role, action, input, key, hash = 'a'.repeat(64)) {
  const values = {
    environment: 'local',
    person_id: person(n),
    actor_role: role,
    action: action,
    aal: '2',
    purposes: 'synthetic.feature011',
    facility_id: role === 'PAT' ? '' : facility,
    encounter_id: role === 'CLN' ? encounter : '',
    request_id: input.responseRequestId,
    idempotency_key: key,
    request_hash: hash,
  };
  return Object.entries(values)
    .map(([name, value]) => `SELECT set_config(${quote('shifaa.' + name)},${quote(value)},true);`)
    .join('\n');
}

export function consumerComponents(runtime, database, observeMutation = () => {}) {
  const results = [];
  const owner = (query) => lastJson(sql(runtime, database, query).stdout);
  const check = (id, condition) => {
    assert.ok(condition, id);
    results.push({ id, result: 'PASS' });
  };
  const state = () =>
    owner(
      `SELECT json_build_object('allergies',(SELECT count(*) FROM clinical.allergies),'releases',(SELECT count(*) FROM clinical.content_releases),'signatures',(SELECT count(*) FROM audit.signature_evidence WHERE resource_type='clinical.content_release'),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'obligations',(SELECT count(*) FROM clinical.mutation_commit_obligations),'outbox',(SELECT count(*) FROM platform.outbox_events WHERE aggregate_type IN ('clinical.allergy_revision','clinical.content_release')));`,
    );
  const call = (
    n,
    role,
    action,
    expression,
    input,
    { key = randomUUID(), finalize = true, commit = true } = {},
  ) => {
    const query = `BEGIN;\n${context(n, role, action, input, key)}\nDO $component$ DECLARE result jsonb; receipt jsonb; BEGIN result:=${expression}; ${finalize ? `receipt:=clinical.f011_finalize_receipt_v1((result->>'receiptId')::uuid,${json(protectedEnvelope('SHIFAA-F011-RECEIPT-PROTECTED/1', 'receipt'))});` : 'receipt:=NULL;'} PERFORM set_config('shifaa.component_result',jsonb_build_object('domain',result,'finalizer',receipt)::text,true); END $component$; SELECT current_setting('shifaa.component_result'); ${commit ? 'COMMIT' : 'ROLLBACK'};`;
    const response = lastJson(sql(runtime, database, query, { user: 'shifaa_api' }).stdout);
    observeMutation({ n, role, action, expression, input, response, key });
    return { ...response, key };
  };
  const deny = (
    id,
    n,
    role,
    action,
    expression,
    input,
    states = ['22023', '42501', '40001', '23514'],
    finalize = true,
  ) => {
    const before = state();
    const output = sql(
      runtime,
      database,
      `BEGIN;\n${context(n, role, action, input, randomUUID())}\nDO $denial$ DECLARE result jsonb; BEGIN result := ${expression}; ${finalize ? `PERFORM clinical.f011_finalize_receipt_v1((result->>'receiptId')::uuid,${json(protectedEnvelope('SHIFAA-F011-RECEIPT-PROTECTED/1', 'receipt'))});` : ''} END $denial$; COMMIT;`,
      { user: 'shifaa_api', allowFailure: true },
    );
    assert.equal(output.exitCode, 3, id);
    const observed = output.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1];
    assert.ok(
      states.includes(observed),
      `${id}: intended denial required, observed ${observed}\n${output.stderr}`,
    );
    assert.deepEqual(state(), before, `${id}: failed mutation must leave all components unchanged`);
    results.push({ id, result: 'DENIED_WITHOUT_EFFECT', sqlstate: observed });
  };

  const create = {
    ...responseContext(),
    preparation: {
      allergyId: randomUUID(),
      revisionId: randomUUID(),
      revisionVersion: 1,
      previousRevisionId: null,
      protectedFacts: protectedEnvelope('SHIFAA-F011-ALLERGY-PROTECTED/1'),
      protectedReason: null,
      correctsAllergyId: null,
    },
  };
  const createExpr = (input) =>
    `clinical.create_allergy_api_v1(${quote(patient)}::uuid,${json(input)})`;
  deny('ALG_NO_GUC_ROLE_AUTHORITY', 4, 'PAT', 'createAllergy', createExpr(create), create, [
    '42501',
  ]);
  const badFacts = structuredClone(create);
  badFacts.preparation.protectedFacts.plaintext = 'Synthetic forbidden input';
  deny('ALG_CLOSED_PROTECTION', 1, 'PAT', 'createAllergy', createExpr(badFacts), badFacts, [
    '22023',
  ]);
  const created = call(1, 'PAT', 'createAllergy', createExpr(create), create);
  check(
    'ALG_CREATE_FINALIZED',
    created.domain.resourceVersion === 1 &&
      created.finalizer.featureReceiptId === created.domain.receiptId,
  );
  const incomplete = {
    ...responseContext(),
    preparation: { ...create.preparation, allergyId: randomUUID(), revisionId: randomUUID() },
  };
  deny(
    'ALG_DOMAIN_ONLY_COMMIT',
    1,
    'PAT',
    'createAllergy',
    createExpr(incomplete),
    incomplete,
    ['23514'],
    false,
  );
  const finalizerInput = {
    ...responseContext(),
    preparation: { ...create.preparation, allergyId: randomUUID(), revisionId: randomUUID() },
  };
  const leakingReceipt = {
    ...protectedEnvelope('SHIFAA-F011-RECEIPT-PROTECTED/1', 'receipt'),
    plaintext: 'synthetic forbidden durable material',
  };
  const beforeInvalidFinalizer = state();
  const invalidFinalizer = sql(
    runtime,
    database,
    `BEGIN; ${context(1, 'PAT', 'createAllergy', finalizerInput, randomUUID())} DO $finalizer$ DECLARE effect jsonb; BEGIN effect := ${createExpr(finalizerInput)}; PERFORM clinical.f011_finalize_receipt_v1((effect->>'receiptId')::uuid,${json(leakingReceipt)}); END $finalizer$; COMMIT;`,
    { user: 'shifaa_api', allowFailure: true },
  );
  assert.equal(invalidFinalizer.exitCode, 3);
  assert.match(
    invalidFinalizer.stderr,
    /22023:/,
    'Closed receipt input must fail validation before commit',
  );
  assert.deepEqual(
    state(),
    beforeInvalidFinalizer,
    'Invalid receipt rolls back all five components',
  );
  results.push({
    id: 'RECEIPT_CLOSED_ENVELOPE_ROLLBACK',
    result: 'DENIED_WITHOUT_EFFECT',
    sqlstate: '22023',
  });
  const otherActorContext = responseContext();
  const wrongPrincipal = sql(
    runtime,
    database,
    `BEGIN; ${context(4, 'PAT', 'createAllergy', otherActorContext, randomUUID())} SELECT clinical.f011_finalize_receipt_v1(${quote(created.domain.receiptId)}::uuid,${json(protectedEnvelope('SHIFAA-F011-RECEIPT-PROTECTED/1', 'receipt'))}); COMMIT;`,
    { user: 'shifaa_api', allowFailure: true },
  );
  assert.equal(wrongPrincipal.exitCode, 3);
  assert.match(wrongPrincipal.stderr, /42501:/, 'Receipt finalizer must bind current principal');
  assert.deepEqual(state(), beforeInvalidFinalizer);
  results.push({
    id: 'RECEIPT_OTHER_PRINCIPAL_DENIED',
    result: 'DENIED_WITHOUT_EFFECT',
    sqlstate: '42501',
  });
  const listInput = responseContext();
  const listed = lastJson(
    sql(
      runtime,
      database,
      `BEGIN; ${context(1, 'PAT', 'listAllergies', listInput, randomUUID())} SELECT clinical.list_allergies_api_v1(${quote(patient)}::uuid,'{}'::jsonb); ROLLBACK;`,
      { user: 'shifaa_api' },
    ).stdout,
  );
  check('ALG_CURRENT_READ', JSON.stringify(listed).includes(create.preparation.allergyId));
  for (const [reader, role] of [
    [2, 'CLN'],
    [4, 'DEL'],
  ]) {
    const authorizedRead = lastJson(
      sql(
        runtime,
        database,
        `BEGIN; ${context(reader, role, 'listAllergies', listInput, randomUUID())} SELECT clinical.list_allergies_api_v1(${quote(patient)}::uuid,'{}'::jsonb); ROLLBACK;`,
        { user: 'shifaa_api' },
      ).stdout,
    );
    check(
      `ALG_${role}_CURRENT_READ`,
      JSON.stringify(authorizedRead).includes(create.preparation.allergyId),
    );
  }
  deny('ALG_DELEGATE_READ_ONLY', 4, 'DEL', 'createAllergy', createExpr(create), create, ['42501']);

  const evidenceRef = randomUUID(),
    revisionId = randomUUID();
  sql(
    runtime,
    database,
    `INSERT INTO clinical.allergy_verification_support(id,patient_id,allergy_id,previous_revision_id,previous_version,target_status,attestor_person_id,source_identity,source_evidence_identity,producer_id,recorded_at,synthetic) VALUES(${quote(evidenceRef)}::uuid,${quote(patient)}::uuid,${quote(create.preparation.allergyId)}::uuid,${quote(create.preparation.revisionId)}::uuid,1,'clinician_confirmed',${quote(person(2))}::uuid,'synthetic.internal_clinician_provenance',${quote(evidenceRef)}::uuid,'f011.allergy_evidence_boundary',${quote(verifiedAt)}::timestamptz,true);`,
  );
  const verify = {
    ...responseContext(),
    preparation: {
      protectedRevision: {
        allergyId: create.preparation.allergyId,
        revisionId,
        revisionVersion: 2,
        previousRevisionId: create.preparation.revisionId,
        protectedFacts: protectedEnvelope('SHIFAA-F011-ALLERGY-PROTECTED/1', 'facts2'),
        protectedReason: protectedEnvelope('SHIFAA-F011-ALLERGY-PROTECTED/1', 'reason'),
      },
      verifiedEvidence: {
        contractId: bindingContract,
        profile: 'allergy_verification',
        bindingId: randomUUID(),
        producerId: 'f011.allergy_evidence_boundary',
        verifiedAt,
        evidenceRef,
        patientId: patient,
        allergyId: create.preparation.allergyId,
        previousRevisionId: create.preparation.revisionId,
        previousVersion: 1,
        revisionId,
        revisionVersion: 2,
        targetStatus: 'clinician_confirmed',
        attestorPersonId: person(2),
        sourceIdentity: 'synthetic.internal_clinician_provenance',
        sourceEvidenceIdentity: evidenceRef,
        synthetic: true,
      },
    },
  };
  const verifyExpr = (input, version = 1) =>
    `clinical.verify_allergy_api_v1(${quote(create.preparation.allergyId)}::uuid,${version},${json(input)})`;
  deny('ALG_PATIENT_CANNOT_VERIFY', 1, 'PAT', 'verifyAllergy', verifyExpr(verify), verify, [
    '42501',
  ]);
  const wrongSource = structuredClone(verify);
  wrongSource.preparation.verifiedEvidence.sourceEvidenceIdentity = randomUUID();
  deny('ALG_EXACT_SUPPORT_SOURCE', 2, 'CLN', 'verifyAllergy', verifyExpr(wrongSource), wrongSource);
  const verified = call(2, 'CLN', 'verifyAllergy', verifyExpr(verify), verify);
  check(
    'ALG_APPEND_FINALIZED',
    verified.domain.resourceVersion === 2 &&
      verified.finalizer.featureReceiptId === verified.domain.receiptId,
  );
  const history = owner(
    `SELECT json_build_object('count',count(*),'recorders',count(DISTINCT original_recorder_person_id),'recordedAt',count(DISTINCT original_recorded_at),'supports',(SELECT count(*) FROM clinical.allergy_verification_bindings WHERE revision_id=${quote(revisionId)}::uuid)) FROM clinical.allergies WHERE allergy_id=${quote(create.preparation.allergyId)}::uuid;`,
  );
  check(
    'ALG_APPEND_PROVENANCE',
    history.count === 2 &&
      history.recorders === 1 &&
      history.recordedAt === 1 &&
      history.supports === 1,
  );
  const readHistory = (filters) =>
    lastJson(
      sql(
        runtime,
        database,
        `BEGIN; ${context(1, 'PAT', 'listAllergies', listInput, randomUUID())} SELECT clinical.list_allergies_api_v1(${quote(patient)}::uuid,${json(filters)}); ROLLBACK;`,
        { user: 'shifaa_api' },
      ).stdout,
    );
  const firstPage = readHistory({ view: 'history', limit: 1 });
  assert.equal(firstPage.data.length, 1);
  assert.ok(
    firstPage.continuation,
    'SQL must provide private continuation claims when a second revision exists',
  );
  const secondPage = readHistory({ view: 'history', limit: 1, cursor: firstPage.continuation });
  check(
    'ALG_HISTORY_KEYSET_CONTINUATION',
    secondPage.data.length === 1 &&
      secondPage.data[0].revisionId !== firstPage.data[0].revisionId &&
      secondPage.continuation === null,
  );
  const mismatchedCursor = sql(
    runtime,
    database,
    `BEGIN; ${context(1, 'PAT', 'listAllergies', listInput, randomUUID())} SELECT clinical.list_allergies_api_v1(${quote(patient)}::uuid,${json({ view: 'current', limit: 1, cursor: firstPage.continuation })}); ROLLBACK;`,
    { user: 'shifaa_api', allowFailure: true },
  );
  assert.equal(mismatchedCursor.exitCode, 3);
  assert.match(mismatchedCursor.stderr, /22023:/, 'Continuation must bind the authorized filters');
  results.push({
    id: 'ALG_CURSOR_FILTER_BINDING',
    result: 'DENIED_INVALID_CURSOR',
    sqlstate: '22023',
  });
  const beforeReplay = state(),
    replayInput = { ...create, ...responseContext(), responseLanguage: 'ar-EG' };
  const replay = call(1, 'PAT', 'createAllergy', createExpr(replayInput), replayInput, {
    key: created.key,
    finalize: false,
  });
  check(
    'RECEIPT_ORIGINAL_TUPLE_AFTER_RESOURCE_AND_LANGUAGE_CHANGE',
    replay.domain.replay === true &&
      replay.domain.resourceVersion === 1 &&
      replay.domain.responseLanguage === 'en-EG' &&
      replay.domain.responseRequestId === create.responseRequestId,
  );
  assert.deepEqual(state(), beforeReplay, 'Replay must not repeat any domain/audit/outbox effect');
  results.push({ id: 'RECEIPT_REPLAY_NO_SECOND_EFFECT', result: 'PASS' });
  const changedHash = sql(
    runtime,
    database,
    `BEGIN; ${context(1, 'PAT', 'createAllergy', replayInput, created.key, 'b'.repeat(64))} SELECT ${createExpr(replayInput)}; COMMIT;`,
    { user: 'shifaa_api', allowFailure: true },
  );
  assert.equal(changedHash.exitCode, 3);
  assert.match(changedHash.stderr, /23505:/);
  assert.deepEqual(state(), beforeReplay);
  results.push({
    id: 'RECEIPT_SAME_KEY_CHANGED_REQUEST_HASH_DENIED',
    result: 'DENIED_WITHOUT_EFFECT',
    sqlstate: '23505',
  });
  const clinicianCreate = structuredClone(create);
  Object.assign(clinicianCreate, responseContext());
  clinicianCreate.preparation.allergyId = randomUUID();
  clinicianCreate.preparation.revisionId = randomUUID();
  clinicianCreate.preparation.protectedFacts.nonce = randomBytes(12).toString('hex');
  call(2, 'CLN', 'createAllergy', createExpr(clinicianCreate), clinicianCreate);
  const clinicianProvenance = owner(
    `SELECT json_build_object('recorder',original_recorder_person_id,'actor',action_actor_person_id) FROM clinical.allergies WHERE id=${quote(clinicianCreate.preparation.revisionId)}::uuid;`,
  );
  check(
    'ALG_CLINICIAN_ORIGINAL_PROVENANCE',
    clinicianProvenance.recorder === person(2) && clinicianProvenance.actor === person(2),
  );
  const stale = { ...verify, ...responseContext() };
  deny('ALG_STALE_CAS', 2, 'CLN', 'verifyAllergy', verifyExpr(stale), stale, ['40001', '22023']);
  const preparedStatus = (targetStatus, previousVersion, previousRevisionId) => {
    const next = structuredClone(verify);
    Object.assign(next, responseContext());
    const nextRevisionId = randomUUID(),
      nextEvidenceRef = randomUUID();
    Object.assign(next.preparation.protectedRevision, {
      revisionId: nextRevisionId,
      revisionVersion: previousVersion + 1,
      previousRevisionId,
    });
    Object.assign(next.preparation.verifiedEvidence, {
      bindingId: randomUUID(),
      evidenceRef: nextEvidenceRef,
      sourceEvidenceIdentity: nextEvidenceRef,
      revisionId: nextRevisionId,
      revisionVersion: previousVersion + 1,
      previousRevisionId,
      previousVersion,
      targetStatus,
    });
    sql(
      runtime,
      database,
      `INSERT INTO clinical.allergy_verification_support(id,patient_id,allergy_id,previous_revision_id,previous_version,target_status,attestor_person_id,source_identity,source_evidence_identity,producer_id,recorded_at,synthetic) VALUES(${quote(nextEvidenceRef)}::uuid,${quote(patient)}::uuid,${quote(create.preparation.allergyId)}::uuid,${quote(previousRevisionId)}::uuid,${previousVersion},${quote(targetStatus)},${quote(person(2))}::uuid,'synthetic.internal_clinician_provenance',${quote(nextEvidenceRef)}::uuid,'f011.allergy_evidence_boundary',${quote(verifiedAt)}::timestamptz,true);`,
    );
    return next;
  };
  const terminalInput = preparedStatus('entered_in_error', 2, revisionId);
  const terminal = call(2, 'CLN', 'verifyAllergy', verifyExpr(terminalInput, 2), terminalInput);
  check('ALG_ENTERED_IN_ERROR_WITHIN_VERIFY', terminal.domain.resourceVersion === 3);
  const afterTerminal = preparedStatus(
    'clinician_confirmed',
    3,
    terminalInput.preparation.protectedRevision.revisionId,
  );
  deny(
    'ALG_TERMINAL_APPEND_DENIED',
    2,
    'CLN',
    'verifyAllergy',
    verifyExpr(afterTerminal, 3),
    afterTerminal,
    ['23514'],
  );
  const correction = structuredClone(create);
  Object.assign(correction, responseContext());
  Object.assign(correction.preparation, {
    allergyId: randomUUID(),
    revisionId: randomUUID(),
    correctsAllergyId: create.preparation.allergyId,
  });
  call(1, 'PAT', 'createAllergy', createExpr(correction), correction);
  const correctionRow = owner(
    `SELECT json_build_object('status',verification_status,'corrects',corrects_allergy_id,'version',version) FROM clinical.allergies WHERE id=${quote(correction.preparation.revisionId)}::uuid;`,
  );
  check(
    'ALG_CORRECTION_NEW_SELF_REPORTED_ASSERTION',
    correctionRow.status === 'self_reported' &&
      correctionRow.version === 1 &&
      correctionRow.corrects === create.preparation.allergyId,
  );
  const invalidCorrection = structuredClone(correction);
  Object.assign(invalidCorrection, responseContext());
  Object.assign(invalidCorrection.preparation, {
    allergyId: randomUUID(),
    revisionId: randomUUID(),
    correctsAllergyId: clinicianCreate.preparation.allergyId,
  });
  deny(
    'ALG_NONTERMINAL_CORRECTION_DENIED',
    1,
    'PAT',
    'createAllergy',
    createExpr(invalidCorrection),
    invalidCorrection,
    ['23514'],
  );

  const vector = JSON.parse(
    readFileSync(
      resolve(root, `${feature}/contracts/trusted-release-handoff-v1-vectors.json`),
      'utf8',
    ),
  ).fullHandoffPositive[0];
  const handoff = structuredClone(vector.handoff);
  const releaseId = handoff.allocation.releaseId;
  const materialBindings = Object.fromEntries(
    ['content', 'code', 'testVectors'].map((kind) => [
      kind,
      {
        contractId: bindingContract,
        profile: {
          content: 'content_material',
          code: 'code_material',
          testVectors: 'test_vector_material',
        }[kind],
        bindingId: randomUUID(),
        producerId: 'f011.evidence_port',
        verifiedAt,
        releaseId,
        artifactVersion: handoff.allocation.artifactVersion,
        evidenceRef: handoff.trustedEvidence[kind].reference,
        verifiedSha256: handoff.trustedEvidence[kind].verifiedSha256,
      },
    ]),
  );
  const draftInput = { ...responseContext(), handoff, materialBindings };
  const draftExpr = (input) =>
    `clinical.create_clinical_content_release_api_v1('synthetic',${json(input)})`;
  const wrongDigest = structuredClone(draftInput);
  wrongDigest.handoff.declaredDigest = '0'.repeat(64);
  deny(
    'CONTENT_DECLARED_DIGEST_EQUALITY',
    5,
    'ADM-MEDICAL',
    'createClinicalContentRelease',
    draftExpr(wrongDigest),
    wrongDigest,
    ['22023', '23514'],
  );
  const wrongProducer = structuredClone(draftInput);
  wrongProducer.materialBindings.content.producerId = 'client.claim';
  deny(
    'CONTENT_FULL_MATERIAL_PROFILE',
    5,
    'ADM-MEDICAL',
    'createClinicalContentRelease',
    draftExpr(wrongProducer),
    wrongProducer,
    ['22023', '23514'],
  );
  const draft = call(
    5,
    'ADM-MEDICAL',
    'createClinicalContentRelease',
    draftExpr(draftInput),
    draftInput,
  );
  check(
    'CONTENT_DRAFT_FINALIZED',
    draft.domain.resourceVersion === 1 &&
      draft.finalizer.featureReceiptId === draft.domain.receiptId,
  );
  const release = owner(
    `SELECT json_build_object('digest',encode(artifact_digest,'hex'),'artifactVersion',artifact_version,'workflowVersion',workflow_version,'bindings',(SELECT count(*) FROM clinical.content_material_bindings WHERE release_id=r.id)) FROM clinical.content_releases r WHERE r.id=${quote(releaseId)}::uuid;`,
  );
  check(
    'CONTENT_SQL_OWNED_FROZEN_DIGEST',
    release.digest === handoff.declaredDigest &&
      release.bindings === 3 &&
      release.artifactVersion === 1,
  );

  const timestamp = (value) =>
    value === null ? null : new Date(value).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
  const basis = (n) => {
    const raw = owner(
      `SELECT json_build_object('credential',to_jsonb(c),'designation',to_jsonb(d),'authority',to_jsonb(a)) FROM identity.professional_licenses c JOIN clinical.content_reviewer_designations d ON d.professional_license_id=c.id JOIN clinical.content_governance_authorities a ON a.person_id=c.person_id AND a.action='signClinicalContentRelease' AND a.capacity=d.reviewer_capacity WHERE c.person_id=${quote(person(n))}::uuid;`,
    );
    const c = raw.credential,
      d = raw.designation,
      a = raw.authority;
    return {
      credentialBasis: {
        id: c.id,
        version: c.version,
        personId: c.person_id,
        profession: c.profession,
        status: c.status,
        expiresOn: c.expires_on,
        issuer: c.issuer,
        evidenceObjectId: c.evidence_object_id,
        reviewedByPersonId: c.reviewed_by_person_id,
        reviewedAt: timestamp(c.reviewed_at),
      },
      designationBasis: {
        id: d.id,
        version: d.version,
        personId: d.person_id,
        professionalLicenseId: d.professional_license_id,
        capacity: d.reviewer_capacity,
        evidenceRef: d.evidence_ref,
        designatedBy: d.designated_by,
        status: d.status,
        validFrom: timestamp(d.valid_from),
        validUntil: timestamp(d.valid_until),
        sourceIdentity: d.source_identity,
        sourceEvidenceIdentity: d.source_evidence_identity,
        sourceEvidenceVersion: d.source_evidence_version,
        sourceEvidenceSha256:
          d.source_evidence_sha256 === null ? null : d.source_evidence_sha256.slice(2),
        evidenceProducerId: d.evidence_producer_id,
        evidenceVerifiedAt: timestamp(d.evidence_verified_at),
      },
      authorityBasis: {
        id: a.id,
        version: a.version,
        personId: a.person_id,
        action: a.action,
        capacity: a.capacity,
        contentType: a.content_type,
        governedContentKey: a.governed_content_key,
        effectiveScopeKey: a.effective_scope_key,
        facilityId: a.facility_id,
        issuedBy: a.issued_by,
        evidenceRef: a.evidence_ref,
        status: a.status,
        validFrom: timestamp(a.valid_from),
        validUntil: timestamp(a.valid_until),
        sourceIdentity: a.source_identity,
        sourceEvidenceIdentity: a.source_evidence_identity,
        sourceEvidenceVersion: a.source_evidence_version,
        sourceEvidenceSha256:
          a.source_evidence_sha256 === null ? null : a.source_evidence_sha256.slice(2),
        evidenceProducerId: a.evidence_producer_id,
        evidenceVerifiedAt: timestamp(a.evidence_verified_at),
      },
    };
  };
  const signInput = (n) => ({
    ...responseContext(),
    signing: {
      contractId: bindingContract,
      profile: 'signing',
      bindingId: randomUUID(),
      producerId: 'f011.signing_port',
      verifiedAt,
      releaseId,
      artifactVersion: 1,
      artifactDigest: release.digest,
      signerPersonId: person(n),
      capacity: n === 2 ? 'physician' : 'pharmacist',
      decision: 'approved',
      evidenceRef: randomUUID(),
      sourceIdentity: 'synthetic.signing',
      sourceEvidenceIdentity: randomUUID(),
      sourceEvidenceVersion: null,
      sourceEvidenceSha256: null,
      ...basis(n),
    },
  });
  const signExpr = (input, version) =>
    `clinical.sign_clinical_content_release_api_v1(${quote(releaseId)}::uuid,${version},${json(input)})`;
  const physician = signInput(2);
  const wrongBasis = structuredClone(physician);
  wrongBasis.signing.credentialBasis.version++;
  deny(
    'SIGN_EXACT_CURRENT_BASIS',
    2,
    'CLN',
    'signClinicalContentRelease',
    signExpr(wrongBasis, 1),
    wrongBasis,
    ['42501', '22023'],
  );
  const forged = structuredClone(physician);
  forged.signing.signerPersonId = person(5);
  deny(
    'SIGN_CREATOR_CANNOT_CLAIM_SIGNER',
    5,
    'ADM-MEDICAL',
    'signClinicalContentRelease',
    signExpr(forged, 1),
    forged,
    ['42501', '22023'],
  );
  const signedDoctor = call(
    2,
    'CLN',
    'signClinicalContentRelease',
    signExpr(physician, 1),
    physician,
  );
  check('SIGN_PHYSICIAN_FINALIZED', signedDoctor.domain.resourceVersion === 2);
  const pharmacist = signInput(3);
  const signedPharmacist = call(
    3,
    'PHA',
    'signClinicalContentRelease',
    signExpr(pharmacist, 2),
    pharmacist,
  );
  check('SIGN_PHARMACIST_FINALIZED', signedPharmacist.domain.resourceVersion === 3);
  const signatures = owner(
    `SELECT json_build_object('count',count(*),'people',count(DISTINCT s.signer_person_id),'bindings',count(b.signature_evidence_id),'columns',(SELECT count(*) FROM information_schema.columns WHERE table_schema='clinical' AND table_name='content_signature_bindings')) FROM audit.signature_evidence s JOIN clinical.content_signature_bindings b ON b.signature_evidence_id=s.id WHERE s.resource_id=${quote(releaseId)}::uuid;`,
  );
  check(
    'SIGN_IMMUTABLE_50_COLUMN_BASIS',
    signatures.count === 2 &&
      signatures.people === 2 &&
      signatures.bindings === 2 &&
      signatures.columns === 50,
  );
  const competing = structuredClone(draftInput);
  Object.assign(competing, responseContext());
  competing.handoff.allocation.releaseId = randomUUID();
  competing.handoff.protectedBody.nonce = randomBytes(12).toString('hex');
  for (const binding of Object.values(competing.materialBindings)) {
    binding.bindingId = randomUUID();
    binding.releaseId = competing.handoff.allocation.releaseId;
  }
  const competingDraft = call(
    5,
    'ADM-MEDICAL',
    'createClinicalContentRelease',
    draftExpr(competing),
    competing,
  );
  check('CONTENT_SAME_VERSION_COMPETING_DRAFT', competingDraft.domain.resourceVersion === 1);
  const rejected = signInput(2);
  rejected.signing.releaseId = competing.handoff.allocation.releaseId;
  rejected.signing.decision = 'rejected';
  const rejectedDecision = call(
    2,
    'CLN',
    'signClinicalContentRelease',
    `clinical.sign_clinical_content_release_api_v1(${quote(rejected.signing.releaseId)}::uuid,1,${json(rejected)})`,
    rejected,
  );
  const rejection = owner(
    `SELECT json_build_object('decisions',count(*),'sidecars',count(b.signature_evidence_id),'decision',min(s.decision)) FROM audit.signature_evidence s JOIN clinical.content_signature_bindings b ON b.signature_evidence_id=s.id WHERE s.resource_id=${quote(rejected.signing.releaseId)}::uuid;`,
  );
  check(
    'SIGN_VALID_REJECTION_SAME_VERIFIED_BASIS',
    rejectedDecision.domain.resourceVersion === 2 &&
      rejection.decisions === 1 &&
      rejection.sidecars === 1 &&
      rejection.decision === 'rejected',
  );
  const beforeRejectionReplay = state();
  const rejectionReplayInput = { ...rejected, ...responseContext() };
  const rejectionReplay = call(
    2,
    'CLN',
    'signClinicalContentRelease',
    `clinical.sign_clinical_content_release_api_v1(${quote(rejected.signing.releaseId)}::uuid,1,${json(rejectionReplayInput)})`,
    rejectionReplayInput,
    { key: rejectedDecision.key, finalize: false },
  );
  check(
    'RECEIPT_VALID_REJECTION_REPLAY',
    rejectionReplay.domain.replay === true && rejectionReplay.domain.resourceVersion === 2,
  );
  assert.deepEqual(
    state(),
    beforeRejectionReplay,
    'Rejection replay must not create a signature or repeated effect',
  );
  const publish = {
    ...responseContext(),
    artifactVersion: 1,
    artifactDigest: release.digest,
    confirmPublication: true,
  };
  const publishExpr = (input) =>
    `clinical.publish_clinical_content_release_api_v1(${quote(releaseId)}::uuid,3,${json(input)})`;
  deny(
    'PUB_EXACT_ADMISSION_REQUIRED',
    6,
    'ADM-MEDICAL',
    'publishClinicalContentRelease',
    publishExpr(publish),
    publish,
    ['42501', '22023'],
  );
  const approval = randomUUID(),
    admissionBinding = randomUUID();
  sql(
    runtime,
    database,
    `BEGIN;
    SELECT id FROM clinical.content_series WHERE id=(SELECT series_id FROM clinical.content_releases WHERE id=${quote(releaseId)}::uuid) FOR UPDATE;
    SELECT id FROM clinical.content_releases WHERE id=${quote(releaseId)}::uuid FOR UPDATE;
    INSERT INTO clinical.content_admissibility_evidence(id,release_id,artifact_version,artifact_digest,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,source_evidence_version,source_evidence_sha256,synthetic,status,valid_from,valid_until,version)
    VALUES(${quote(approval)}::uuid,${quote(releaseId)}::uuid,1,decode(${quote(release.digest)},'hex'),'synthetic','neutral-series','synthetic-scope',${quote(randomUUID())}::uuid,'synthetic-policy-v1',decode(repeat('b',64),'hex'),${quote(randomUUID())}::uuid,${quote(randomUUID())}::uuid,${quote(randomUUID())}::uuid,${quote(randomUUID())}::uuid,'synthetic.exact-admission',${quote(randomUUID())},NULL,NULL,true,'active','2020-01-01T00:00:00Z',NULL,1);
    INSERT INTO clinical.content_artifact_admissibility_bindings(binding_id,binding_contract_id,release_id,artifact_version,artifact_digest,approval_id,approval_version,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,source_evidence_version,source_evidence_sha256,producer_id,verified_at,synthetic,approval_status,approval_valid_from,approval_valid_until)
    SELECT ${quote(admissionBinding)}::uuid,${quote(bindingContract)},release_id,artifact_version,artifact_digest,id,version,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,source_evidence_version,source_evidence_sha256,'f011.governance_provisioner',${quote(verifiedAt)}::timestamptz,synthetic,status,valid_from,valid_until FROM clinical.content_admissibility_evidence WHERE id=${quote(approval)}::uuid; COMMIT;`,
  );
  deny(
    'PUB_CREATOR_INDEPENDENCE',
    5,
    'ADM-MEDICAL',
    'publishClinicalContentRelease',
    publishExpr(publish),
    publish,
    ['42501'],
  );
  const published = call(
    6,
    'ADM-MEDICAL',
    'publishClinicalContentRelease',
    publishExpr(publish),
    publish,
  );
  check('PUB_FINALIZED', published.domain.resourceVersion === 4);
  const clinicInput = responseContext();
  const clinic = lastJson(
    sql(
      runtime,
      database,
      `BEGIN; ${context(2, 'CLN', 'listClinicalContent', clinicInput, randomUUID())} SELECT clinical.list_clinical_content_api_v1('synthetic','{"projection":"status"}'::jsonb); ROLLBACK;`,
      { user: 'shifaa_api' },
    ).stdout,
  );
  const clinicSerialized = JSON.stringify(clinic);
  check('CLINIC_PUBLISHED_METADATA_VISIBLE', clinicSerialized.includes(releaseId));
  check(
    'CLINIC_PRIVATE_DATA_ABSENT',
    !/(body|keyRef|ciphertext|signerPersonId|evidenceRef|private|resolver|draft)/.test(
      clinicSerialized,
    ),
  );
  sql(
    runtime,
    database,
    `UPDATE identity.professional_licenses SET version=version+1,updated_at=clock_timestamp() WHERE person_id=${quote(person(2))}::uuid;`,
  );
  const ineligible = lastJson(
    sql(
      runtime,
      database,
      `BEGIN; ${context(2, 'CLN', 'listClinicalContent', clinicInput, randomUUID())} SELECT clinical.list_clinical_content_api_v1('synthetic','{"projection":"status"}'::jsonb); ROLLBACK;`,
      { user: 'shifaa_api' },
    ).stdout,
  );
  check(
    'PUB_NO_REHABILITATION_AFTER_BASIS_VERSION_CHANGE',
    !JSON.stringify(ineligible).includes(releaseId),
  );
  const staleSignerReplay = { ...physician, ...responseContext() };
  const beforeSignerReplay = state();
  const deniedSignerReplay = sql(
    runtime,
    database,
    `BEGIN; ${context(2, 'CLN', 'signClinicalContentRelease', staleSignerReplay, signedDoctor.key)} SELECT ${signExpr(staleSignerReplay, 1)}; COMMIT;`,
    { user: 'shifaa_api', allowFailure: true },
  );
  assert.equal(deniedSignerReplay.exitCode, 3);
  assert.match(
    deniedSignerReplay.stderr,
    /42501:/,
    'Lost exact credential basis must deny original signer receipt replay',
  );
  assert.deepEqual(state(), beforeSignerReplay);
  results.push({
    id: 'RECEIPT_CURRENT_SIGNER_AUTHORITY_LOSS_DENIED',
    result: 'DENIED_WITHOUT_EFFECT',
    sqlstate: '42501',
  });
  const receipts = owner(
    `SELECT json_build_object('count',count(*),'obligations',(SELECT count(*) FROM clinical.mutation_commit_obligations),'completed',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed' AND resource_type IN ('clinical.allergy_revision','clinical.content_release')),'badPointers',(SELECT count(*) FROM platform.idempotency_records i JOIN clinical.mutation_receipts r ON r.idempotency_record_id=i.id WHERE i.response_body IS DISTINCT FROM jsonb_build_object('featureReceiptId',r.id::text) OR i.response_headers IS DISTINCT FROM jsonb_build_object('ETag',r.response_etag,'Content-Language',r.response_language,'Cache-Control','private, no-store','X-Request-Id',r.response_request_id::text))) FROM clinical.mutation_receipts;`,
  );
  check(
    'RECEIPT_ALL_FIVE_EXACT_COMPLETION_TUPLE',
    receipts.count > 0 &&
      receipts.count === receipts.obligations &&
      receipts.count === receipts.completed &&
      receipts.badPointers === 0,
  );
  return {
    results,
    state: state(),
    actualOnlineRole: 'shifaa_api',
    syntheticOnly: true,
    fullRaceProofExecuted: false,
  };
}
