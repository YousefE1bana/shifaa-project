import type {
  CreateEncounterRequest,
  EncounterProjection,
  EncounterStartResult,
  Feature010Uuid,
  GetEncounterQuery,
} from '@shifaa/contracts';

export interface Feature010EncounterActor {
  readonly personId: Feature010Uuid;
  readonly principal: string;
  readonly requestId: string;
  readonly traceId: string;
  readonly aal: 1 | 2;
  readonly locale: 'ar-EG' | 'en-EG';
  readonly purposes: readonly string[];
}

export interface Feature010EncounterMutationContext {
  readonly actor: Feature010EncounterActor;
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export type EncounterFields = NonNullable<GetEncounterQuery['fields']>;

export interface Feature010EncounterRepository {
  createEncounter(
    context: Feature010EncounterMutationContext,
    input: CreateEncounterRequest,
  ): Promise<EncounterStartResult>;
  getEncounter(
    actor: Feature010EncounterActor,
    encounterId: Feature010Uuid,
    fields?: EncounterFields,
  ): Promise<EncounterProjection | null>;
}

/** Core API boundary for the two C10 operations; all clinical policy is rechecked by SQL. */
export class Feature010EncounterService {
  public constructor(private readonly repository: Feature010EncounterRepository) {}

  public createEncounter(
    context: Feature010EncounterMutationContext,
    input: CreateEncounterRequest,
  ): Promise<EncounterStartResult> {
    return this.repository.createEncounter(context, input);
  }

  public getEncounter(
    actor: Feature010EncounterActor,
    encounterId: Feature010Uuid,
    fields?: EncounterFields,
  ): Promise<EncounterProjection | null> {
    return this.repository.getEncounter(actor, encounterId, fields);
  }
}
