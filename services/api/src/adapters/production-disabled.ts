import type { Locale } from '@shifaa/core';

import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type {
  AuthIssuer,
  ProofingProvider,
  UploadStore,
} from '../modules/identity-onboarding/ports.js';

function disabled(name: string): never {
  throw new ApiPolicyError(
    'production-integration-disabled',
    503,
    `${name} is disabled until the applicable SHIFAA production gate is approved.`,
  );
}

export class DisabledSupabaseAuthIssuer implements AuthIssuer {
  public async register(_handle: string, _password: string, _locale: Locale): Promise<never> {
    return disabled('Supabase Auth');
  }
  public async login(_handle: string, _password: string): Promise<never> {
    return disabled('Supabase Auth');
  }
  public async verifyOtp(_challengeId: string, _code: string): Promise<never> {
    return disabled('Supabase Auth');
  }
  public async resolveSession(_accessToken: string): Promise<undefined> {
    return undefined;
  }
}

export class DisabledValifyProofingProvider implements ProofingProvider {
  public readonly name = 'valify' as const;
  public async verify(): Promise<never> {
    return disabled('Valify identity proofing');
  }
}

export class DisabledSupabaseUploadStore implements UploadStore {
  public async createIntent(): Promise<never> {
    return disabled('Supabase private storage');
  }
}
