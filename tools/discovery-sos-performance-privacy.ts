import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';

export function sosReplayHasProhibitedData(
  envelope: unknown,
  key: Uint8Array,
  expectedResponse: unknown,
): boolean {
  assert.ok(envelope && typeof envelope === 'object' && !Array.isArray(envelope));
  const stored = envelope as Record<string, unknown>;
  assert.deepEqual(Object.keys(stored).sort(), ['ciphertext', 'encoding', 'nonce', 'tag']);
  assert.equal(stored.encoding, 'aes-256-gcm-v1');
  const bytes = (field: string, length?: number) => {
    const encoded = stored[field];
    assert.equal(typeof encoded, 'string');
    assert.match(encoded as string, /^[A-Za-z0-9_-]+$/);
    const decoded = Buffer.from(encoded as string, 'base64url');
    assert.equal(decoded.toString('base64url'), encoded);
    if (length !== undefined) assert.equal(decoded.length, length);
    return decoded;
  };
  const decipher = createDecipheriv('aes-256-gcm', key, bytes('nonce', 12));
  decipher.setAuthTag(bytes('tag', 16));
  const payload: unknown = JSON.parse(
    Buffer.concat([decipher.update(bytes('ciphertext')), decipher.final()]).toString('utf8'),
  );
  assert.deepEqual(payload, { kind: 'json', value: expectedResponse });
  // Ciphertext is random base64url and can itself spell a forbidden word.
  // Scan authenticated plaintext, while requiring the exact encrypted envelope.
  return /token|phone_e164|secret|diagnos|medicat/i.test(JSON.stringify(expectedResponse));
}
