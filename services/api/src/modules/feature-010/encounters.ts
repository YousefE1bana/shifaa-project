import type {
  CreateEncounterRequest,
  CareTeamNoteProjection,
  CompleteEncounterRequest,
  EncounterCompleteResult,
  EncounterProjection,
  EncounterStartResult,
  Feature010Uuid,
  GetEncounterQuery,
  SignEncounterNoteRequest,
  UpdateEncounterRequest,
} from '@shifaa/contracts';
import type { Feature010NotesService } from './notes.js';

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

export interface Feature010EncounterUpdateContext extends Feature010EncounterMutationContext {
  readonly expectedVersion: number;
}

export type EncounterFields = NonNullable<GetEncounterQuery['fields']>;

export interface Feature010EncounterRepository {
  createEncounter(
    context: Feature010EncounterMutationContext,
    input: CreateEncounterRequest,
  ): Promise<EncounterStartResult>;
  completeEncounter(
    context: Feature010EncounterUpdateContext,
    encounterId: Feature010Uuid,
    input: CompleteEncounterRequest,
  ): Promise<EncounterCompleteResult>;
  getEncounter(
    actor: Feature010EncounterActor,
    encounterId: Feature010Uuid,
    fields?: EncounterFields,
  ): Promise<EncounterProjection | null>;
  updateEncounter(
    context: Feature010EncounterUpdateContext,
    encounterId: Feature010Uuid,
    input: UpdateEncounterRequest,
  ): Promise<EncounterProjection>;
}

/** Core API boundary; all clinical policy is rechecked by the locked SQL entrypoints. */
export class Feature010EncounterService {
  public constructor(
    private readonly repository: Feature010EncounterRepository,
    private readonly notes: Feature010NotesService,
  ) {}

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

  public completeEncounter(
    context: Feature010EncounterUpdateContext,
    encounterId: Feature010Uuid,
    input: CompleteEncounterRequest,
  ): Promise<EncounterCompleteResult> {
    return this.repository.completeEncounter(context, encounterId, input);
  }

  public updateEncounter(
    context: Feature010EncounterUpdateContext,
    encounterId: Feature010Uuid,
    input: UpdateEncounterRequest,
  ): Promise<EncounterProjection> {
    return this.repository.updateEncounter(context, encounterId, input);
  }

  public signEncounterNote(
    context: Feature010EncounterMutationContext,
    encounterId: Feature010Uuid,
    input: SignEncounterNoteRequest,
  ): Promise<CareTeamNoteProjection> {
    return this.notes.signEncounterNote(context, encounterId, input);
  }
}
