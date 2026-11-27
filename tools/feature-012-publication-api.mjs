// K17 port for the fixed, run-owned Core API/Auth topology. Only synthetic
// material and evidence ports are injected; the routes and SQL stores are real.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { buildApp } from '../services/api/src/app.ts';
import { loadConfig } from '../services/api/src/config.ts';
import { PostgresFeature011Content } from '../services/api/src/adapters/postgres/feature-011-content.ts';
import { Feature011Content } from '../services/api/src/modules/feature-011/create-release.ts';
import { Feature011Signing } from '../services/api/src/modules/feature-011/sign-release.ts';
import { Feature011Publication } from '../services/api/src/modules/feature-011/publish-release.ts';
import { Feature011Governance } from '../services/api/src/modules/feature-011/list-clinical-content.ts';

assert.equal(import.meta.dirname, '/tmp/f012-core-api/tools');
const postgres = createRequire('/opt/deps/services/api/package.json')('postgres');
const [action, signingKeyId] = process.argv.slice(2);
const input = JSON.parse(readFileSync(0, 'utf8'));
const fixtures = JSON.parse(readFileSync('/tmp/f012-admission-fixtures.json', 'utf8'));
const fixture = fixtures[[2, 3, 5, 6].indexOf(input.actor)];
assert.ok(fixture?.token);
const [header, claims] = fixture.token
  .split('.')
  .slice(0, 2)
  .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()));
