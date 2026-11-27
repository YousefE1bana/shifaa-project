// Test orchestration for the admitted F011 publication case. Owner reads are
// independent of the application process and issued only by the harness.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const person = (number) => 'f0110000-0000-4000-8000-' + String(number).padStart(12, '0');
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const literalId = (id) => {
  assert.match(id, uuid);
  return "'" + id + "'::uuid";
};
const instant = (value) =>
  value === null ? null : new Date(value).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
const now = () => instant(new Date());

function signingSelection(read, draft, actor, capacity) {
  const id = literalId(person(actor));
  const row = read(`SELECT json_build_object(
    'credentialBasis', json_build_object(
      'id',c.id,'version',c.version,'personId',c.person_id,'profession',c.profession,
      'status',c.status,'expiresOn',c.expires_on,'issuer',c.issuer,
      'evidenceObjectId',c.evidence_object_id,'reviewedByPersonId',c.reviewed_by_person_id,
      'reviewedAt',c.reviewed_at),
    'designationBasis', json_build_object(
      'id',d.id,'version',d.version,'personId',d.person_id,'professionalLicenseId',c.id,
      'capacity',d.reviewer_capacity,'evidenceRef',d.evidence_ref,'designatedBy',d.designated_by,
      'status',d.status,'validFrom',d.valid_from,'validUntil',d.valid_until,
      'sourceIdentity',d.source_identity,'sourceEvidenceIdentity',d.source_evidence_identity,
      'sourceEvidenceVersion',d.source_evidence_version,'sourceEvidenceSha256',encode(d.source_evidence_sha256,'hex'),
      'evidenceProducerId',d.evidence_producer_id,'evidenceVerifiedAt',d.evidence_verified_at),
    'authorityBasis', json_build_object(
      'id',a.id,'version',a.version,'personId',a.person_id,'action',a.action,'capacity',a.capacity,
      'contentType',a.content_type,'governedContentKey',a.governed_content_key,
      'effectiveScopeKey',a.effective_scope_key,'facilityId',a.facility_id,'issuedBy',a.issued_by,
      'evidenceRef',a.evidence_ref,'status',a.status,'validFrom',a.valid_from,'validUntil',a.valid_until,
      'sourceIdentity',a.source_identity,'sourceEvidenceIdentity',a.source_evidence_identity,
      'sourceEvidenceVersion',a.source_evidence_version,'sourceEvidenceSha256',encode(a.source_evidence_sha256,'hex'),
      'evidenceProducerId',a.evidence_producer_id,'evidenceVerifiedAt',a.evidence_verified_at),
    'creatorPersonId',r.created_by_person_id,'artifactVersion',r.artifact_version,
    'artifactDigest',encode(r.artifact_digest,'hex'),'workflowVersion',r.workflow_version,
    'contentType',s.content_type,'administrative',EXISTS(
      SELECT FROM identity.admin_role_grants g WHERE g.person_id=c.person_id AND g.status='active'),
    'signerPersonIds',COALESCE((SELECT json_agg(e.signer_person_id) FROM audit.signature_evidence e
      WHERE e.resource_type='clinical.content_release' AND e.resource_id=r.id),'[]'::json))
    FROM identity.professional_licenses c
    JOIN clinical.content_reviewer_designations d ON d.professional_license_id=c.id
    JOIN clinical.content_governance_authorities a ON a.person_id=c.person_id
      AND a.action='signClinicalContentRelease' AND a.capacity=d.reviewer_capacity AND a.status='active'
    JOIN clinical.content_releases r ON r.id=${literalId(draft.releaseId)}
    JOIN clinical.content_series s ON s.id=r.series_id
    WHERE c.person_id=${id} AND d.reviewer_capacity='${capacity}';`);
  const { credentialBasis, designationBasis, authorityBasis, ...release } = row;
  credentialBasis.reviewedAt = instant(credentialBasis.reviewedAt);
  for (const basis of [designationBasis, authorityBasis]) {
    for (const field of ['validFrom', 'validUntil', 'evidenceVerifiedAt'])
      basis[field] = instant(basis[field]);
  }
  return { ...release, basis: { credentialBasis, designationBasis, authorityBasis } };
}

