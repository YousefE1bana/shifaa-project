import { randomUUID } from 'node:crypto';
import { evidenceProfiles } from './evidence-profiles.js';
import { canonicalBytes, deny } from './protection.js';
import type { EvidenceConfiguration, CommonBinding } from './evidence-types.js';
type Schema = {
  type?: string;
  const?: unknown;
  enum?: readonly unknown[];
  pattern?: string;
  minLength?: number;
  minimum?: number;
  properties?: Readonly<Record<string, Schema>>;
  required?: readonly string[];
  anyOf?: readonly Schema[];
};
function check(schema: Schema, v: unknown): boolean {
  if (schema.anyOf) return schema.anyOf.some((s) => check(s, v));
  if (Object.hasOwn(schema, 'const') && v !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(v)) return false;
  if (schema.type === 'null') return v === null;
  if (schema.type === 'boolean') return typeof v === 'boolean';
  if (schema.type === 'integer')
    return typeof v === 'number' && Number.isSafeInteger(v) && v >= (schema.minimum ?? 0);
  if (schema.type === 'string')
    return (
      typeof v === 'string' &&
      v.isWellFormed() &&
      !v.includes('\0') &&
      v.length >= (schema.minLength ?? 0) &&
      (!schema.pattern || new RegExp(schema.pattern, 'u').test(v)) &&
      (!schema.pattern?.includes('[0-9]{4}') || calendarText(v))
    );
  if (schema.type === 'object') {
    if (
      v === null ||
      typeof v !== 'object' ||
      Array.isArray(v) ||
      Object.getOwnPropertySymbols(v).length
    )
      return false;
    if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
      return false;
    const properties = schema.properties ?? {},
      descriptors = Object.getOwnPropertyDescriptors(v);
    return (
      Object.keys(descriptors).every(
        (k) =>
          Object.hasOwn(properties, k) &&
          descriptors[k]!.enumerable &&
          Object.hasOwn(descriptors[k]!, 'value') &&
          check(properties[k]!, descriptors[k]!.value),
      ) && (schema.required ?? []).every((k) => Object.hasOwn(descriptors, k))
    );
  }
  return true;
}
export function validateProfile(profile: keyof typeof evidenceProfiles, value: unknown): unknown {
  if (!Object.hasOwn(evidenceProfiles, profile) || !check(evidenceProfiles[profile], value)) deny();
  return structuredClone(value);
}
export function same(left: unknown, right: unknown): boolean {
  const a = canonicalBytes(left),
    b = canonicalBytes(right);
  try {
    return a.equals(b);
  } finally {
    a.fill(0);
    b.fill(0);
  }
}
export function configured(config: EvidenceConfiguration | undefined): EvidenceConfiguration {
  if (
    !config ||
    !['isolated-synthetic', 'governed'].includes(config.mode) ||
    !config.sourceIdentity ||
    config.sourceIdentity.includes('\0') ||
    !config.sourceIdentity.isWellFormed()
  )
    deny();
  if ((config.mode === 'isolated-synthetic') !== config.sourceIdentity.startsWith('synthetic.'))
    deny();
  instant(config.now());
  return config;
}
export function instant(time: string): string {
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(time) ||
    time.startsWith('0000-') ||
    !Number.isFinite(Date.parse(time)) ||
    new Date(time).toISOString().slice(0, 19) !== time.slice(0, 19)
  )
    deny();
  return time;
}
export function evidenceUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  )
    deny();
  return value;
}
function calendarText(value: string): boolean {
  const canonical = value.length === 10 ? value + 'T00:00:00.000000Z' : value;
  try {
    instant(canonical);
    return true;
  } catch {
    return false;
  }
}
export function common(producerId: string, now: string): CommonBinding {
  return {
    contractId: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
    bindingId: randomUUID(),
    producerId,
    verifiedAt: instant(now),
  };
}
/** Exact bound row/version; a replacement or renewal cannot rehabilitate it. */
export function currentBasis(historical: object, current: object, now: string): boolean {
  if (!same(historical, current)) return false;
  instant(now);
  const row = current as {
    status?: string;
    expiresOn?: string;
    validFrom?: string;
    validUntil?: string | null;
  };
  if (row.status === 'verified') return !!row.expiresOn && row.expiresOn >= now.slice(0, 10);
  return (
    row.status === 'active' &&
    !!row.validFrom &&
    instant(row.validFrom) <= now &&
    (row.validUntil === null || (!!row.validUntil && instant(row.validUntil) > now))
  );
}
