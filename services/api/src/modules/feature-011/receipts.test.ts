import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { it, expect } from 'vitest';
import {
  receiptAad,
  serializeResponse,
  responseHeaders,
  executeReceipt,
  type ReceiptStore,
} from './mutation-receipts.js';
import { prepareCapability } from './protection.js';
const vectors = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../specs/011-allergies-clinical-content-governance/contracts/mutation-receipt-v1-vectors.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
for (const v of vectors.positive) {
  it(v.id + ' exact generated body bytes/AAD/header tuple', () => {
    expect(serializeResponse(v.operationId, v.body, v.aadFacts).toString('hex')).toBe(
      v.expectedCanonicalBody.hex,
    );
    expect(receiptAad(v.aadFacts).toString('hex')).toBe(v.expectedAad.hex);
    expect(responseHeaders(v.aadFacts)).toEqual(v.headers);
  });
}
it('receipt local AES only; exact tuple/context/version tamper denial', async () => {
  const v = vectors.positive[0],
    key = randomBytes(32);
  const p = {
    async prepare() {
      return { key: Buffer.from(key), keyRef: v.aadFacts.keyRef, immutable: true, release() {} };
    },
  };
  const enc = await prepareCapability(p, 'receipt', 'encrypt'),
    dec = await prepareCapability(p, 'receipt', 'decrypt', v.aadFacts.keyRef);
  const bytes = serializeResponse(v.operationId, v.body, v.aadFacts),
    aad = receiptAad(v.aadFacts);
  const envelope = enc.encrypt(bytes, aad);
  expect(dec.decrypt(envelope, aad)).toEqual(bytes);
  for (const change of [
    { responseLanguage: 'ar-EG' },
    { responseResourceVersion: '2', responseETag: '"2"' },
    { receiptId: v.aadFacts.idempotencyRecordId },
  ])
    expect(() => dec.decrypt(envelope, receiptAad({ ...v.aadFacts, ...change }))).toThrow();
  expect(() =>
    serializeResponse(v.operationId, { ...v.body, secret: 'forbidden' }, v.aadFacts),
  ).toThrow();
  expect(() =>
    serializeResponse(v.operationId, v.body, {
      ...v.aadFacts,
      responseResourceVersion: '2',
      responseETag: '"2"',
    }),
  ).toThrow();
  expect(() => enc.decrypt(envelope, aad)).toThrow();
  enc.dispose();
  dec.dispose();
});
it('serializer failure rolls back all components and disposes capability', async () => {
  const v = vectors.positive[0];
  let durable = 0,
    released = 0,
    prepared = 0;
  const p = {
    async prepare() {
      prepared++;
      return {
        key: randomBytes(32),
        keyRef: v.aadFacts.keyRef,
        immutable: true,
        release() {
          released++;
        },
      };
    },
  };
  const store: ReceiptStore = {
    async probe() {
      return undefined;
    },
    async mutate(_scope, _input, work) {
      const result = work(v.aadFacts, {});
      durable++;
      return { value: result.http };
    },
    async replay() {
      throw new Error('unexpected replay');
    },
  };
  await expect(
    executeReceipt(
      {
        operationId: v.operationId,
        targetId: v.aadFacts.targetResourceId,
        contentType: 'synthetic',
        expectedVersion: 1,
        input: {},
        context: {},
      },
      {
        store,
        provider: p,
        authorize: async () => {},
        authorizeDisclosure: async () => {},
        prepare: async () => ({
          input: {},
          compose: () => {
            throw new Error('serializer-fault');
          },
          dispose() {},
        }),
      },
    ),
  ).rejects.toThrow('serializer-fault');
  expect(durable).toBe(0);
  expect(prepared).toBe(1);
  expect(released).toBe(1);
});
