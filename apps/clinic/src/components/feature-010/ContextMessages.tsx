'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IdentityOnboardingClient, ShifaaApiError } from '@shifaa/api-client';
import { createFeature010Client, Feature010ApiError } from '@shifaa/api-client/feature-010';
import {
  breakpoint,
  color,
  localizedType,
  minimumTargetSize,
  radius,
  spacing,
} from '@shifaa/design-system/tokens';

type Locale = 'ar-EG' | 'en-EG';

function webTypography(locale: Locale, variant: Parameters<typeof localizedType>[1]) {
  const typography = localizedType(locale, variant);
  return {
    ...typography,
    lineHeight: typography.lineHeight / typography.fontSize,
    fontFamily: locale === 'ar-EG' ? 'IBM Plex Sans Arabic, sans-serif' : 'Inter, sans-serif',
  };
}
type Feature010Client = ReturnType<typeof createFeature010Client>;
type MessagePage = Awaited<ReturnType<Feature010Client['listContextMessages']>>;
type MessageProjection = Awaited<ReturnType<Feature010Client['sendContextMessage']>>;
type MessageQuery = Parameters<Feature010Client['listContextMessages']>[2];
type SendMessageBody = Parameters<Feature010Client['sendContextMessage']>[2];
type ContextChoice = { encounterId: string; appointmentId: string };
type ClinicContextMessagesKind =
  | 'selection'
  | 'loading'
  | 'empty'
  | 'active'
  | 'success'
  | 'participant-removed'
  | 'access-ended'
  | 'chat-unavailable'
  | 'reconnecting'
  | 'stale'
  | 'offline'
  | 'permission-denied'
  | 'conflict'
  | 'error-recoverable'
  | 'error-terminal';

export type ClinicContextMessagesState = Readonly<{
  kind: ClinicContextMessagesKind;
  draftContext: ContextChoice;
  selectedContext: ContextChoice | null;
  messages: readonly MessageProjection[];
  sentMessage: MessageProjection | null;
  nextCursor: string | null;
  lastUpdatedAt: string | null;
}>;

export interface ClinicContextMessagesControllerOptions {
  locale: Locale;
  accessToken: string | (() => string | undefined);
  aal: 1 | 2 | null;
  apiBaseUrl: string;
  fetch?: typeof globalThis.fetch;
  isOnline?: () => boolean;
  now?: () => number;
}

export const CLINIC_CHAT_AUTHORITY_TTL_MS = 30_000;
const MESSAGE_PURPOSE = 'appointment.scheduling';
const WORKFORCE_PARTICIPANT_ROLES = new Set([
  'responsible_clinician',
  'consulting_clinician',
  'consultant',
]);

/** REST-only controller; C23 hints invalidate this view but never authorize it. */
export class ClinicContextMessagesController {
  private readonly options: ClinicContextMessagesControllerOptions;
  private snapshot: ClinicContextMessagesState = emptyState('selection');
  private requestEpoch = 0;
  private activeRequest: AbortController | null = null;
  private lastAuthorizedAt: number | null = null;
  private readonly seenHintIds = new Set<string>();
  private readonly listeners = new Set<() => void>();

  public constructor(options: ClinicContextMessagesControllerOptions) {
    this.options = options;
  }

  public get state(): ClinicContextMessagesState {
    return this.snapshot;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.invalidate('reconnecting');
    this.listeners.clear();
  }

  public setDraftContext(value: ContextChoice): void {
    this.requestEpoch += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.lastAuthorizedAt = null;
    this.seenHintIds.clear();
    this.update({
      ...emptyState('selection'),
      draftContext: {
        encounterId: value.encounterId.trim(),
        appointmentId: value.appointmentId.trim(),
      },
    });
  }

  public async confirmContext(): Promise<void> {
    const encounterId = this.snapshot.draftContext.encounterId.trim();
    const appointmentId = this.snapshot.draftContext.appointmentId.trim();
    if (!isUuid(encounterId) || !isUuid(appointmentId)) {
      this.fail('selection');
      return;
    }
    this.seenHintIds.clear();
    await this.readMessages({ encounterId, appointmentId }, undefined, 'loading');
  }

  public async refresh(): Promise<void> {
    const selected = this.snapshot.selectedContext;
    if (!selected) {
      this.fail('selection');
      return;
    }
    await this.readMessages(selected, undefined, 'reconnecting');
  }

  public async loadOlder(): Promise<void> {
    const selected = this.snapshot.selectedContext;
    const cursor = this.snapshot.nextCursor;
    if (!selected || !cursor) return;
    const previousMessages = [...this.snapshot.messages];
    await this.readMessages(selected, { cursor }, 'reconnecting', previousMessages);
  }