export function publicationScenario({ invoke, offline, read, report, clockOnly = false }) {
  const request = (action, actor, payload, status) => {
    const outcome = invoke(action, { actor, requestId: randomUUID(), ...payload });
    report.requests.push({ action, actor: person(actor), ...outcome });
    assert.equal(
      outcome.status,
      status,
      action + ' by fixture ' + actor + ' (' + outcome.errorCode + ')',
    );
    return outcome;
  };
  const effects = (release) =>
    read(`SELECT json_build_object(
    'publication',json_build_object('status',r.status,'publisher',r.published_by_person_id,
      'version',r.workflow_version,'supersedes',r.supersedes_release_id,'artifactDigest',encode(r.artifact_digest,'hex')),
    'approvals',(SELECT count(*) FROM clinical.content_artifact_admissibility_bindings a WHERE a.release_id=r.id),
    'signatures',(SELECT count(*) FROM audit.signature_evidence s WHERE s.resource_type='clinical.content_release' AND s.resource_id=r.id),
    'eligible',clinical.f011_release_current_eligibility_v1(r.id),
    'receipts',(SELECT COALESCE(json_agg(json_build_object('version',m.resource_version,'status',m.response_status,
      'etag',m.response_etag,'actor',m.actor_person_id,'receipt',m.id,'audit',e.id,'outbox',o.id,
      'auditActor',e.actor_person_id,'idempotency',i.id) ORDER BY m.id),'[]'::json)
      FROM clinical.mutation_receipts m
      JOIN clinical.mutation_commit_obligations b ON b.receipt_id=m.id AND b.idempotency_record_id=m.idempotency_record_id
      JOIN audit.events e ON e.id=b.audit_event_id AND e.occurred_at=b.audit_event_occurred_at AND e.resource_id=m.resource_id
      JOIN platform.outbox_events o ON o.id=b.outbox_event_id AND o.aggregate_id=m.resource_id
      JOIN platform.idempotency_records i ON i.id=m.idempotency_record_id AND i.state='completed'
      WHERE m.resource_id=r.id AND m.operation_id='publishClinicalContentRelease'))
    FROM clinical.content_releases r WHERE r.id=${literalId(release)};`);
  const sign = (draft, actor, capacity) => {
    const selection = signingSelection(read, draft, actor, capacity);
    const signature = {
      contractId: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
      profile: 'signing',
      bindingId: randomUUID(),
      producerId: 'f011.signing_port',
      verifiedAt: now(),
      releaseId: draft.releaseId,
      artifactVersion: draft.artifactVersion,
      artifactDigest: draft.artifactDigest,
      signerPersonId: person(actor),
      capacity,
      decision: 'approved',
      evidenceRef: randomUUID(),
      sourceIdentity: 'synthetic.signing',
      sourceEvidenceIdentity: randomUUID(),
      sourceEvidenceVersion: null,
      sourceEvidenceSha256: null,
      ...selection.basis,
    };
    request(
      'sign',
      actor,
      {
        id: draft.releaseId,
        key: randomUUID(),
        version: selection.workflowVersion,
        signature,
        selection,
      },
      200,
    );
    return selection.basis.designationBasis;
  };
  const prepare = (predecessor) => {
    const draft = request(
      'draft',
      5,
      {
        key: randomUUID(),
        ...(predecessor ? { parent: predecessor, effectiveAt: '2026-10-02T00:00:00.000000Z' } : {}),
      },
      201,
    );
    const designation = sign(draft, 2, 'physician');
    sign(draft, 3, 'pharmacist');
    return { draft, designation };
  };
  const current = () => request('status', 2, {}, 200).current;
  const publicationInput = (draft) => ({
    id: draft.releaseId,
    artifactVersion: draft.artifactVersion,
    artifactDigest: draft.artifactDigest,
    key: randomUUID(),
    version: 3,
  });
  const publish = (draft, input, parent) => {
    const result = request('publish', 6, input, 200);
    assert.equal(result.eligibility, 'effective', 'Published backdated fixture is effective');
    assert.equal(result.workflowVersion, 4);
    const saved = effects(draft.releaseId);
    report.readback.push(saved);
    assert.deepEqual(saved.publication, {
      status: 'published',
      publisher: person(6),
      version: 4,
      supersedes: parent,
      artifactDigest: draft.artifactDigest,
    });
    assert.equal(saved.signatures, 2);
    assert.equal(saved.approvals, 1);
    assert.equal(saved.eligible, true);
    assert.equal(saved.receipts.length, 1);
    const [receipt] = saved.receipts;
    assert.equal(receipt.actor, person(6));
    assert.equal(receipt.auditActor, person(6));
    assert.equal(receipt.status, 200);
    assert.equal(receipt.version, 4);
    assert.equal(receipt.etag, result.etag);
    for (const field of ['receipt', 'audit', 'outbox', 'idempotency'])
      assert.match(receipt[field], uuid);
    return result;
  };
  const { draft: initial } = prepare();
  const firstInput = publicationInput(initial);
  if (clockOnly) {
    const admission = offline('admit', { releaseId: initial.releaseId, clockOnly });
    report.offline.push(admission);
    publish(initial, firstInput, null);
    const committed = effects(initial.releaseId);
    assert.deepEqual(current(), [initial.releaseId]);
    const approvalId = literalId(admission.approvalId);
    const clockState = () =>
      read(`WITH sample AS MATERIALIZED (SELECT clock_timestamp() AS instant)
      SELECT json_build_object('deadline',a.valid_until,'sample',sample.instant,
        'elapsed',sample.instant >= a.valid_until,'version',a.version,'status',a.status,
        'boundDeadline',b.approval_valid_until)
      FROM clinical.content_admissibility_evidence a
      JOIN clinical.content_artifact_admissibility_bindings b ON b.approval_id=a.id
      CROSS JOIN sample WHERE a.id=${approvalId};`);
    const before = clockState();
    report.clock = { before };
    assert.equal(before.elapsed, false);
    assert.equal(before.deadline, before.boundDeadline);
    const wait = read(`WITH wait AS MATERIALIZED (
      SELECT pg_sleep_until(valid_until + interval '1 millisecond')
      FROM clinical.content_admissibility_evidence WHERE id=${approvalId})
      SELECT json_build_object('waited',count(*)=1) FROM wait;`);
    assert.equal(wait.waited, true);
    const after = clockState();
    report.clock.after = after;
    assert.deepEqual(after, { ...before, sample: after.sample, elapsed: true });
    assert.deepEqual(current(), []);
    const expired = effects(initial.releaseId);
    assert.deepEqual(expired, { ...committed, eligible: false });
    report.readback.push(expired);
    report.assertions = [
      'elapsed bound admissibility removes current eligibility while preserving the publication and durable effects',
    ];
    return;
  }
  const beforeAdmission = effects(initial.releaseId);
  request('publish', 6, firstInput, 403);
  assert.deepEqual(effects(initial.releaseId), beforeAdmission);
  assert.deepEqual(current(), []);
  report.offline.push(offline('admit', { releaseId: initial.releaseId }));
  const first = publish(initial, firstInput, null);
  const committed = effects(initial.releaseId);
  const replay = request('publish', 6, firstInput, 200);
  assert.equal(replay.responseSha256, first.responseSha256);
  assert.equal(replay.etag, first.etag);
  assert.deepEqual(effects(initial.releaseId), committed);
  assert.deepEqual(current(), [initial.releaseId]);

  const { draft: successor, designation } = prepare(initial.releaseId);
  report.offline.push(offline('admit', { releaseId: successor.releaseId }));
  assert.deepEqual(current(), [initial.releaseId]);
  publish(successor, publicationInput(successor), initial.releaseId);
  assert.deepEqual(current(), [successor.releaseId]);
  assert.deepEqual(effects(initial.releaseId), committed);

  const beforeLoss = effects(successor.releaseId);
  report.offline.push(offline('revoke-admission', { approvalId: report.offline[1].approvalId }));
  assert.deepEqual(current(), []);
  const afterLoss = effects(successor.releaseId);
  report.readback.push(afterLoss);
  assert.deepEqual(afterLoss, { ...beforeLoss, eligible: false });
  assert.deepEqual(
    effects(initial.releaseId),
    committed,
    'Valid ancestor cannot become current again',
  );
  report.offline.push(offline('advance-designation', { designation }));
  const finalPredecessor = effects(initial.releaseId);
  assert.deepEqual(finalPredecessor, { ...committed, eligible: false });
  assert.deepEqual(current(), []);
  report.provisioningAudit = [
    [report.offline[0].approvalId, 1],
    [report.offline[1].approvalId, 1],
    [report.offline[3].designationId, report.offline[3].version],
  ].map(([id, version]) => {
    assert.ok(Number.isSafeInteger(version) && version > 0);
    const event = read(`SELECT json_build_object(
      'count',count(*),'id',min(e.id::text),'actor',min(e.actor_person_id::text),
      'purpose',min(e.purpose_code),'outcome',min(e.outcome))
      FROM audit.events e WHERE e.resource_id=${literalId(id)} AND e.resource_version=${version}
      AND e.action_code='clinical_content_evidence.provisioned';`);
    assert.equal(event.count, 1);
    assert.match(event.id, uuid);
    assert.equal(event.actor, person(8));
    assert.equal(event.purpose, 'governed.feature011.provision');
    assert.equal(event.outcome, 'success');
    return { resourceId: id, version, ...event };
  });
  report.assertions = [
    'missing exact admission denied without publication effect',
    'distinct authenticated publisher committed the initial release and replayed its single receipt',
    'draft successor leaves the initial release current; publishing selects the successor',
    'loss of the successor’s exact admission removes current eligibility without falling back to an otherwise eligible ancestor',
    'advancing the exact reviewer designation invalidates its older approval without rewriting receipts or signatures',
  ];
}
