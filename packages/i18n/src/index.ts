import { catalogs, type Locale, type MessageKey } from './catalogs.ts';

export { auditAdminArEG, auditAdminEnEG } from './audit-admin.ts';
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
