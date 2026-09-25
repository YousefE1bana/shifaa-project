import { createHash } from 'node:crypto';

import type { MessagingAdapter, MessagingResult } from './privacy-dsr-notifications.ts';

export const clinicNotificationEventTypes = [
  'clinical.doctor_delay.declared.v1',
  'clinical.doctor_absence.declared.v1',
] as const;
export type ClinicNotificationEventType = (typeof clinicNotificationEventTypes)[number];
export type ClinicNotificationLocale = 'ar-EG' | 'en-EG';
export type ClinicNotificationOutcome = 'delivered' | 'retry' | 'dead_letter';
export type ClinicNotificationState =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'dead_letter';

/**
 * The event projection intentionally contains no domain payload.  A worker
 * claims an event, then asks the database for the current governed recipient
 * projection.  This prevents stale patient/contact data from becoming a
 * durable worker input and keeps the worker away from clinical tables.
 */
export interface ClinicSchedulingNotificationEvent {
  readonly eventId: string;
  readonly eventType: ClinicNotificationEventType;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly attemptCount: number;
  readonly leaseExpiresAt: string;
}

export interface ClinicSchedulingNotificationRecipient {
  readonly recipientPersonId: string;
  readonly locale: ClinicNotificationLocale;
  readonly fields: Readonly<Record<string, string>>;
}

export interface ClinicSchedulingTemplateRelease {
  readonly id: string;
  readonly templateCode: 'CLINIC_DOCTOR_DELAY' | 'CLINIC_DOCTOR_ABSENCE';
  readonly releaseVersion: number;
  readonly channel: 'sms';
  readonly arabicBody: string;
  readonly englishBody: string;
  readonly allowedRecipientTypes: readonly ['patient'];
  readonly allowedFields: Readonly<Record<string, 'string'>>;
  readonly requiredFields: readonly string[];
  readonly contentDigest: string;
  readonly status: 'published';
  readonly effectiveAt: string;
  readonly version: number;
}

export interface ClinicSchedulingNotificationRecord {
  readonly id: string;
  readonly sourceEventId: string;
  readonly templateReleaseId: string;
  readonly recipientPersonId: string;
  readonly locale: ClinicNotificationLocale;
  readonly fieldValues: Readonly<Record<string, string>>;
  readonly renderedDigest: string;
  readonly state: ClinicNotificationState;
  readonly attemptCount: number;
  readonly nextAttemptAt: string;
}

export interface ClinicSchedulingNotificationAttempt {
  readonly notificationId: string;
  readonly sourceEventId: string;
  readonly attemptNumber: number;
  readonly idempotencyKey: string;
  readonly outcome: MessagingResult['outcome'];
  readonly safeErrorCode?: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly retryAt?: string;
  readonly providerReceiptHash?: string;
}

