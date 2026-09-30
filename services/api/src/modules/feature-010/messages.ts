import type {
  Feature010Uuid,
  ListContextMessagesQuery,
  MessagePage,
  MessageProjection,
  SendContextMessageRequest,
} from '@shifaa/contracts';

import type { Feature010EncounterActor, Feature010EncounterMutationContext } from './encounters.js';

export interface Feature010MessagesRepository {
  listContextMessages(
    actor: Feature010EncounterActor,
    contextType: 'appointment',
    contextId: Feature010Uuid,
    query: ListContextMessagesQuery,
  ): Promise<MessagePage>;
  sendContextMessage(
    context: Feature010EncounterMutationContext,
    contextType: 'appointment',
    contextId: Feature010Uuid,
    input: SendContextMessageRequest,
  ): Promise<MessageProjection>;
}

/** Core API boundary; SQL rechecks current appointment and participant authority. */
export class Feature010MessagesService implements Feature010MessagesRepository {
  public constructor(private readonly repository: Feature010MessagesRepository) {}

  public listContextMessages(
    actor: Feature010EncounterActor,
    contextType: 'appointment',
    contextId: Feature010Uuid,
    query: ListContextMessagesQuery,
  ): Promise<MessagePage> {
    return this.repository.listContextMessages(actor, contextType, contextId, query);
  }

  public sendContextMessage(
    context: Feature010EncounterMutationContext,
    contextType: 'appointment',
    contextId: Feature010Uuid,
    input: SendContextMessageRequest,
  ): Promise<MessageProjection> {
    return this.repository.sendContextMessage(context, contextType, contextId, input);
  }
}
