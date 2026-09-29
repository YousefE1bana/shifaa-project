import type {
  CareTeamNoteProjection,
  Feature010Uuid,
  SignEncounterNoteRequest,
} from '@shifaa/contracts';

import type { Feature010EncounterMutationContext } from './encounters.js';

export interface Feature010NotesRepository {
  signEncounterNote(
    context: Feature010EncounterMutationContext,
    encounterId: Feature010Uuid,
    input: SignEncounterNoteRequest,
  ): Promise<CareTeamNoteProjection>;
}

/** Core API boundary for signed-note writes; live policy remains in SQL. */
export class Feature010NotesService {
  public constructor(private readonly repository: Feature010NotesRepository) {}

  public signEncounterNote(
    context: Feature010EncounterMutationContext,
    encounterId: Feature010Uuid,
    input: SignEncounterNoteRequest,
  ): Promise<CareTeamNoteProjection> {
    return this.repository.signEncounterNote(context, encounterId, input);
  }
}
