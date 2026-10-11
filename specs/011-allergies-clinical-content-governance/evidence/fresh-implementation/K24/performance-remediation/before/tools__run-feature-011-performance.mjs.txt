import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runtimes, runtimeManifest, digest } from './run-feature-011-postgres-test.mjs';
import {
  currentPhysicalSourceDigests,
  verifyFeature011Contracts,
} from './verify-feature-011-contracts.mjs';
import {
  withOperationalAllergies,
  withOperationalContent,
  report,
  initial,
  provisionSupport,
  verificationBody,
  admitDraft,
  successor,
} from './feature-011-ops-fixtures.mjs';
export const sampleCount = 20;
export const warmups = 3;
export function percentile95(samples) {
  assert(samples.length > 0 && samples.every((n) => Number.isFinite(n) && n >= 0));
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
}
export async function runPerformance() {
  const parity = await verifyFeature011Contracts();
  assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
  const pins = currentPhysicalSourceDigests();
  const inputPaths = [
    'tools/run-feature-011-performance.mjs',
    'tools/feature-011-ops-fixtures.mjs',
    'services/api/src/modules/feature-011/allergies.ts',
    'services/api/src/modules/feature-011/observability.ts',
    'services/api/src/app.ts',
  ];
  const inputs = Object.fromEntries(inputPaths.map((path) => [path, digest(path)]));
  const results = [];
  for (const runtime of runtimes) {
    const measurements = {};
    const measure = async (operation, work, expectedStatus, warmup) => {
      const start = performance.now();
      const response = await work();
      const duration = performance.now() - start;
      assert.equal(response.statusCode, expectedStatus, operation + ': ' + response.statusCode);
      const record = (measurements[operation] ??= {
        samplesMs: [],
        warmupsMs: [],
        targetMs: operation.startsWith('list') ? 400 : 800,
      });
      (warmup ? record.warmupsMs : record.samplesMs).push(duration);
      return response;
    };
    console.log(runtime.name + ': all seven operations, 20 samples + 3 warmups');
    const allergies = await withOperationalAllergies(runtime, async (h) => {
      for (let i = 0; i < sampleCount + warmups; i++) {
        const warming = i < warmups;
        const created = await measure(
          'createAllergy',
          () => h.request('POST', report),
          201,
          warming,
        );
        const revision = created.json();
        const support = provisionSupport(h, revision);
        const body = verificationBody(support);
        const options = {
          actor: 'clinician',
          url: `/v1/allergies/${revision.allergyId}/verification`,
          headers: { 'if-match': '"1"' },
        };
        await measure('verifyAllergy', () => h.request('POST', body, options), 200, warming);
        await measure('listAllergies', () => h.request('GET'), 200, warming);
      }
      assert.equal(h.counters().externalUnderLocks, 0);
      return { counters: h.counters(), populated: h.snapshot(), database: h.database };
    });
    const content = await withOperationalContent(runtime, async (h) => {
      let previous = null;
      for (let i = 0; i < sampleCount + warmups; i++) {
        const warming = i < warmups;
        const request = previous ? successor(previous, i + 1) : initial;
        const created = await measure(
          'createClinicalContentRelease',
          () => h.content(request),
          201,
          warming,
        );
        const release = created.json();
        await admitDraft(h, release.releaseId);
        for (const n of [2, 3]) {
          const body = h.issue(release.releaseId, n);
          const options = {
            actor: n === 2 ? 'clinician' : 'pharmacist',
            url: `/v1/admin/clinical-content/releases/${release.releaseId}/signatures`,
            headers: { 'if-match': '"' + (n === 2 ? 1 : 2) + '"' },
          };
          await measure(
            'signClinicalContentRelease',
            () => h.request('POST', body, options),
            200,
            warming,
          );
        }
        const publication = {
          artifactVersion: release.artifactVersion,
          artifactDigest: release.artifactDigest,
          confirmPublication: true,
        };
        const options = {
          actor: 'publisher',
          url: `/v1/admin/clinical-content/releases/${release.releaseId}/publish`,
          headers: { 'if-match': '"3"' },
        };
        await measure(
          'publishClinicalContentRelease',
          () => h.request('POST', publication, options),
          200,
          warming,
        );
        await measure(
          'listClinicalContent',
          () =>
            h.request('GET', undefined, {
              actor: 'medical',
              url:
                '/v1/admin/clinical-content/synthetic?projection=governance&releaseId=' +
                release.releaseId,
            }),
          200,
          warming,
        );
        previous = release.releaseId;
      }
      assert.equal(h.counters().externalUnderLocks, 0);
      return {
        counters: h.counters(),
        dataset: h.owner(
          "SELECT json_build_object('releases',(SELECT count(*) FROM clinical.content_releases),'signatures',(SELECT count(*) FROM audit.signature_evidence WHERE resource_type='clinical.content_release'),'receipts',(SELECT count(*) FROM clinical.mutation_receipts));",
        ),
        database: h.database,
      };
    });
    assert.equal(Object.keys(measurements).length, 7);
    for (const [operation, measured] of Object.entries(measurements)) {
      assert.equal(
        measured.samplesMs.length,
        operation === 'signClinicalContentRelease' ? 2 * sampleCount : sampleCount,
      );
      measured.p95Ms = percentile95(measured.samplesMs);
      measured.localThresholdMet = measured.p95Ms <= measured.targetMs;
    }
    results.push({
      runtime: runtime.name,
      identity: runtimeManifest(runtime),
      measurements,
      allergies,
      content,
    });
  }
  assert.deepEqual(currentPhysicalSourceDigests(), pins);
  for (const [path, hash] of Object.entries(inputs))
    assert.equal(digest(path), hash, 'Source changed during load');
  const allLocalThresholdsMet = results.every((runtime) =>
    Object.values(runtime.measurements).every((measurement) => measurement.localThresholdMet),
  );
  const proof = {
    checkpoint: 'K23',
    task: 'T085',
    result: allLocalThresholdsMet ? 'PASS_LOCAL_ENGINEERING' : 'FAIL_LOCAL_THRESHOLDS',
    allLocalThresholdsMet,
    inputs,
    capturedAt: new Date().toISOString(),
    sourceDigests: pins,
    profile: {
      synthetic: true,
      topology:
        'Windows host -> Fastify inject -> native Supabase Auth HTTP loopback -> non-owner postgres pool -> Docker PostgreSQL',
      node: process.version,
      os: os.type(),
      release: os.release(),
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      memoryBytes: os.totalmem(),
      concurrency: 1,
      samplesPerOperation: sampleCount,
      signingSamples: 2 * sampleCount,
      warmups,
      network: 'loopback; no WAN/region/device emulation',
      transport: 'in-process Fastify injection; not browser or WAN load',
      vendors: 'none; local real AES and synthetic immutable Evidence Port',
      vendorTimeExcludedMs: 0,
      testControlOverhead:
        'private provenance/context source uses owner docker psql; included in elapsed time',
      workload:
        'fresh mutations; independently signed successive past-effective releases; separate synthetic patient reports/confirmations; narrow reads',
    },
    runtimes: results,
    targets: {
      readP95Ms: 400,
      mutationP95Ms: 800,
      origin: 'approved NFR-PERF-002; no invented thresholds',
    },
    formalAcceptance: 'BLOCKED_OPEN-TECH-003',
    productionSloDrApproval: false,
    pendingReferenceDecisions: [
      'owner identity and documented disposition',
      'reference client CPU/RAM/OS/browser/accessibility device',
      'deployment region/topology and DB/API sizing',
      'network RTT/bandwidth/loss and cache state',
      'dataset volume/history/cardinality/material sizes',
      'arrival/concurrency/read-write mix/warmup/sample duration',
      'external vendor exclusions and measurement clock/boundary',
      'repeatability, percentile estimator and acceptance tolerances against existing 400/800ms requirements',
    ],
    retainedGates: 'UNCHANGED_OPEN',
  };
  const directory =
    'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K23';
  mkdirSync(directory, { recursive: true });
  writeFileSync(directory + '/performance-proof.json', JSON.stringify(proof, null, 2) + '\n');
  console.log(
    JSON.stringify(
      results.map((r) => ({
        runtime: r.runtime,
        operations: Object.fromEntries(
          Object.entries(r.measurements).map(([operation, m]) => [
            operation,
            { p95Ms: m.p95Ms, localThresholdMet: m.localThresholdMet },
          ]),
        ),
      })),
    ),
  );
  if (!allLocalThresholdsMet) process.exitCode = 1;
  return proof;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await runPerformance();
