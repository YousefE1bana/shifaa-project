import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type { UploadStore } from '../modules/identity-onboarding/ports.js';

export class SupabaseQuarantineUploadStore implements UploadStore {
  private readonly client: SupabaseClient;
  public constructor(
    url: string,
    serviceRoleKey: string,
    private readonly bucket = 'identity-evidence',
  ) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }
  public async ready(): Promise<void> {
    const { data, error } = await this.client.storage.getBucket(this.bucket);
    if (error || !data || data.public)
      throw new Error('Private Supabase quarantine bucket is unavailable.');
  }
  public async createIntent(input: {
    caseId: string;
    mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
    sizeBytes: number;
    sha256: string;
  }) {
    if (
      input.sizeBytes <= 0 ||
      input.sizeBytes > 10 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/i.test(input.sha256)
    ) {
      throw new ApiPolicyError('upload-metadata-invalid', 400, 'The upload metadata is invalid.');
    }
    const extension =
      input.mimeType === 'application/pdf' ? 'pdf' : input.mimeType === 'image/png' ? 'png' : 'jpg';
    const objectId = `${input.caseId}/${randomUUID()}.${extension}`;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(objectId, { upsert: false });
    if (error || !data?.signedUrl)
      throw new ApiPolicyError('upload-intent-failed', 503, 'Could not prepare the secure upload.');
    return {
      objectId,
      uploadUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      state: 'quarantine' as const,
    };
  }
}