  public async sendMessage(body: SendMessageBody, idempotencyKey: string): Promise<void> {
    const selected = this.snapshot.selectedContext;
    if (!selected) {
      this.fail('selection');
      return;
    }
    if (this.options.aal !== 2) {
      this.fail('permission-denied');
      throw new Error('message-context-not-current');
    }
    if (!['active', 'empty', 'success'].includes(this.snapshot.kind)) {
      throw new Error('message-context-not-current');
    }
    let safeBody: SendMessageBody;
    try {
      safeBody = projectSendBody(body);
    } catch {
      throw new Error('message-body-invalid');
    }
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 128
    ) {
      this.fail('permission-denied');
      return;
    }
    const previousMessages = [...this.snapshot.messages];
    const previousLastUpdatedAt = this.snapshot.lastUpdatedAt;
    const epoch = this.begin(selected, 'reconnecting', previousLastUpdatedAt);
    const controller = new AbortController();
    this.activeRequest = controller;
    try {
      const { token } = this.assertInitialAuthority();
      const client = this.clientFor(token);
      await this.authorizeContext(selected, token, epoch, client);
      this.assertCurrent(epoch, selected, token, controller.signal);
      const sent = await client.sendContextMessage(
        'appointment',
        selected.appointmentId,
        safeBody,
        { idempotencyKey, signal: controller.signal },
      );
      this.assertCurrent(epoch, selected, token, controller.signal);
      const message = projectMessage(sent, selected.appointmentId);
      this.lastAuthorizedAt = this.now();
      this.update({
        ...this.snapshot,
        kind: 'success',
        messages: [message, ...previousMessages.filter((item) => item.id !== message.id)],
        sentMessage: message,
        lastUpdatedAt: message.sentAt,
      });
    } catch (error) {
      this.recordFailure(error, epoch, controller.signal, true);
      throw safeError(error, controller.signal);
    } finally {
      if (this.activeRequest === controller) this.activeRequest = null;
    }
  }

  public handleRefreshHint(value: unknown): boolean {
    if (!isRefreshHint(value) || value.contextId !== this.snapshot.selectedContext?.appointmentId)
      return false;
    if (this.seenHintIds.has(value.eventId)) return false;
    this.seenHintIds.add(value.eventId);
    if (this.seenHintIds.size > 256) {
      const oldest = this.seenHintIds.values().next().value as string | undefined;
      if (oldest) this.seenHintIds.delete(oldest);
    }
    this.invalidate('stale', true);
    return true;
  }

  public markOffline(): void {
    this.invalidate('offline');
  }

  public suspend(): void {
    this.invalidate('reconnecting', true);
  }

  public async reauthorizeIfExpired(): Promise<void> {
    if (
      this.snapshot.selectedContext &&
      this.lastAuthorizedAt !== null &&
      this.now() - this.lastAuthorizedAt >= CLINIC_CHAT_AUTHORITY_TTL_MS
    )
      await this.refresh();
  }

  private async readMessages(
    selected: ContextChoice,
    query?: MessageQuery,
    initialKind: 'loading' | 'reconnecting' = 'loading',
    previousMessages: MessageProjection[] = [],
  ): Promise<void> {
    const previousLastUpdatedAt = this.snapshot.lastUpdatedAt;
    const epoch = this.begin(selected, initialKind, previousLastUpdatedAt);
    const controller = new AbortController();
    this.activeRequest = controller;
    try {
      const { token } = this.assertInitialAuthority();
      const client = this.clientFor(token);
      await this.authorizeContext(selected, token, epoch, client);
      this.assertCurrent(epoch, selected, token, controller.signal);
      const page = await client.listContextMessages('appointment', selected.appointmentId, query, {
        signal: controller.signal,
      });
      this.assertCurrent(epoch, selected, token, controller.signal);
      const projected = projectMessagePage(page, selected.appointmentId);
      if (projected.meta.stale) {
        this.lastAuthorizedAt = null;
        this.update({
          ...emptyState('stale'),
          selectedContext: selected,
          draftContext: selected,
          lastUpdatedAt: projected.meta.lastUpdatedAt,
        });
        return;
      }
      const combined = query?.cursor
        ? [
            ...previousMessages,
            ...projected.data.filter((item) => !previousMessages.some((old) => old.id === item.id)),
          ]
        : projected.data;
      this.lastAuthorizedAt = this.now();
      this.update({
        kind: combined.length === 0 ? 'empty' : 'active',
        draftContext: selected,
        selectedContext: selected,
        messages: combined,
        sentMessage: null,
        nextCursor: projected.meta.nextCursor,
        lastUpdatedAt: projected.meta.lastUpdatedAt,
      });
    } catch (error) {
      this.recordFailure(error, epoch, controller.signal, false);
      throw safeError(error, controller.signal);
    } finally {
      if (this.activeRequest === controller) this.activeRequest = null;
    }
  }

  private async authorizeContext(
    selected: ContextChoice,
    token: string,
    epoch: number,
    client: Feature010Client,
  ): Promise<void> {
    let profile: unknown;
    try {
      profile = await new IdentityOnboardingClient({
        baseUrl: this.options.apiBaseUrl,
        accessToken: token,
        acceptLanguage: this.options.locale,
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      }).getMyProfile();
    } catch (error) {
      if (
        (error instanceof Feature010ApiError || error instanceof ShifaaApiError) &&
        [401, 403].includes(error.status)
      )
        throw new ContextDeniedError();
      throw error;
    }
    this.assertCurrent(epoch, selected, token);
    if (!isRecord(profile) || !isUuid(profile['id'])) throw new Error('context-profile-invalid');
    const personId = profile['id'];
    let encounter: unknown;
    try {
      encounter = await client.getEncounter(selected.encounterId, { fields: ['participants'] });
    } catch (error) {
      if (error instanceof Feature010ApiError && [401, 403, 404].includes(error.status))
        throw new ParticipantRemovedError();
      throw error;
    }
    this.assertCurrent(epoch, selected, token);
    const eligibility = projectEligibility(encounter, selected, personId, this.now());
    if (eligibility === 'access-ended') throw new AccessEndedError();
    if (eligibility === 'participant-removed') throw new ParticipantRemovedError();
    if (eligibility !== 'eligible') throw new ContextDeniedError();
  }

  private assertInitialAuthority(): { token: string } {
    if (!this.isOnline()) {
      this.invalidate('offline');
      throw new Error('context-offline');
    }
    if (this.options.aal !== 2) {
      this.invalidate('permission-denied');
      throw new Error('context-aal-required');
    }
    const token = this.readToken();
    if (!token) {
      this.invalidate('permission-denied');
      throw new Error('context-auth-required');
    }
    return { token };
  }

  private assertCurrent(
    epoch: number,
    selected: ContextChoice,
    token: string,
    signal?: AbortSignal,
  ): void {
    if (
      signal?.aborted ||
      epoch !== this.requestEpoch ||
      !sameContext(this.snapshot.selectedContext, selected)
    )
      throw new DOMException('Request superseded.', 'AbortError');
    if (!this.isOnline()) {
      this.invalidate('offline');
      throw new Error('context-offline');
    }
    if (this.readToken() !== token) {
      this.invalidate('permission-denied');
      throw new Error('context-auth-changed');
    }
    if (this.options.aal !== 2) {
      this.invalidate('permission-denied');
      throw new Error('context-aal-required');
    }
  }

  private begin(
    selected: ContextChoice,
    kind: 'loading' | 'reconnecting',
    lastUpdatedAt: string | null,
  ): number {
    this.requestEpoch += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.lastAuthorizedAt = null;
    this.update({
      kind,
      draftContext: selected,
      selectedContext: selected,
      messages: [],
      sentMessage: null,
      nextCursor: null,
      lastUpdatedAt,
    });
    return this.requestEpoch;
  }

  private recordFailure(
    error: unknown,
    epoch: number,
    signal: AbortSignal,
    sending: boolean,
  ): void {
    if (signal.aborted || isAbort(error) || epoch !== this.requestEpoch) return;
    this.lastAuthorizedAt = null;
    const state =
      error instanceof AccessEndedError
        ? 'access-ended'
        : error instanceof ParticipantRemovedError
          ? 'participant-removed'
          : error instanceof ContextDeniedError
            ? 'permission-denied'
            : resolveFailure(error, this.isOnline());
    this.clear(state);
    if (sending && state === 'conflict') this.update({ ...this.snapshot, kind: 'conflict' });
  }

  private fail(kind: ClinicContextMessagesKind): void {
    this.invalidate(kind);
  }

  private invalidate(kind: ClinicContextMessagesKind, preserveTimestamp = false): void {
    this.requestEpoch += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.lastAuthorizedAt = null;
    this.clear(kind, preserveTimestamp);
  }

  private clear(kind: ClinicContextMessagesKind, preserveTimestamp = false): void {
    this.update({
      ...this.snapshot,
      kind,
      messages: [],
      sentMessage: null,
      nextCursor: null,
      lastUpdatedAt: preserveTimestamp ? this.snapshot.lastUpdatedAt : null,
    });
  }

  private update(state: ClinicContextMessagesState): void {
    this.snapshot = state;
    for (const listener of this.listeners) listener();
  }

  private readToken(): string | undefined {
    const token =
      typeof this.options.accessToken === 'function'
        ? this.options.accessToken()
        : this.options.accessToken;
    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }

  private clientFor(token: string): Feature010Client {
    return createFeature010Client({
      baseUrl: this.options.apiBaseUrl,
      accessToken: () => token,
      acceptLanguage: this.options.locale,
      defaultHeaders: {
        'X-AAL': String(this.options.aal ?? 1),
        'X-Purpose': MESSAGE_PURPOSE,
      },
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }

  private isOnline(): boolean {
    return (
      this.options.isOnline?.() ?? (typeof navigator === 'undefined' || navigator.onLine !== false)
    );
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

class ContextDeniedError extends Error {}
class AccessEndedError extends Error {}
class ParticipantRemovedError extends Error {}

function emptyState(kind: ClinicContextMessagesKind): ClinicContextMessagesState {
  return {
    kind,
    draftContext: { encounterId: '', appointmentId: '' },
    selectedContext: null,
    messages: [],
    sentMessage: null,
    nextCursor: null,
    lastUpdatedAt: null,
  };
}

function projectEligibility(
  value: unknown,
  selected: ContextChoice,
  personId: string,
  now: number,
): 'eligible' | 'participant-removed' | 'access-ended' | 'denied' {
  if (
    !isRecord(value) ||
    value['id'] !== selected.encounterId ||
    value['appointmentId'] !== selected.appointmentId ||
    !isUuid(value['patientId']) ||
    value['patientId'] === personId
  )
    return 'denied';
  if (value['status'] !== 'open' || (value['endedAt'] !== undefined && value['endedAt'] !== null))
    return 'access-ended';
  if (!Array.isArray(value['participants'])) return 'denied';
  const matching = value['participants'].filter(
    (raw): raw is Record<string, unknown> => isRecord(raw) && raw['personId'] === personId,
  );
  if (
    matching.some(
      (participant) =>
        typeof participant['roleCode'] === 'string' &&
        WORKFORCE_PARTICIPANT_ROLES.has(participant['roleCode']) &&
        typeof participant['startedAt'] === 'string' &&
        Number.isFinite(Date.parse(participant['startedAt'])) &&
        Date.parse(participant['startedAt']) <= now &&
        (participant['endedAt'] === undefined || participant['endedAt'] === null),
    )
  )
    return 'eligible';
  if (
    matching.some(
      (participant) =>
        typeof participant['roleCode'] === 'string' &&
        WORKFORCE_PARTICIPANT_ROLES.has(participant['roleCode']),
    )
  )
    return 'participant-removed';
  return matching.length ? 'denied' : 'participant-removed';
}

function projectSendBody(value: SendMessageBody): SendMessageBody {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    Object.keys(value)[0] !== 'body' ||
    typeof value['body'] !== 'string' ||
    value['body'].trim().length === 0
  )
    throw new Error('message-body-invalid');
  return { body: value['body'] };
}

function projectMessagePage(value: MessagePage, contextId: string): MessagePage {
  if (!isRecord(value) || !Array.isArray(value['data']) || !isRecord(value['meta']))
    throw new Error('message-projection-invalid');
  const data = value['data'].map((item) => projectMessage(item, contextId));
  const meta = projectMeta(value['meta']);
  return { data, meta };
}

function projectMessage(value: unknown, contextId: string): MessageProjection {
  if (
    !isRecord(value) ||
    value['contextType'] !== 'appointment' ||
    value['contextId'] !== contextId ||
    !isUuid(value['id']) ||
    !isUuid(value['senderId']) ||
    typeof value['body'] !== 'string' ||
    typeof value['sentAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['sentAt']))
  )
    throw new Error('message-context-projection-invalid');
  return {
    id: value['id'],
    contextType: 'appointment',
    contextId,
    senderId: value['senderId'],
    body: value['body'],
    sentAt: value['sentAt'],
  };
}

function projectMeta(value: Record<string, unknown>): MessagePage['meta'] {
  if (
    (value['nextCursor'] !== null && typeof value['nextCursor'] !== 'string') ||
    typeof value['lastUpdatedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['lastUpdatedAt'])) ||
    typeof value['stale'] !== 'boolean'
  )
    throw new Error('message-meta-invalid');
  return {
    nextCursor: value['nextCursor'],
    lastUpdatedAt: value['lastUpdatedAt'],
    stale: value['stale'],
  };
}

function isRefreshHint(
  value: unknown,
): value is { eventId: string; contextId: string; version: number } {
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

function resolveFailure(error: unknown, online: boolean): ClinicContextMessagesKind {
  if (!online || error instanceof TypeError) return 'offline';
  if (error instanceof Feature010ApiError) {
    if (error.status === 401) return 'permission-denied';
    if ([403, 404].includes(error.status)) return 'participant-removed';
    if ([409, 412].includes(error.status)) return 'conflict';
    if (error.status === 503) return 'chat-unavailable';
    if (error.status >= 500) return 'error-recoverable';
    if (error.status === 422) return 'error-terminal';
  }
  return 'error-recoverable';
}

function safeError(error: unknown, signal?: AbortSignal): Error {
  if (signal?.aborted || isAbort(error)) return new DOMException('Request aborted.', 'AbortError');
  if (error instanceof Feature010ApiError)
    return new Error(`context-request-failed-${error.status}`);
  return new Error('context-request-failed');
}

function sameContext(left: ContextChoice | null, right: ContextChoice): boolean {
  return left?.encounterId === right.encounterId && left.appointmentId === right.appointmentId;
}

function isAbort(error: unknown): boolean {
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

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: minimumTargetSize,
  border: `1px solid ${color.border}`,
  borderRadius: radius.control,
  paddingInline: spacing.sm,
  marginBlock: spacing.sm,
  background: color.surface,
  color: color.ink,
  boxSizing: 'border-box',
};
const buttonStyle: React.CSSProperties = {
  minHeight: minimumTargetSize,
  border: `1px solid ${color.brand}`,
  borderRadius: radius.control,
  paddingInline: spacing.md,
  marginBlock: spacing.sm,
  background: color.surface,
  color: color.ink,
  cursor: 'pointer',
};
const cardStyle: React.CSSProperties = {
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  background: color.surface,
  padding: spacing.lg,
  marginBlockEnd: spacing.md,
};

const copy = {
  'ar-EG': {
    language: 'English',
    title: 'رسائل سياق الموعد',
    intro: 'اختر معرّف الزيارة والموعد صراحةً للتحقق من صلاحية المشاركة الحالية.',
    login: 'دخول موظف العيادة',
    loginHelp: 'أكمل التحقق الثنائي. لا تُحفظ بيانات الدخول على هذا الجهاز.',
    handle: 'وسيلة الدخول',
    password: 'كلمة المرور',
    continue: 'متابعة',
    otp: 'رمز التحقق',
    verify: 'تحقق',
    encounter: 'معرّف الزيارة',
    appointment: 'معرّف الموعد',
    confirm: 'تحقق من السياق المحدد',
    change: 'تغيير السياق',
    selected: 'سياق الموعد المحدد',
    messages: 'الرسائل',
    active: 'صلاحية المشاركة مؤكدة عبر السجل الحالي.',
    loading: 'جارٍ التحقق من السجل والصلاحية…',
    empty: 'لا توجد رسائل لهذا الموعد. تظهر الرسائل فقط أثناء الزيارة الجارية ومع مشاركة نشطة.',
    denied: 'لا توجد صلاحية حالية لعرض هذا السياق.',
    participantRemoved: 'انتهت مشاركة هذا الموظف؛ لم تعد الرسائل متاحة.',
    accessEnded: 'انتهت الزيارة أو لم تعد الرسائل متاحة لهذا السياق.',
    unavailable: 'خدمة الرسائل غير متاحة حاليًا.',
    reconnecting: 'جارٍ إعادة التحقق عبر السجل الموثوق…',
    stale: 'قد تكون الرسائل قديمة. أعد التحقق من السجل قبل المتابعة.',
    offline: 'لا يوجد اتصال. القراءة والإرسال متوقفان حتى إعادة التحقق.',
    conflict: 'تغير السياق أو تعذر تأكيده. حدّث السياق من السجل الموثوق.',
    recoverable: 'تعذر تحديث الرسائل. أعد التحقق قبل المتابعة.',
    terminal: 'هذا السياق غير متاح. راجع معرّفي الزيارة والموعد.',
    retry: 'إعادة التحقق',
    lastUpdated: 'آخر تحديث موثوق',
    body: 'اكتب رسالة',
    send: 'إرسال الرسالة',
    sending: 'جارٍ الإرسال…',
    sent: 'تم إرسال الرسالة',
    next: 'يمكنك متابعة الرسائل ضمن هذا السياق النشط.',
    more: 'تحميل رسائل أقدم',
    required: 'أدخل معرّف الزيارة والموعد للتحقق.',
    authError: 'تعذر التحقق. حاول مجددًا.',
    blank: 'اكتب رسالة قبل الإرسال.',
  },
  'en-EG': {
    language: 'العربية',
    title: 'Appointment-context messages',
    intro: 'Explicitly enter the encounter and appointment IDs to verify current participation.',
    login: 'Clinic staff sign-in',
    loginHelp: 'Complete two-step verification. Credentials are not stored on this device.',
    handle: 'Sign-in handle',
    password: 'Password',
    continue: 'Continue',
    otp: 'Verification code',
    verify: 'Verify',
    encounter: 'Encounter ID',
    appointment: 'Appointment ID',
    confirm: 'Verify selected context',
    change: 'Change context',
    selected: 'Selected appointment context',
    messages: 'Messages',
    active: 'Participation is confirmed against the current record.',
    loading: 'Checking the record and current access…',
    empty:
      'No messages for this appointment. Messages appear only during an open encounter with active participation.',
    denied: 'Current access to this context could not be confirmed.',
    participantRemoved: 'This workforce participation ended; messages are no longer available.',
    accessEnded: 'The encounter ended or its messages are no longer available.',
    unavailable: 'Messaging is currently unavailable.',
    reconnecting: 'Rechecking access against the authoritative record…',
    stale: 'Messages may be out of date. Recheck the record before continuing.',
    offline: 'You are offline. Reads and sends are paused until access is rechecked.',
    conflict:
      'The context changed or could not be confirmed. Recheck it against the authoritative record.',
    recoverable: 'Messages could not be refreshed. Recheck access before continuing.',
    terminal: 'This context is unavailable. Check the encounter and appointment IDs.',
    retry: 'Recheck access',
    lastUpdated: 'Last authoritative update',
    body: 'Write a message',
    send: 'Send message',
    sending: 'Sending…',
    sent: 'Message sent',
    next: 'You can continue messages in this active context.',
    more: 'Load older messages',
    required: 'Enter both the encounter and appointment IDs to verify the context.',
    authError: 'Verification failed. Try again.',
    blank: 'Write a message before sending.',
  },
} as const;

export function ContextMessages() {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [aal, setAal] = useState<1 | 2 | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [controllerSnapshot, setControllerSnapshot] = useState<{
    controller: ClinicContextMessagesController;
    state: ClinicContextMessagesState;
  } | null>(null);
  const [draftContext, setDraftContext] = useState<ContextChoice>({
    encounterId: '',
    appointmentId: '',
  });
  const [draftBody, setDraftBody] = useState('');
  const [sendError, setSendError] = useState(false);
  const [sending, setSending] = useState(false);
  const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  const words = copy[locale];
  const ar = locale === 'ar-EG';
  const direction = ar ? 'rtl' : 'ltr';
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const controller = useMemo(
    () =>
      token && baseUrl
        ? new ClinicContextMessagesController({
            locale,
            accessToken: () => tokenRef.current || undefined,
            aal,
            apiBaseUrl: baseUrl,
          })
        : null,
    [aal, baseUrl, locale, token],
  );
  const currentControllerRef = useRef(controller);
  currentControllerRef.current = controller;
  const state = controllerSnapshot?.controller === controller ? controllerSnapshot.state : null;
  const authClient = useMemo(
    () => (baseUrl ? new IdentityOnboardingClient({ baseUrl, acceptLanguage: locale }) : null),
    [baseUrl, locale],
  );

  const refresh = useCallback(async () => {
    if (controller) await controller.refresh().catch(() => undefined);
  }, [controller]);

  useEffect(() => {
    if (!controller) {
      setControllerSnapshot(null);
      return;
    }
    setControllerSnapshot({ controller, state: controller.state });
    const unsubscribe = controller.subscribe(() =>
      setControllerSnapshot({ controller, state: controller.state }),
    );
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);
  useEffect(() => {
    if (!controller) return;
    const suspend = () => controller.suspend();
    const online = () => void refresh();
    const focus = () => void refresh();
    const visibility = () => (document.visibilityState === 'visible' ? void refresh() : suspend());
    const hint = (event: Event) => {
      if (controller.handleRefreshHint((event as CustomEvent<unknown>).detail)) void refresh();
    };
    const offline = () => controller.markOffline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('focus', focus);
    window.addEventListener('shifaa:feature-010-refresh-hint', hint);
    document.addEventListener('visibilitychange', visibility);
    const expiry = window.setInterval(
      () => void controller.reauthorizeIfExpired().catch(() => undefined),
      5_000,
    );
    return () => {
      window.clearInterval(expiry);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', focus);
      window.removeEventListener('shifaa:feature-010-refresh-hint', hint);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [controller, refresh]);
  useEffect(() => {
    if (state && !['active', 'empty', 'success'].includes(state.kind)) {
      setDraftBody('');
      setSendError(false);
      setSending(false);
    }
  }, [state?.kind]);

  const login = async () => {
    if (!authClient) return;
    setLoginBusy(true);
    setLoginError(false);
    try {
      const response = await authClient.login({ handle, password }, crypto.randomUUID());
      if (
        !isRecord(response) ||
        response['kind'] !== 'challenge' ||
        !isUuid(response['challenge_id'])
      )
        throw new Error('auth-challenge-required');
      setChallenge(response['challenge_id']);
      setPassword('');
    } catch {
      setLoginError(true);
    } finally {
      setLoginBusy(false);
    }
  };
  const verify = async () => {
    if (!authClient) return;
    setLoginBusy(true);
    setLoginError(false);
    try {
      const response = await authClient.verifyOtp(
        { challenge_id: challenge, code: otp },
        crypto.randomUUID(),
      );
      if (
        !isRecord(response) ||
        response['kind'] !== 'session' ||
        typeof response['access_token'] !== 'string' ||
        !response['access_token'].trim()
      )
        throw new Error('auth-session-required');
      setToken(response['access_token']);
      setAal(response['aal'] === 1 || response['aal'] === 2 ? response['aal'] : null);
      setOtp('');
      setChallenge('');
    } catch {
      setLoginError(true);
    } finally {
      setLoginBusy(false);
    }
  };

  const stateText =
    state?.kind === 'empty'
      ? words.empty
      : state?.kind === 'participant-removed'
        ? words.participantRemoved
        : state?.kind === 'access-ended'
          ? words.accessEnded
          : state?.kind === 'chat-unavailable'
            ? words.unavailable
            : state?.kind === 'reconnecting'
              ? words.reconnecting
              : state?.kind === 'stale'
                ? words.stale
                : state?.kind === 'offline'
                  ? words.offline
                  : state?.kind === 'permission-denied'
                    ? words.denied
                    : state?.kind === 'conflict'
                      ? words.conflict
                      : state?.kind === 'error-terminal'
                        ? words.terminal
                        : state?.kind === 'error-recoverable'
                          ? words.recoverable
                          : state?.kind === 'loading'
                            ? words.loading
                            : words.active;

  const confirm = async () => {
    if (!isUuid(draftContext.encounterId) || !isUuid(draftContext.appointmentId)) {
      setSendError(false);
      return;
    }
    controller?.setDraftContext(draftContext);
    await controller?.confirmContext().catch(() => undefined);
  };
  const sendEpoch = useRef(0);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state?.kind === 'success' && state.sentMessage) {
      sentHeadingRef.current?.parentElement?.scrollIntoView({ block: 'start' });
      sentHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [state?.kind, state?.sentMessage?.id]);
  const send = async () => {
    if (
      !controller ||
      !draftBody.trim() ||
      sending ||
      aal !== 2 ||
      !state ||
      !['active', 'empty', 'success'].includes(state.kind)
    )
      return;
    const epoch = ++sendEpoch.current;
    const requestedController = controller;
    const requestedContext = state.selectedContext;
    const isCurrent = () =>
      sendEpoch.current === epoch &&
      requestedController === currentControllerRef.current &&
      ['active', 'empty', 'success'].includes(controller.state.kind) &&
      requestedContext?.encounterId === controller.state.selectedContext?.encounterId &&
      requestedContext?.appointmentId === controller.state.selectedContext?.appointmentId;
    setSending(true);
    setSendError(false);
    try {
      await controller.sendMessage({ body: draftBody }, crypto.randomUUID());
      if (isCurrent()) {
        setDraftBody('');
      }
    } catch (error) {
      if (isCurrent() && !isAbort(error)) setSendError(true);
    } finally {
      if (isCurrent()) setSending(false);
    }
  };

  return (
    <div
      dir={direction}
      lang={locale}
      style={{
        background: color.canvas,
        color: color.ink,
        minHeight: '100vh',
        ...webTypography(locale, 'body'),
        fontFamily: ar ? 'IBM Plex Sans Arabic' : 'Inter',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: spacing.md,
          alignItems: 'center',
          padding: spacing.md,
        }}
      >
        <a
          href="/today"
          style={{
            color: color.brand,
            minHeight: minimumTargetSize,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {ar ? 'اليوم' : 'Today'}
        </a>
        <a
          href="/referrals"
          style={{
            color: color.brand,
            minHeight: minimumTargetSize,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {ar ? 'الإحالات' : 'Referrals'}
        </a>
        <button type="button" style={buttonStyle} onClick={() => setLocale(ar ? 'en-EG' : 'ar-EG')}>
          {words.language}
        </button>
      </header>
      {!token ? (
        <main style={{ maxWidth: 560, marginInline: 'auto', padding: spacing.lg }}>
          <h1 style={{ ...webTypography(locale, 'title'), color: color.ink }}>{words.login}</h1>
          <p>{words.loginHelp}</p>
          {!challenge ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void login();
              }}
            >
              <label>
                {words.handle}
                <input
                  autoComplete="username"
                  style={inputStyle}
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                />
              </label>
              <label>
                {words.password}
                <input
                  type="password"
                  autoComplete="current-password"
                  style={inputStyle}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                type="submit"
                style={buttonStyle}
                disabled={!baseUrl || loginBusy || !handle || !password}
              >
                {words.continue}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void verify();
              }}
            >
              <label>
                {words.otp}
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  style={inputStyle}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <button type="submit" style={buttonStyle} disabled={loginBusy || otp.length !== 6}>
                {words.verify}
              </button>
            </form>
          )}
          {loginError && <p role="alert">{words.authError}</p>}
        </main>
      ) : (
        <main style={{ maxWidth: 1120, marginInline: 'auto', padding: spacing.lg }}>
          <h1 style={{ ...webTypography(locale, 'title'), color: color.ink }}>{words.title}</h1>
          <p>{words.intro}</p>
          {state?.kind === 'success' && state.sentMessage && state.selectedContext && (
            <section aria-live="polite" style={{ ...cardStyle, borderColor: color.positive }}>
              <h2
                ref={sentHeadingRef}
                tabIndex={-1}
                style={{ ...webTypography(locale, 'title'), color: color.positive }}
              >
                {words.sent}
              </h2>
              <p
                dir="ltr"
                style={{
                  textAlign: 'left',
                  overflowWrap: 'anywhere',
                  ...webTypography(locale, 'label'),
                  fontFamily: 'monospace',
                }}
              >
                {state.sentMessage.id}
              </p>
              <p>
                {new Date(state.sentMessage.sentAt).toLocaleString(locale, {
                  timeZone: 'Africa/Cairo',
                })}
              </p>
              <p style={{ fontSize: 16, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                {state.sentMessage.body}
              </p>
              <p>{words.next}</p>
            </section>
          )}
          <div className="context-workspace">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void confirm();
              }}
              style={cardStyle}
            >
              <h2 style={{ ...webTypography(locale, 'title'), color: color.ink }}>
                {words.selected}
              </h2>
              <label>
                {words.encounter}
                <input
                  dir="ltr"
                  style={{ ...inputStyle, textAlign: 'left' }}
                  value={draftContext.encounterId}
                  onChange={(event) => {
                    const next = { ...draftContext, encounterId: event.target.value };
                    setDraftContext(next);
                    controller?.setDraftContext(next);
                  }}
                />
              </label>
              <label>
                {words.appointment}
                <input
                  dir="ltr"
                  style={{ ...inputStyle, textAlign: 'left' }}
                  value={draftContext.appointmentId}
                  onChange={(event) => {
                    const next = { ...draftContext, appointmentId: event.target.value };
                    setDraftContext(next);
                    controller?.setDraftContext(next);
                  }}
                />
              </label>
              <button
                type="submit"
                style={buttonStyle}
                disabled={
                  !controller ||
                  !isUuid(draftContext.encounterId) ||
                  !isUuid(draftContext.appointmentId)
                }
              >
                {words.confirm}
              </button>
              {state?.selectedContext && (
                <p
                  dir="ltr"
                  style={{
                    textAlign: 'left',
                    overflowWrap: 'anywhere',
                    ...webTypography(locale, 'label'),
                  }}
                >
                  {state.selectedContext.encounterId}
                  <br />
                  {state.selectedContext.appointmentId}
                </p>
              )}
            </form>
            {state && state.kind !== 'selection' && (
              <section aria-live="polite" style={cardStyle}>
                <h2 style={{ ...webTypography(locale, 'title'), color: color.ink }}>
                  {words.messages}
                </h2>
                <p>{stateText}</p>
                {state.lastUpdatedAt && (
                  <p style={{ ...webTypography(locale, 'label'), color: color.mutedInk }}>
                    {words.lastUpdated}:{' '}
                    {new Date(state.lastUpdatedAt).toLocaleString(locale, {
                      timeZone: 'Africa/Cairo',
                    })}
                  </p>
                )}
                {['active', 'empty', 'success'].includes(state.kind) && (
                  <button type="button" style={buttonStyle} onClick={() => void refresh()}>
                    {words.retry}
                  </button>
                )}
                {['active', 'success'].includes(state.kind) &&
                  state.messages
                    .filter((message) => message.id !== state.sentMessage?.id)
                    .map((message) => (
                      <article
                        key={message.id}
                        style={{
                          borderBlockStart: `1px solid ${color.border}`,
                          paddingBlock: spacing.md,
                        }}
                      >
                        <p
                          style={{ fontSize: 16, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                        >
                          {message.body}
                        </p>
                        <small>
                          {new Date(message.sentAt).toLocaleString(locale, {
                            timeZone: 'Africa/Cairo',
                          })}
                        </small>
                      </article>
                    ))}
                {state.nextCursor && ['active', 'success'].includes(state.kind) && (
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => void controller?.loadOlder().catch(() => undefined)}
                  >
                    {words.more}
                  </button>
                )}
                {['active', 'success', 'empty'].includes(state.kind) && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void send();
                    }}
                    style={{
                      borderBlockStart: `1px solid ${color.border}`,
                      paddingBlockStart: spacing.md,
                    }}
                  >
                    <label>
                      {words.body}
                      <textarea
                        rows={4}
                        style={{
                          ...inputStyle,
                          minHeight: 112,
                          resize: 'vertical',
                          textAlign: ar ? 'right' : 'left',
                          direction,
                        }}
                        value={draftBody}
                        onChange={(event) => setDraftBody(event.target.value)}
                      />
                    </label>
                    {aal !== 2 && <p role="alert">{words.denied}</p>}
                    {sendError && <p role="alert">{words.recoverable}</p>}
                    <button
                      type="submit"
                      style={{ ...buttonStyle, background: color.brand, color: color.inverse }}
                      disabled={aal !== 2 || sending || !draftBody.trim()}
                    >
                      {sending ? words.sending : words.send}
                    </button>
                  </form>
                )}
                {!['active', 'empty', 'success', 'selection', 'loading', 'reconnecting'].includes(
                  state.kind,
                ) && (
                  <button type="button" style={buttonStyle} onClick={() => void refresh()}>
                    {words.retry}
                  </button>
                )}
              </section>
            )}
          </div>
          <style jsx>{`
            .context-workspace {
              display: grid;
              grid-template-columns: minmax(0, 1fr);
              gap: ${spacing.md}px;
              align-items: start;
            }
            @media (min-width: ${breakpoint.wide}px) {
              .context-workspace {
                grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
              }
            }
            .context-workspace > section {
              min-width: 0;
            }
          `}</style>
          {!baseUrl && <p role="status">{words.unavailable}</p>}
        </main>
      )}
    </div>
  );
}
