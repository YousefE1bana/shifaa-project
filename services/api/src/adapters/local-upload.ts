import { randomUUID } from 'node:crypto';

import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type { UploadStore } from '../modules/identity-onboarding/ports.js';

export class LocalQuarantineUploadStore implements UploadStore {
  public async createIntent(input: {
    caseId: string;
    mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
    sizeBytes: number;
    sha256: string;
  }) {
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(input.mimeType)) {
      throw new ApiPolicyError('upload-type-rejected', 400, 'Choose a JPEG, PNG, or PDF file.');
    }
    if (input.sizeBytes < 1 || input.sizeBytes > 10_485_760) {
      throw new ApiPolicyError('upload-size-rejected', 400, 'The file must be 10 MB or smaller.');
    }
    if (!/^[0-9a-f]{64}$/.test(input.sha256)) {
      throw new ApiPolicyError('upload-checksum-invalid', 400, 'The file checksum is invalid.');
    }
    const objectId = randomUUID();
    return {
      objectId,
      uploadUrl: `http://127.0.0.1:3000/__synthetic-upload/${objectId}`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      state: 'quarantine' as const,
    };
  }
}
