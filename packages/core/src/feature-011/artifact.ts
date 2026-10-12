const contractId = 'SHIFAA-F011-ARTIFACT/1' as const;
const prefix = contractId + ';';
const utf8 = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export interface ArtifactFacts {
  contractId: typeof contractId;
  series: { contentType: string; governedContentKey: string; effectiveScopeKey: string };
  source: { display: string; reference: string | null };
  effectiveAt: string;
  predecessor: { initial: boolean; supersedesReleaseId: string | null };
  evidence: Record<'content' | 'code' | 'testVectors', { ref: string; sha256: string }>;
}
function invalid(): never {
  throw Error('Invalid Feature 011 artifact');
}
function closed(
  input: unknown,
  keys: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getOwnPropertySymbols(input).length
  )
    invalid();
  if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    keys.some((k) => !Object.hasOwn(descriptors, k)) ||
    Object.keys(descriptors).some((k) => !keys.includes(k) && !optional.includes(k))
  )
    invalid();
  if (Object.values(descriptors).some((d) => !d.enumerable || !Object.hasOwn(d, 'value')))
    invalid();
  return input as Record<string, unknown>;
}
function text(input: unknown): string {
  if (typeof input !== 'string' || !input.length || !input.isWellFormed() || input.includes('\0'))
    invalid();
  return input;
}
function canonicalUuid(input: unknown): string {
  const value = text(input);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) invalid();
  return value;
}
function digest(input: unknown): string {
  const value = text(input);
  if (!/^[0-9a-f]{64}$/.test(value)) invalid();
  return value;
}
export function normalizeSource(wire: unknown): ArtifactFacts['source'] {
  const source = closed(wire, ['display'], ['reference']);
  return {
    display: text(source['display']),
    reference: source['reference'] === undefined ? null : text(source['reference']),
  };
}
/** Integer calendar/offset conversion preserves all six microsecond digits. */
export function normalizeInstant(wire: string): string {
  if (typeof wire !== 'string') invalid();
  const match =
    /^(\d{4})-(\d\d)-(\d\d)[Tt](\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?([Zz]|[+-]\d\d:\d\d)$/.exec(
      wire,
    );
  if (!match) invalid();
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    invalid();
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    invalid();
  const zone = match[8]!;
  if (zone !== 'Z' && zone !== 'z') {
    const hours = Number(zone.slice(1, 3)),
      minutes = Number(zone.slice(4, 6));
    if (hours > 23 || minutes > 59 || zone === '-00:00') invalid();
    date.setTime(date.getTime() - (zone[0] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60000);
  }
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) invalid();
  return date.toISOString().slice(0, 19) + '.' + (match[7] ?? '').padEnd(6, '0') + 'Z';
}
function validated(input: unknown): ArtifactFacts {
  const root = closed(input, [
    'contractId',
    'series',
    'source',
    'effectiveAt',
    'predecessor',
    'evidence',
  ]);
  if (root['contractId'] !== contractId) invalid();
  const series = closed(root['series'], ['contentType', 'governedContentKey', 'effectiveScopeKey']),
    source = closed(root['source'], ['display', 'reference']),
    predecessor = closed(root['predecessor'], ['initial', 'supersedesReleaseId']),
    evidence = closed(root['evidence'], ['content', 'code', 'testVectors']);
  const effectiveAt = text(root['effectiveAt']);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(effectiveAt) ||
    normalizeInstant(effectiveAt) !== effectiveAt
  )
    invalid();
  if (typeof predecessor['initial'] !== 'boolean') invalid();
  const initial = predecessor['initial'];
  if (initial && predecessor['supersedesReleaseId'] !== null) invalid();
  const refs = {} as ArtifactFacts['evidence'];
  for (const kind of ['content', 'code', 'testVectors'] as const) {
    const binding = closed(evidence[kind], ['ref', 'sha256']);
    refs[kind] = { ref: canonicalUuid(binding['ref']), sha256: digest(binding['sha256']) };
  }
  return {
    contractId,
    series: {
      contentType: text(series['contentType']),
      governedContentKey: text(series['governedContentKey']),
      effectiveScopeKey: text(series['effectiveScopeKey']),
    },
    source: {
      display: text(source['display']),
      reference: source['reference'] === null ? null : text(source['reference']),
    },
    effectiveAt,
    predecessor: {
      initial,
      supersedesReleaseId: initial ? null : canonicalUuid(predecessor['supersedesReleaseId']),
    },
    evidence: refs,
  };
}
export function encodeArtifact(input: unknown): Uint8Array {
  const facts = validated(input),
    { series, source, predecessor, evidence } = facts;
  const fields = [
    series.contentType,
    series.governedContentKey,
    series.effectiveScopeKey,
    source.display,
    source.reference,
    facts.effectiveAt,
    predecessor.initial ? 'initial' : 'successor',
    predecessor.supersedesReleaseId,
    ...(['content', 'code', 'testVectors'] as const).flatMap((k) => [
      evidence[k].ref,
      evidence[k].sha256,
    ]),
  ];
  return utf8.encode(
    prefix + fields.map((v) => (v === null ? 'N,' : `S${utf8.encode(v).length}:${v},`)).join(''),
  );
}
export function decodeArtifact(bytes: Uint8Array): ArtifactFacts {
  // Fatal decode first forbids overlong UTF-8, encoded surrogates and replacement.
  decoder.decode(bytes);
  const pre = utf8.encode(prefix);
  if (!pre.every((b, i) => bytes[i] === b)) invalid();
  let offset = pre.length;
  const fields: (string | null)[] = [];
  for (let ordinal = 0; ordinal < 14; ordinal++) {
    const tag = bytes[offset++];
    if (tag === 78) {
      if (bytes[offset++] !== 44 || ![4, 7].includes(ordinal)) invalid();
      fields.push(null);
      continue;
    }
    if (tag !== 83) invalid();
    const start = offset;
    let length = 0;
    while (bytes[offset] !== 58) {
      const digit = bytes[offset++];
      if (digit === undefined || digit < 48 || digit > 57) invalid();
      length = length * 10 + digit - 48;
      if (!Number.isSafeInteger(length) || length > bytes.length) invalid();
    }
    if (offset === start || (offset - start > 1 && bytes[start] === 48)) invalid();
    offset++;
    if (length >= bytes.length - offset || bytes[offset + length] !== 44) invalid();
    fields.push(decoder.decode(bytes.subarray(offset, offset + length)));
    offset += length + 1;
  }
  if (offset !== bytes.length || !['initial', 'successor'].includes(fields[6]!)) invalid();
  const facts = validated({
    contractId,
    series: { contentType: fields[0], governedContentKey: fields[1], effectiveScopeKey: fields[2] },
    source: { display: fields[3], reference: fields[4] },
    effectiveAt: fields[5],
    predecessor: { initial: fields[6] === 'initial', supersedesReleaseId: fields[7] },
    evidence: {
      content: { ref: fields[8], sha256: fields[9] },
      code: { ref: fields[10], sha256: fields[11] },
      testVectors: { ref: fields[12], sha256: fields[13] },
    },
  });
  const canonical = encodeArtifact(facts);
  if (canonical.length !== bytes.length || !canonical.every((b, i) => bytes[i] === b)) invalid();
  return facts;
}
export function assertDeclaredDigest(actual: string, declared?: string): void {
  digest(actual);
  if (declared !== undefined && digest(declared) !== actual) invalid();
}
