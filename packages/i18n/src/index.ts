import { catalogs, type Locale, type MessageKey } from './catalogs.ts';
import { feature012Copy, type Feature012Action, type Feature012Result } from './feature-012.ts';
export { allergyCopy, allergyDate, verificationCopy, contentCopy } from './feature-011.ts';

export { auditAdminArEG, auditAdminEnEG } from './audit-admin.ts';
export {
  clinicSchedulingArEG,
  clinicSchedulingEnEG,
  clinicSchedulingMessageKeys,
  interpolateClinicScheduling,
} from './clinic-scheduling.ts';
export {
  feature010ArEG,
  feature010CommonCopy,
  feature010EnEG,
  feature010FamilyKeys,
  feature010Copy,
  feature010PatientEncounterChatCopy,
  patientEncounterCopy,
  referralRecordsCopy,
  type Feature010Family,
} from './feature-010.ts';
export { arEG, catalogs, enEG, type Locale, type MessageKey } from './catalogs.ts';

export const directionFor = (locale: Locale) => (locale === 'ar-EG' ? 'rtl' : 'ltr');
export const translate = (locale: Locale, key: MessageKey) => catalogs[locale][key];

export const privilegedStepUpMessages = (locale: Locale) => ({
  'auth-degraded': translate(locale, 'security.session.degraded'),
  'aal2-required': translate(locale, 'security.stepUp.required'),
  'amr-stale': translate(locale, 'security.stepUp.stale'),
  'purpose-required': translate(locale, 'security.purpose.required'),
  'reason-required': translate(locale, 'security.reason.required'),
  action: translate(locale, 'security.stepUp.action'),
});

/** Isolate mixed-direction values such as masked IDs and request references. */
export const isolateLtr = (value: string) => `\u2066${value}\u2069`;

export { clinicalStatusCopy } from './feature-011-status.ts';

export {
  feature012ActionName,
  feature012Copy,
  type Feature012Action,
  type Feature012Result,
} from './feature-012.ts';

export function feature012Receipt(
  locale: Locale,
  result: Feature012Result,
  reference: string,
  time: string,
  nextAction: Feature012Action,
) {
  const copy = feature012Copy[locale];
  const labels = copy.receiptFields;
  return {
    accessibleName: copy.accessibleNames.receipt,
    fields: [
      { label: labels.status, value: copy.results[result] },
      { label: labels.reference, value: isolateLtr(reference) },
      { label: labels.time, value: isolateLtr(time) },
      { label: labels.next, value: copy.actions[nextAction] },
    ],
  };
}
