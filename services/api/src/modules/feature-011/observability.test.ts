import assert from 'node:assert/strict';
import { test } from 'vitest';
import Fastify from 'fastify';
import { installFeature011Telemetry, type Feature011Telemetry } from './observability.js';

test('telemetry emits closed opaque records and excludes request, response and error material', async () => {
  const app = Fastify({ logger: false });
  const records: Feature011Telemetry[] = [];
  installFeature011Telemetry(app, (record) => records.push(record));
  app.post('/v1/patients/:managedPatientId/allergies', async () => {
    throw Error('PRIVATE_ERROR_SENTINEL');
  });
  app.get('/unrelated', async () => ({ private: 'PRIVATE_RESPONSE_SENTINEL' }));
  try {
    await app.inject({
      method: 'POST',
      url: '/v1/patients/private-patient/allergies',
      headers: { 'x-request-id': 'PRIVATE_HEADER_SENTINEL' },
      payload: { keyRef: 'PRIVATE_BODY_SENTINEL' },
    });
    await app.inject('/unrelated');
    assert.equal(records.length, 1);
    assert.equal(records[0]?.operation, 'createAllergy');
    assert.equal(records[0]?.outcome, 'unavailable');
    assert.match(records[0]!.correlation, /^[a-f0-9-]{36}$/);
    assert(Number.isFinite(records[0]!.durationMs) && records[0]!.durationMs >= 0);
    assert.deepEqual(Object.keys(records[0]!).sort(), [
      'correlation',
      'durationMs',
      'operation',
      'outcome',
    ]);
    assert(!JSON.stringify(records).includes('PRIVATE_'));
    assert(Object.isFrozen(records[0]));
  } finally {
    await app.close();
  }
});

test('a failing telemetry sink cannot turn a completed mutation into a retry or denial', async () => {
  const app = Fastify({ logger: false });
  let effects = 0;
  installFeature011Telemetry(app, () => {
    throw Error('sink unavailable');
  });
  app.post('/v1/patients/:managedPatientId/allergies', async (_request, reply) => {
    effects++;
    return reply.code(201).send({ ok: true });
  });
  try {
    const response = await app.inject({ method: 'POST', url: '/v1/patients/opaque/allergies' });
    assert.equal(response.statusCode, 201);
    assert.equal(effects, 1);
  } finally {
    await app.close();
  }
});
