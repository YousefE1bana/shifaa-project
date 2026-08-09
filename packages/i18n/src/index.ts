import { catalogs, type Locale, type MessageKey } from './catalogs.ts';

export { arEG, catalogs, enEG, type Locale, type MessageKey } from './catalogs.ts';

export const directionFor = (locale: Locale) => (locale === 'ar-EG' ? 'rtl' : 'ltr');
export const translate = (locale: Locale, key: MessageKey) => catalogs[locale][key];

/** Isolate mixed-direction values such as masked IDs and request references. */
export const isolateLtr = (value: string) => `\u2066${value}\u2069`;
