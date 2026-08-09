import { randomUUID } from 'node:crypto';

import type { ProofingOutcome, ProofingProvider } from '../modules/identity-onboarding/ports.js';

export class LocalProofingProvider implements ProofingProvider {
  public readonly name = 'local' as const;

  public constructor(private readonly outcomes = new Map<string, ProofingOutcome>()) {}

  public async verify(input: {
    identityType: 'egyptian_national_id' | 'passport' | 'unhcr_card';
    value: string;
    issuingCountry: string;
  }): Promise<{ outcome: ProofingOutcome; transactionId: string }> {
    const outcome = this.outcomes.get(input.value) ?? 'manual_review';
    return { outcome, transactionId: `local-${randomUUID()}` };
  }
}
