import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig } from '../config.js';
import { DisabledValifyProofingProvider } from './production-disabled.js';
import { LocalProofingProvider } from './local-proofing.js';
import { LocalQuarantineUploadStore } from './local-upload.js';

describe('synthetic adapters', () => {
  it.each(['verified', 'pending', 'manual_review', 'failed', 'timeout'] as const)(
    'preserves the %s proofing outcome',
    async (outcome) => {
      const adapter = new LocalProofingProvider(new Map([[`fixture-${outcome}`, outcome]]));
      await expect(
        adapter.verify({
          identityType: 'passport',
          value: `fixture-${outcome}`,
          issuingCountry: 'EG',
        }),
      ).resolves.toMatchObject({ outcome });
    },
  );

  it('creates only quarantined, short-lived, random upload intents', async () => {
    const adapter = new LocalQuarantineUploadStore();
    await expect(
      adapter.createIntent({
        caseId: '00000000-0000-4000-8000-000000000001',
        mimeType: 'image/png',
        sizeBytes: 1_024,
        sha256: 'a'.repeat(64),
      }),
    ).resolves.toMatchObject({ state: 'quarantine' });
    await expect(
      adapter.createIntent({
        caseId: '00000000-0000-4000-8000-000000000001',
        mimeType: 'image/png',
        sizeBytes: 10_485_761,
        sha256: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'upload-size-rejected' });
  });

  it('keeps Valify and every local adapter production-disabled', async () => {
    await expect(new DisabledValifyProofingProvider().verify()).rejects.toMatchObject({
      code: 'production-integration-disabled',
    });
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrowError(ConfigurationError);
  });
});