export interface ClinicSchedulingNotificationClaimPort {
  claimNext(input: {
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<ClinicSchedulingNotificationEvent | null>;
  completeClaim(input: {
    readonly eventId: string;
    readonly workerId: string;
    readonly outcome: ClinicNotificationOutcome;
    readonly safeErrorCode?: string;
    readonly retryAt?: string;
  }): Promise<boolean>;
}

export interface ClinicSchedulingRecipientResolutionPort {
  resolveCurrentRecipients(input: {
    readonly event: ClinicSchedulingNotificationEvent;
    readonly workerId: string;
    readonly now: string;
  }): Promise<readonly ClinicSchedulingNotificationRecipient[]>;
}

export interface ClinicSchedulingPublishedReleasePort {
  resolvePublishedRelease(input: {
    readonly event: ClinicSchedulingNotificationEvent;
    readonly now: string;
  }): Promise<ClinicSchedulingTemplateRelease | null>;
}

export interface ClinicSchedulingDeliveryReceiptPort {
  ensureNotification(input: {
    readonly event: ClinicSchedulingNotificationEvent;
    readonly recipient: ClinicSchedulingNotificationRecipient;
    readonly release: ClinicSchedulingTemplateRelease;
    readonly renderedDigest: string;
    readonly now: string;
  }): Promise<ClinicSchedulingNotificationRecord>;
  recordAttempt(input: ClinicSchedulingNotificationAttempt): Promise<void>;
  finalizeNotification(input: {
    readonly notificationId: string;
    readonly attemptNumber: number;
    readonly outcome: ClinicNotificationOutcome;
    readonly finishedAt: string;
    readonly retryAt?: string;
    readonly providerReceiptHash?: string;
  }): Promise<void>;
}

export interface ClinicSchedulingClockPort {
  now(): Date;
}

export interface ClinicSchedulingTelemetryPort {
  emit(input: {
    readonly eventType: ClinicNotificationEventType;
    readonly outcome: ClinicNotificationOutcome | 'idle';
    readonly attemptClass: 'first' | 'retry' | 'exhausted';
  }): void;
}

export interface ClinicSchedulingNotificationPorts
  extends ClinicSchedulingNotificationClaimPort,
    ClinicSchedulingRecipientResolutionPort,
    ClinicSchedulingPublishedReleasePort,
    ClinicSchedulingDeliveryReceiptPort {
  readonly clock: ClinicSchedulingClockPort;
  readonly telemetry?: ClinicSchedulingTelemetryPort;
}

export const CLINIC_NOTIFICATION_LEASE_SECONDS = 30;
export const CLINIC_NOTIFICATION_MAX_ATTEMPTS = 3;
export const CLINIC_NOTIFICATION_RETRY_DELAYS_MS = [60_000, 300_000, 900_000] as const;

export function templateCodeForEvent(
  eventType: ClinicNotificationEventType,
): ClinicSchedulingTemplateRelease['templateCode'] {
  return eventType === 'clinical.doctor_delay.declared.v1'
    ? 'CLINIC_DOCTOR_DELAY'
    : 'CLINIC_DOCTOR_ABSENCE';
}

export function notificationKey(input: {
  readonly releaseId: string;
  readonly eventId: string;
  readonly recipientPersonId: string;
  readonly deliveryScopeKey?: string;
}): string {
  return `${input.releaseId}\u0000${input.eventId}\u0000${input.recipientPersonId}\u0000${input.deliveryScopeKey ?? ''}\u0000sms`;
}

export function providerIdempotencyKey(input: {
  readonly releaseId: string;
  readonly eventId: string;
  readonly recipientPersonId: string;
  readonly deliveryScopeKey?: string;
}): string {
  return createHash('sha256').update(notificationKey(input)).digest('hex');
}

export function renderedBody(
  release: ClinicSchedulingTemplateRelease,
  recipient: ClinicSchedulingNotificationRecipient,
): string {
  const body = recipient.locale === 'ar-EG' ? release.arabicBody : release.englishBody;
  return body.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_whole, name: string) => {
    const value = recipient.fields[name];
    if (value === undefined) throw new Error('notification-field-schema-invalid');
    return value;
  });
}

export function renderedDigest(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

export function providerReceiptHash(reference: string | undefined): string | undefined {
  return reference === undefined ? undefined : createHash('sha256').update(reference).digest('hex');
}

export function retryDecision(
  outcome: MessagingResult['outcome'],
  attemptNumber: number,
):
  | { readonly outcome: 'retry'; readonly retryAtDelayMs: number }
  | { readonly outcome: 'dead_letter' } {
  if (
    outcome === 'permanent_failure' ||
    (outcome === 'transient_failure' && attemptNumber >= CLINIC_NOTIFICATION_MAX_ATTEMPTS) ||
    (outcome === 'timeout' && attemptNumber >= CLINIC_NOTIFICATION_MAX_ATTEMPTS)
  ) {
    return { outcome: 'dead_letter' };
  }
  if (outcome !== 'transient_failure' && outcome !== 'timeout') return { outcome: 'dead_letter' };
  const delay = CLINIC_NOTIFICATION_RETRY_DELAYS_MS[attemptNumber - 1];
  return delay === undefined
    ? { outcome: 'dead_letter' }
    : { outcome: 'retry', retryAtDelayMs: delay };
}

export function assertPublishedRelease(
  event: ClinicSchedulingNotificationEvent,
  release: ClinicSchedulingTemplateRelease | null,
): asserts release is ClinicSchedulingTemplateRelease {
  if (!release || release.status !== 'published' || release.channel !== 'sms')
    throw new Error('notification-template-not-published');
  if (release.templateCode !== templateCodeForEvent(event.eventType))
    throw new Error('notification-template-event-mismatch');
  if (release.allowedRecipientTypes.length !== 1 || release.allowedRecipientTypes[0] !== 'patient')
    throw new Error('notification-recipient-schema-invalid');
}

export type { MessagingAdapter, MessagingResult };
