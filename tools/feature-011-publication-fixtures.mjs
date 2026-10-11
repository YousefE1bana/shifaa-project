// Test-only neutral admission/context; all online actions still use approved native/non-owner paths.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withSigning } from './run-feature-011-sign-api-test.mjs';
import { request as initial } from './run-feature-011-content-api-test.mjs';
import { Feature011Publication } from '../services/api/src/modules/feature-011/publish-release.ts';
import { sql } from './run-feature-011-postgres-test.mjs';
import { governedOfflineProof } from './feature-011-offline-proof.mjs';
export const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
export const person = (n) => 'f0110000-0000-4000-8000-' + String(n).padStart(12, '0');
export const instant = () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
export function publicationRow(h, id) {
  return h.owner(
    `SELECT json_build_object('releaseId',r.id,'artifactVersion',r.artifact_version,'artifactDigest',encode(r.artifact_digest,'hex'),'workflowVersion',r.workflow_version,'contentType',s.content_type,'governedContentKey',s.governed_content_key,'effectiveScopeKey',s.effective_scope_key) FROM clinical.content_releases r JOIN clinical.content_series s ON s.id=r.series_id WHERE r.id=${quote(id)}::uuid;`,
  );
}
export async function withPublication(runtime, work, configure) {
  return withSigning(
    runtime,
    async (h) => {
      const offline = await governedOfflineProof(
        runtime,
        h.database,
        (identity) => ({ mode: 'isolated-synthetic', sourceIdentity: identity, now: instant }),
        () => {},
      );
      const publish = (id, options = {}) => {
        const r = publicationRow(h, id);
        return h.request(
          'POST',
          {
            artifactVersion: r.artifactVersion,
            artifactDigest: r.artifactDigest,
            confirmPublication: true,
          },
          {
            actor: 'publisher',
            url: `/v1/admin/clinical-content/releases/${id}/publish`,
            headers: { 'if-match': '"' + (options.version ?? r.workflowVersion) + '"' },
            ...options,
          },
        );
      };
      const ready = async ({ request = initial, validUntil = null } = {}) => {
        const res = await h.content(request);
        assert.equal(res.statusCode, 201, res.body);
        const id = res.json().releaseId,
          r = publicationRow(h, id),
          approval = randomUUID();
        sql(
          runtime,
          h.database,
          `INSERT INTO clinical.content_admissibility_evidence(id,release_id,artifact_version,artifact_digest,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,synthetic,status,valid_from,valid_until,version) VALUES(${quote(approval)}::uuid,${quote(id)}::uuid,${r.artifactVersion},decode(${quote(r.artifactDigest)},'hex'),${quote(r.contentType)},${quote(r.governedContentKey)},${quote(r.effectiveScopeKey)},${quote(randomUUID())}::uuid,'synthetic-policy-v1',decode(repeat('b',64),'hex'),${quote(randomUUID())}::uuid,${quote(randomUUID())}::uuid,${quote(randomUUID())}::uuid,${quote(randomUUID())}::uuid,'synthetic.exact-admission',${quote(randomUUID())},true,'active','2020-01-01',${validUntil === null ? 'NULL' : quote(validUntil)},1);`,
        );
        await offline.admission(approval);
        for (const n of [2, 3]) {
          const signed = await h.sign(id, h.issue(id, n));
          assert.equal(signed.statusCode, 200, signed.body);
        }
        return { id, approval };
      };
      try {
        return await work({ ...h, publish, ready, offline });
      } finally {
        await offline.finish();
      }
    },
    {
      additionalActors: [['publisher', 6]],
      configure: async (args) => {
        const owner = (query) => JSON.parse(sql(args.runtime, args.database, query).stdout.trim());
        const publication = new Feature011Publication({
          ...args.deps,
          context: { select: async (_actor, id) => publicationRow({ owner }, id) },
        });
        return { publication, ...(await configure?.({ ...args, owner })) };
      },
    },
  );
}