assert.equal(header.alg, 'ES256');
assert.equal(header.kid, signingKeyId);
assert.equal(claims.aal, 'aal2');
assert.equal(claims.session_id, fixture.session);
assert.equal(claims.sub, fixture.subject);
const password = process.env.F012_CORE_API_PASSWORD;
assert.match(password, /^[a-f0-9]{64}$/);
const issuer = 'http://auth:9999';
const config = loadConfig({
  NODE_ENV: 'test',
  SHIFAA_SYNTHETIC_MODE: 'true',
  FEATURE_011_ENABLED: 'true',
  FEATURE_011_ISOLATED_TEST: 'true',
  FEATURE_011_KILL_SWITCH: 'false',
  AUTH_ADAPTER: 'supabase',
  REPOSITORY_ADAPTER: 'postgres',
  DATABASE_URL: `postgresql://shifaa_api:${password}@db:5432/postgres`,
  SUPABASE_URL: issuer,
  SUPABASE_ANON_KEY: 'unused-disposable-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-disposable-service-key',
  SUPABASE_JWKS_URL: issuer + '/.well-known/jwks.json',
  SUPABASE_JWT_ISSUER: issuer,
});
const pool = postgres(config.databaseUrl, { max: 2, prepare: false, onnotice() {} });
const repository = new PostgresFeature011Content(pool);
const now = () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
const {
  positive: [vector],
} = JSON.parse(
  readFileSync(
    new URL(
      '../specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1-vectors.json',
      import.meta.url,
    ),
  ),
);
const key = readFileSync('/tmp/f012-publication-key');
const keyRef = 'synthetic-local/k17/versions/1';
const provider = {
  async prepare(_purpose, exact) {
    assert.ok(exact === undefined || exact === keyRef);
    return { key: Buffer.from(key), keyRef, immutable: true, release() {} };
  },
};
const material = {
  async resolve(kind, reference) {
    assert.equal(
      reference,
      vector.facts.evidence[kind].ref,
      'Unexpected neutral material reference',
    );
    return {
      kind,
      reference,
      sourceIdentity: 'synthetic.k15',
      sourceEvidenceIdentity: reference,
      bytes: Buffer.from(vector.materialBytesHex[kind], 'hex'),
    };
  },
};
const evidence = { mode: 'isolated-synthetic', sourceIdentity: 'synthetic.k15', now };
const deps = { repository, provider, material, evidence };
const publication = new Feature011Publication({
  ...deps,
  context: {
    async select() {
      return { contentType: 'synthetic' };
    },
  },
});
const signing = new Feature011Signing({
  store: repository.receipts,
  provider,
  evidence: { ...evidence, sourceIdentity: 'synthetic.signing' },
  context: {
    async select(actor, releaseId, capacity) {
      assert.equal(actor.personId, input.signature.signerPersonId);
      assert.equal(releaseId, input.signature.releaseId);
      assert.equal(capacity, input.signature.capacity);
      return input.selection;
    },
  },
  source: {
    async verify(request, basis) {
      const result = input.signature;
      assert.deepEqual(
        request,
        Object.fromEntries(Object.keys(request).map((name) => [name, result[name]])),
      );
      assert.deepEqual(basis, input.selection.basis);
      return {
        selector: result.evidenceRef,
        sourceEvidenceIdentity: result.sourceEvidenceIdentity,
        result,
      };
    },
  },
});
const reading = new Feature011Governance({
  repository,
  material,
  evidence,
  cursorKey: randomBytes(32),
  context: {
    async resolve() {
      return { role: 'CLN', facilityId: 'f0110000-0000-4000-8200-000000000001' };
    },
  },
});
const base = '/v1/admin/clinical-content';
const headers = {
  authorization: 'Bearer ' + fixture.token,
  'accept-language': 'en-EG',
  'x-purpose': 'synthetic.feature011',
  'x-request-id': input.requestId,
  ...(input.key ? { 'idempotency-key': input.key } : {}),
  ...(input.version ? { 'if-match': '"' + input.version + '"' } : {}),
};
const routes = {
  draft: [
    'POST',
    base + '/synthetic/releases',
    {
      governedContentKey: vector.facts.series.governedContentKey,
      effectiveScopeKey: vector.facts.series.effectiveScopeKey,
      source:
        vector.facts.source.reference === null
          ? { display: vector.facts.source.display }
          : vector.facts.source,
      effectiveAt: input.effectiveAt ?? vector.facts.effectiveAt,
      predecessor: input.parent
        ? { initial: false, supersedesReleaseId: input.parent }
        : vector.facts.predecessor,
      artifact: {
        contentEvidenceRef: vector.facts.evidence.content.ref,
        codeEvidenceRef: vector.facts.evidence.code.ref,
        testVectorEvidenceRef: vector.facts.evidence.testVectors.ref,
        ...(!input.parent ? { declaredDigest: vector.sha256 } : {}),
      },
    },
  ],
  sign: [
    'POST',
    base + '/releases/' + input.id + '/signatures',
    {
      capacity: input.signature?.capacity,
      decision: 'approved',
      artifactVersion: input.signature?.artifactVersion,
      artifactDigest: input.signature?.artifactDigest,
      signingEvidenceRef: input.signature?.evidenceRef,
      reason: 'Restricted K17 synthetic reason',
    },
  ],
  publish: [
    'POST',
    base + '/releases/' + input.id + '/publish',
    {
      artifactVersion: input.artifactVersion,
      artifactDigest: input.artifactDigest,
      confirmPublication: true,
    },
  ],
  status: [
    'GET',
    base +
      '/synthetic?' +
      new URLSearchParams({
        projection: 'status',
        governedContentKey: vector.facts.series.governedContentKey,
        effectiveScopeKey: vector.facts.series.effectiveScopeKey,
      }),
  ],
};
let app;
try {
  const [binding] = await pool`SELECT session_user AS session, current_user AS effective,
    current_database() AS database, host(inet_server_addr()) AS address`;
  assert.equal(binding.session, 'shifaa_api');
  assert.equal(binding.effective, 'shifaa_api');
  assert.equal(binding.database, 'postgres');
  ({ app } = await buildApp({
    config,
    feature011Content: new Feature011Content(deps),
    feature011Signing: signing,
    feature011Publication: publication,
    feature011Governance: reading,
  }));
  const [method, url, payload] = routes[action];
  const result = await app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  const body = result.json();
  const {
    releaseId,
    artifactVersion,
    artifactDigest,
    workflowVersion,
    eligibility,
    supersedesReleaseId,
  } = body;
  console.log(
    JSON.stringify({
      status: result.statusCode,
      etag: result.headers.etag,
      ...(result.statusCode >= 400 ? { errorCode: body.code ?? body.type } : {}),
      releaseId,
      artifactVersion,
      artifactDigest,
      workflowVersion,
      eligibility,
      supersedesReleaseId,
      ...(action === 'status' && result.statusCode === 200
        ? { current: body.data.map((row) => row.releaseId) }
        : {}),
      ...(action === 'publish' && result.statusCode === 200
        ? {
            responseSha256: (await import('node:crypto'))
              .createHash('sha256')
              .update(result.rawPayload)
              .digest('hex'),
          }
        : {}),
      binding,
      subject: fixture.subject,
      session: fixture.session,
      aal: claims.aal,
    }),
  );
} finally {
  await app?.close();
  await pool.end({ timeout: 2 });
  key.fill(0);
}
