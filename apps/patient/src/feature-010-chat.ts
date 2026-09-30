import { Feature010ApiError, createFeature010Client } from '@shifaa/api-client/feature-010';
import type { Feature010Client } from '@shifaa/api-client/feature-010';
import type {
  Feature010PageMeta,
  Feature010Uuid,
  ListContextMessagesQuery,
  MessagePage,
  MessageProjection,
  SendContextMessageRequest,
} from '@shifaa/contracts';

type ContextId = Feature010Uuid;
type ChatState = 'idle' | 'loading' | 'current' | 'stale' | 'offline' | 'denied' | 'error';

export interface PatientFeature010ChatApiOptions {
  locale: 'ar-EG' | 'en-EG';
  accessToken: string | (() => string | undefined);
  apiBaseUrl?: string;
  fetch?: typeof globalThis.fetch;
  isOnline?: () => boolean;
}

export interface PatientChatRefreshHint {
  readonly eventId: string;
  readonly contextId: string;
  readonly version: number;
}

/** REST-only patient chat adapter. Realtime hints may invalidate this cache, never authorize access. */
export class PatientFeature010ChatApi {
  public messages: MessageProjection[] = [];
  public readState: ChatState = 'idle';
  public lastUpdatedAt: string | null = null;
  public nextCursor: string | null = null;
  private contextId: string | null = null;
  private requestEpoch = 0;
  private explicitlyOffline = false;
  private readonly seenHintIds = new Set<string>();
  private readonly clientFactory: (token: string) => Feature010Client;

