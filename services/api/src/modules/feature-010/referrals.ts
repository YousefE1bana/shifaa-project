import type {
  CreateReferralRequest,
  AcceptReferralRequest,
  Feature010Uuid,
  ReferralAcceptanceResult,
  ListReferralsQuery,
  PendingSourceReferralProjection,
  ReferralPage,
} from '@shifaa/contracts';

import type { Feature010EncounterActor } from './encounters.js';

export interface Feature010ReferralMutationContext {
  readonly actor: Feature010EncounterActor;
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export interface Feature010ReferralRepository {
  createReferral(
    context: Feature010ReferralMutationContext,
    sourceEncounterId: Feature010Uuid,
    input: CreateReferralRequest,
  ): Promise<PendingSourceReferralProjection>;
  listReferrals(actor: Feature010EncounterActor, query: ListReferralsQuery): Promise<ReferralPage>;
  acceptReferral(
    context: Feature010ReferralMutationContext,
    referralId: Feature010Uuid,
    expectedVersion: number,
    input: AcceptReferralRequest,
  ): Promise<ReferralAcceptanceResult>;
}

/** Core API boundary; the repository rechecks source and subject authority in locked SQL. */
export class Feature010ReferralService {
  public constructor(private readonly repository: Feature010ReferralRepository) {}

  public createReferral(
    context: Feature010ReferralMutationContext,
    sourceEncounterId: Feature010Uuid,
    input: CreateReferralRequest,
  ): Promise<PendingSourceReferralProjection> {
    return this.repository.createReferral(context, sourceEncounterId, input);
  }

  public listReferrals(
    actor: Feature010EncounterActor,
    query: ListReferralsQuery,
  ): Promise<ReferralPage> {
    return this.repository.listReferrals(actor, query);
  }

  public acceptReferral(
    context: Feature010ReferralMutationContext,
    referralId: Feature010Uuid,
    expectedVersion: number,
    input: AcceptReferralRequest,
  ): Promise<ReferralAcceptanceResult> {
    return this.repository.acceptReferral(context, referralId, expectedVersion, input);
  }
}
