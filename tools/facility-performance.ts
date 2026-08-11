import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { buildApp } from '../services/api/src/app.ts';

const samples = 100;
const percentile95 = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] ?? Infinity;
async function main() {
  const { app } = await buildApp();
  try {
    const mutations = await Promise.all(
      Array.from({ length: samples }, async (_, index) => {
        const person = `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
        const started = performance.now();
        const response = await app.inject({
          method: 'POST',
          url: '/v1/facilities',
          headers: {
            authorization: `Bearer synthetic-person:${person}`,
            'idempotency-key': `performance-facility-${String(index).padStart(4, '0')}`,
          },
          payload: {
            facility_type: ['clinic', 'pharmacy', 'hospital', 'laboratory'][index % 4],
            name_ar: `منشأة أداء اصطناعية ${index}`,
            name_en: `Synthetic performance facility ${index}`,
            governorate_code: 'CA',
            city: 'Cairo',
            district: 'Synthetic',
            address_line: 'Synthetic load profile only',
          },
        });
        assert.equal(response.statusCode, 201);
        return { duration: performance.now() - started, person, id: response.json().id as string };
      }),
    );
    const reads = await Promise.all(
      mutations.map(async ({ person, id }) => {
        const started = performance.now();
        const response = await app.inject({
          method: 'GET',
          url: `/v1/facilities/${id}`,
          headers: { authorization: `Bearer synthetic-person:${person}` },
        });
        assert.equal(response.statusCode, 200);
        return performance.now() - started;
      }),
    );
    const mutationP95 = percentile95(mutations.map(({ duration }) => duration));
    const readP95 = percentile95(reads);
    const evidence = {
      generated_at: new Date().toISOString(),
      mode: 'seeded-synthetic Fastify inject, 100 concurrent sessions',
      samples,
      thresholds_ms: { read_p95: 400, mutation_p95: 800 },
      measured_ms: {
        read_p95: Number(readP95.toFixed(2)),
        mutation_p95: Number(mutationP95.toFixed(2)),
      },
      result: readP95 <= 400 && mutationP95 <= 800 ? 'PASS' : 'FAIL',
    };
    await writeFile(
      new URL('../specs/003-facility-onboarding-rbac/evidence/performance.json', import.meta.url),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
    assert.equal(evidence.result, 'PASS');
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    await app.close();
  }
}
void main();