  public constructor(private readonly options: PatientFeature010ChatApiOptions) {
    this.clientFactory = (token) =>
      createFeature010Client({
        baseUrl:
          options.apiBaseUrl ??
          (typeof location === 'undefined' ? 'http://127.0.0.1:3000' : location.origin),
        accessToken: () => token,
        acceptLanguage: options.locale,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
  }

  public async listMessages(
    contextId: ContextId,
    query: ListContextMessagesQuery = {},
    signal?: AbortSignal,
  ): Promise<MessagePage> {
    this.selectContext(contextId);
    const epoch = ++this.requestEpoch;
    this.clearProtectedHistory('loading', true);
    this.explicitlyOffline = false;
    this.assertOnline();
    const token = this.readToken();
    try {
      const response = await this.clientFactory(token).listContextMessages(
        'appointment',
        contextId,
        query,
        signal ? { signal } : {},
      );
      this.assertCurrentRequest(contextId, token, epoch, signal);
      const page = projectMessagePage(response, contextId);
      if (page.meta.stale) {
        this.lastUpdatedAt = page.meta.lastUpdatedAt;
        this.clearProtectedHistory('stale', true);
        return { data: [], meta: page.meta };
      }
      this.messages = page.data;
      this.lastUpdatedAt = page.meta.lastUpdatedAt;
      this.nextCursor = page.meta.nextCursor;
      this.readState = 'current';
      return page;
    } catch (error) {
      this.recordFailure(error, epoch, signal);
      throw safeChatError(error, signal);
    }
  }

  public async sendMessage(
    contextId: ContextId,
    body: SendContextMessageRequest,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<MessageProjection> {
    this.selectContext(contextId);
    const epoch = ++this.requestEpoch;
    this.assertOnline();
    const token = this.readToken();
    const safeBody = projectSendBody(body);
    try {
      const response = await this.clientFactory(token).sendContextMessage(
        'appointment',
        contextId,
        safeBody,
        { idempotencyKey, ...(signal ? { signal } : {}) },
      );
      this.assertCurrentRequest(contextId, token, epoch, signal);
      const message = projectMessage(response, contextId);
      if (!this.messages.some((existing) => existing.id === message.id))
        this.messages = [message, ...this.messages];
      this.readState = 'current';
      return message;
    } catch (error) {
      this.recordFailure(error, epoch, signal);
      throw safeChatError(error, signal);
    }
  }

  /** Accepts a minimal C23 event solely as a local invalidation signal. */
  public handleRefreshHint(value: unknown): boolean {
    if (!isRefreshHint(value) || value.contextId !== this.contextId) return false;
    if (this.seenHintIds.has(value.eventId)) return false;
    this.seenHintIds.add(value.eventId);
    if (this.seenHintIds.size > 256) {
      const oldest = this.seenHintIds.values().next().value as string | undefined;
      if (oldest) this.seenHintIds.delete(oldest);
    }
    this.requestEpoch += 1;
    this.clearProtectedHistory('stale', true);
    return true;
  }

  public markOffline(): void {
    this.explicitlyOffline = true;
    this.requestEpoch += 1;
    this.clearProtectedHistory('offline');
  }

  private selectContext(contextId: ContextId): void {
    if (!isUuid(contextId)) throw new Error('chat-context-invalid');
    if (contextId !== this.contextId) {
      this.contextId = contextId;
      this.requestEpoch += 1;
      this.seenHintIds.clear();
      this.clearProtectedHistory('idle');
    }
  }

  private assertOnline(): void {
    if (this.explicitlyOffline || !this.isOnlineNow()) {
      this.clearProtectedHistory('offline');
      throw new Error('chat-offline');
    }
  }

  private isOnlineNow(): boolean {
    return (
      this.options.isOnline?.() ?? (typeof navigator === 'undefined' || navigator.onLine !== false)
    );
  }

  private readToken(): string {
    const token =
      typeof this.options.accessToken === 'function'
        ? this.options.accessToken()
        : this.options.accessToken;
    if (typeof token !== 'string' || token.length === 0) {
      this.invalidateAndClear('denied');
      throw new Error('chat-authorization-unavailable');
    }
    return token;
  }

  private assertCurrentRequest(
    contextId: string,
    token: string,
    epoch: number,
    signal?: AbortSignal,
  ): void {
    if (signal?.aborted) throw new DOMException('Chat request aborted.', 'AbortError');
    if (epoch !== this.requestEpoch)
      throw new DOMException('Chat request was superseded.', 'AbortError');
    if (this.contextId !== contextId) throw new DOMException('Chat context changed.', 'AbortError');
    if (!this.isOnlineNow()) {
      this.markOffline();
      throw new Error('chat-offline');
    }
    if (this.readToken() !== token) {
      this.invalidateAndClear('denied');
      throw new Error('chat-authorization-changed');
    }
  }

  private recordFailure(error: unknown, epoch: number, signal?: AbortSignal): void {
    if (signal?.aborted || isAbortError(error) || epoch !== this.requestEpoch) return;
    if (error instanceof Feature010ApiError && (error.status === 401 || error.status === 403))
      this.invalidateAndClear('denied');
    else if (error instanceof Feature010ApiError && error.status >= 500)
      this.invalidateAndClear('stale');
    else if (error instanceof TypeError) this.invalidateAndClear('offline');
    else this.invalidateAndClear('error');
  }

  private invalidateAndClear(state: ChatState): void {
    this.requestEpoch += 1;
    this.clearProtectedHistory(state, state === 'stale');
  }

  private clearProtectedHistory(state: ChatState, preserveFreshness = false): void {
    this.messages = [];
    if (!preserveFreshness) this.lastUpdatedAt = null;
    this.nextCursor = null;
    this.readState = state;
  }
}

function projectSendBody(value: SendContextMessageRequest): SendContextMessageRequest {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    Object.keys(value)[0] !== 'body' ||
    typeof value['body'] !== 'string' ||
    value['body'].trim().length === 0
  )
    throw new Error('chat-body-invalid');
  return { body: value['body'] };
}

function projectMessagePage(value: MessagePage, contextId: string): MessagePage {
  if (!isRecord(value) || !Array.isArray(value['data']) || !isRecord(value['meta']))
    throw new Error('chat-projection-invalid');
  const data = value['data'].map((item) => projectMessage(item, contextId));
  const meta = projectPageMeta(value['meta']);
  return { data, meta };
}

function projectMessage(value: unknown, contextId: string): MessageProjection {
  if (!isRecord(value)) throw new Error('chat-projection-invalid');
  if (
    value['contextType'] !== 'appointment' ||
    value['contextId'] !== contextId ||
    !isUuid(value['id']) ||
    !isUuid(value['senderId']) ||
    typeof value['body'] !== 'string' ||
    typeof value['sentAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['sentAt']))
  )
    throw new Error('chat-context-projection-invalid');
  return {
    id: value['id'],
    contextType: 'appointment',
    contextId,
    senderId: value['senderId'],
    body: value['body'],
    sentAt: value['sentAt'],
  };
}

function projectPageMeta(value: Record<string, unknown>): Feature010PageMeta {
  if (
    (value['nextCursor'] !== null && typeof value['nextCursor'] !== 'string') ||
    typeof value['lastUpdatedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['lastUpdatedAt'])) ||
    typeof value['stale'] !== 'boolean'
  )
    throw new Error('chat-page-meta-invalid');
  return {
    nextCursor: value['nextCursor'],
    lastUpdatedAt: value['lastUpdatedAt'],
    stale: value['stale'],
  };
}

function isRefreshHint(value: unknown): value is PatientChatRefreshHint {
  return (
    isRecord(value) &&
    JSON.stringify(Object.keys(value).toSorted()) ===
      JSON.stringify(['contextId', 'eventId', 'version']) &&
    isUuid(value['eventId']) &&
    isUuid(value['contextId']) &&
    Number.isSafeInteger(value['version']) &&
    Number(value['version']) > 0
  );
}

function safeChatError(error: unknown, signal?: AbortSignal): Error {
  if (signal?.aborted || isAbortError(error))
    return new DOMException('Chat request aborted.', 'AbortError');
  if (error instanceof Feature010ApiError) return new Error(`chat-request-failed-${error.status}`);
  if (error instanceof TypeError) return new Error('chat-network-unavailable');
  if (error instanceof Error && /^chat-[a-z0-9-]+$/.test(error.message))
    return new Error(error.message);
  return new Error('chat-request-failed');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}
