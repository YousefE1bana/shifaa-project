// Synthetic SQL/result preflight; real evidence producers belong to K09.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { sql, root } from './run-feature-011-postgres-test.mjs';
import { consumerComponents } from './feature-011-consumer-fixtures.mjs';
import { Feature011SignReleaseResponseSchema } from '../packages/contracts/src/feature-011.ts';
const typeboxRequire = createRequire(resolve(root,'packages/contracts/package.json'));
const { Value } = await import(new URL('../esm/value/index.mjs', 'file:///'+typeboxRequire.resolve('@sinclair/typebox').replaceAll('\\','/')).href);
const quote = value => `'${String(value).replaceAll("'","''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
const last = result => JSON.parse(result.stdout.trim().split(/\r?\n/).findLast(line=>line.startsWith('{')||line.startsWith('[')));
export function preflightConsumers(runtime,database) {
  // The historical component fixture gives only the physician listing authority.
  // Provision the pharmacist's independent synthetic disclosure scope through
  // the harness owner; this is fixture setup, never an API grant or auth bypass.
  sql(runtime,database,`INSERT INTO clinical.content_governance_authorities
    (id,person_id,action,content_type,governed_content_key,effective_scope_key,
     facility_id,issued_by,evidence_ref,evidence_producer_id,evidence_verified_at,
     source_identity,source_evidence_identity,status,valid_from,version)
    SELECT gen_random_uuid(),'f0110000-0000-4000-8000-000000000003',action,
      content_type,governed_content_key,effective_scope_key,facility_id,issued_by,
      gen_random_uuid(),evidence_producer_id,evidence_verified_at,source_identity,
      'synthetic-k08-pharmacist-disclosure','active',valid_from,1
    FROM clinical.content_governance_authorities
    WHERE id='f011c000-0000-4000-8400-000000000004';`);
  const checks = [];
  const mutations = new Set();
  const context = (sample,action) => Object.entries({environment:'local',person_id:`f0110000-0000-4000-8000-${String(sample.n).padStart(12,'0')}`,actor_role:sample.role,action,aal:'2',purposes:'synthetic.feature011',facility_id:sample.role==='PAT'?'':'f0110000-0000-4000-8200-000000000001',encounter_id:sample.role==='CLN'?'f0110000-0000-4000-8400-000000000001':'',request_id:sample.input.responseRequestId,idempotency_key:sample.key,request_hash:'a'.repeat(64)}).map(([key,value])=>`SELECT set_config(${quote('shifaa.'+key)},${quote(value)},true);`).join('\n');
  const api = (sample,action,query) => sql(runtime,database,`BEGIN; ${context(sample,action)} ${query} ROLLBACK;`,{user:'shifaa_api'});
  const observe = sample => {
    const result = sample.response.domain;
    if (result.replay) return;
    mutations.add(sample.action);
    // A committed retry must not reproduce domain protection/evidence preparation.
    const replayInput = structuredClone(sample.input);
    for (const field of ['preparation','handoff','materialBindings','signing'])
      if (Object.hasOwn(replayInput,field)) replayInput[field] = null;
    const replayExpression = sample.expression.replace(json(sample.input),json(replayInput));
    const probeInput = structuredClone(replayInput);
    if (sample.action==='publishClinicalContentRelease')
      for (const field of ['artifactVersion','artifactDigest','confirmPublication']) probeInput[field] = null;
    const probeExpression = sample.expression.replace(json(sample.input),json(probeInput));
    const snapshot = () => sql(runtime,database,`SELECT json_build_object(
      'allergies',(SELECT count(*) FROM clinical.allergies),
      'releases',(SELECT count(*) FROM clinical.content_releases),
      'signatures',(SELECT count(*) FROM audit.signature_evidence),
      'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),
      'receipts',(SELECT count(*) FROM clinical.mutation_receipts),
      'obligations',(SELECT count(*) FROM clinical.mutation_commit_obligations),
      'idempotency',(SELECT count(*) FROM platform.idempotency_records));`).stdout;
    const before = snapshot(), freshSample = {...sample,key:randomUUID()};
    const absence = sql(runtime,database,`BEGIN; ${context(freshSample,sample.action)} SELECT ${probeExpression}; COMMIT;`,{user:'shifaa_api',allowFailure:true});
    assert.equal(absence.exitCode,3);
    assert.match(absence.stderr,/22023: F011_FRESH_PREPARATION_REQUIRED/);
    assert.equal(snapshot(),before,'Scope absence probe rolls back all state');
    checks.push({operation:sample.action,assertion:'AUTHORITATIVE_CLAIM_SETTLED_ABSENCE_AND_NO_EFFECT',result:'PASS'});
    const replay = last(api(sample,sample.action,`SELECT ${replayExpression};`));
    assert.equal(replay.replay,true);
    for (const field of ['receiptId','operationId','resourceType','resourceId','resourceVersion','responseStatus','responseEtag','responseLanguage','responseRequestId']) assert.equal(replay[field],result[field],`${sample.action} original replay ${field}`);
    checks.push({operation:sample.action,assertion:'ORIGINAL_REPLAY_TUPLE',result:'PASS'});
    if (sample.action==='signClinicalContentRelease') {
      assert.ok(Value.Check(Feature011SignReleaseResponseSchema,result.response), 'Exact generated SignReleaseResponse: '+JSON.stringify([...Value.Errors(Feature011SignReleaseResponseSchema,result.response)].map(({path,message})=>({path,message}))));
      const actual = last(sql(runtime,database,`SELECT json_build_object('id',id,'signedAt',signed_at,'digest',encode(artifact_digest,'hex')) FROM audit.signature_evidence WHERE id=${quote(result.response.signature.signatureId)}::uuid;`));
      assert.equal(actual.id,result.response.signature.signatureId);
      assert.equal(Date.parse(actual.signedAt),Date.parse(result.response.signature.signedAt));
      assert.equal(actual.digest,result.response.signature.artifactDigest);
      const assigned = last(api(sample,'listClinicalContent',`SELECT clinical.list_clinical_content_api_v1('synthetic',${json({projection:'assigned_review',releaseId:result.resourceId})});`));
      assert.equal(assigned.length,1);
      assert.equal(Object.hasOwn(assigned[0],'signatures'),false);
      assert.equal(Object.hasOwn(assigned[0],'signerPersonId'),false);
      checks.push({operation:sample.action,assertion:'PERSISTED_SIGNATURE_MAPPING_AND_BOUNDED_ASSIGNED_REVIEW',result:'PASS'});
    }
    if (sample.role==='ADM-MEDICAL') {
      const governance = last(api(sample,'listClinicalContent',`SELECT clinical.list_clinical_content_api_v1('synthetic',${json({projection:'governance',releaseId:result.resourceId})});`));
      assert.equal(governance.length,1);
      assert.equal(governance[0].releaseId,result.resourceId);
      checks.push({operation:sample.action,assertion:'EXACT_RELEASE_GOVERNANCE_PROJECTION',result:'PASS'});
    }
  };
  const components = consumerComponents(runtime,database,observe);
  assert.deepEqual([...mutations].sort(),['createAllergy','verifyAllergy','createClinicalContentRelease','signClinicalContentRelease','publishClinicalContentRelease'].sort());
  return {result:'PASS',mutations:[...mutations].sort(),checks,components,syntheticStructuralOnly:true,cryptoExecuted:false};
}
