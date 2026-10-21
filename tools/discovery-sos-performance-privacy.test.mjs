import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { test } from 'node:test';
import { sosReplayHasProhibitedData } from './discovery-sos-performance-privacy.ts';

const key = Buffer.alloc(32, 7);
function protect(value) {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32BE(1731, 8);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ kind: 'json', value })),
    cipher.final(),
  ]);
  return {
    encoding: 'aes-256-gcm-v1',
    nonce: nonce.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

test('incidental prohibited text in authenticated ciphertext is not a plaintext leak', () => {
  const response = { message: 'Synthetic opaque replay '.repeat(500) };
  const envelope = protect(response);
  assert.match(envelope.ciphertext, /token/i, 'Reproduce the original SQL regex failure');
  assert.equal(sosReplayHasProhibitedData(envelope, key, response), false);
});

for (const field of ['token', 'phone_e164', 'secret', 'diagnosis', 'medication'])
  test(`the original prohibited-data scan still rejects decrypted ${field}`, () => {
    const response = { nested: { [field]: 'SYNTHETIC' } };
    assert.equal(sosReplayHasProhibitedData(protect(response), key, response), true);
  });

test('plaintext, extra fields, malformed encoding, tampering and mismatched replay fail closed', () => {
  const response = { incident_id: 'SYNTHETIC' };
  const envelope = protect(response);
  for (const invalid of [
    response,
    { ...envelope, extra: 'SYNTHETIC' },
    { ...envelope, encoding: 'plaintext' },
    { ...envelope, nonce: 'AA' },
    { ...envelope, tag: Buffer.alloc(16).toString('base64url') },
    { ...envelope, ciphertext: 'AA' },
  ])
    assert.throws(() => sosReplayHasProhibitedData(invalid, key, response));
  assert.throws(() => sosReplayHasProhibitedData(envelope, key, { incident_id: 'OTHER' }));
  assert.throws(() => sosReplayHasProhibitedData(envelope, Buffer.alloc(32), response));
});
