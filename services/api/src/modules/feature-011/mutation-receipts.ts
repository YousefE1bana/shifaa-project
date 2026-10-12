import { Value } from '@sinclair/typebox/value';
import { feature011ResponseSchemas } from '@shifaa/contracts/feature-011';
import {
  canonicalBytes,
  decodeCanonical,
  deny,
  frames,
  metadata,
  prepareCapability,
  uuid,
  version,
  type Envelope,
  type KeyProvider,
} from './protection.js';
export type Mutation =
  | 'createAllergy'
  | 'verifyAllergy'
  | 'createClinicalContentRelease'
  | 'signClinicalContentRelease'
  | 'publishClinicalContentRelease';
export interface ReceiptIdentity {
  receiptId: string;
  idempotencyRecordId: string;
  operationId: Mutation;
  targetResourceType: string;
  targetResourceId: string;
  responseResourceVersion: string | number;
  responseStatus: string | number;
  responseETag: string;
  responseLanguage: string;
  responseRequestId: string;
  keyRef?: string;
}
export interface ReceiptRecord extends ReceiptIdentity {
  receiptEnvelope?: Envelope;
}
export interface MutationScope {
  operationId: Mutation;
  targetId: string;
  contentType: string;
  expectedVersion: number;
  patientId?: string;
  input: Readonly<Record<string, unknown>>;
  context: Readonly<Record<string, string>>;
}
export interface HttpReceipt {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Buffer;
}
export interface PreparedMutation {
  input: Readonly<Record<string, unknown>>;
  /** Synchronous local composition from authorized preflight and SQL metadata. */
  compose(metadata: ReceiptRecord, projection: unknown): unknown;
  dispose(): void;
}
export interface ReceiptStore {
  probe(scope: MutationScope): Promise<ReceiptRecord | undefined>;
  mutate(
    scope: MutationScope,
    input: Readonly<Record<string, unknown>>,
    work: (meta: ReceiptRecord, projection: unknown) => { envelope: Envelope; http: HttpReceipt },
  ): Promise<{ value: HttpReceipt } | { replay: ReceiptRecord }>;
  replay(scope: MutationScope, work: (meta: ReceiptRecord) => HttpReceipt): Promise<HttpReceipt>;
}
function identity(record: ReceiptIdentity): string[] {
  const allergy = record.operationId === 'createAllergy' || record.operationId === 'verifyAllergy';
  if (
    ![
      'createAllergy',
      'verifyAllergy',
      'createClinicalContentRelease',
      'signClinicalContentRelease',
      'publishClinicalContentRelease',
    ].includes(record.operationId)
  )
    deny();
  if (
    record.targetResourceType !==
    (allergy ? 'clinical.allergy_revision' : 'clinical.content_release')
  )
    deny();
  const status =
      record.operationId === 'createAllergy' ||
      record.operationId === 'createClinicalContentRelease'
        ? '201'
        : '200',
    v = version(record.responseResourceVersion);
  if (
    String(record.responseStatus) !== status ||
    record.responseETag !== `"${v}"` ||
    !['en-EG', 'ar-EG'].includes(record.responseLanguage)
  )
    deny();
  return [
    'clinical.mutation_receipt',
    uuid(record.receiptId),
    uuid(record.idempotencyRecordId),
    record.operationId,
    record.targetResourceType,
    uuid(record.targetResourceId),
    v,
    status,
    record.responseETag,
    record.responseLanguage,
    uuid(record.responseRequestId),
  ];
}
export function receiptAad(record: ReceiptIdentity): Buffer {
  return frames('SHIFAA-F011-RECEIPT-AAD/1;', [...identity(record), metadata(record.keyRef)]);
}
export function responseHeaders(record: ReceiptIdentity): Readonly<Record<string, string>> {
  identity(record);
  return {
    'X-Request-Id': record.responseRequestId,
    'Cache-Control': 'private, no-store',
    ETag: record.responseETag,
    'Content-Language': record.responseLanguage,
  };
}
export function serializeResponse(
  operation: Mutation,
  body: unknown,
  record: ReceiptIdentity,
): Buffer {
  identity(record);
  if (record.operationId !== operation) deny();
  const bytes = canonicalBytes(body);
  try {
    if (!Value.Check(feature011ResponseSchemas[operation], body)) deny();
    const value = body as Record<string, unknown>,
      allergy = record.targetResourceType === 'clinical.allergy_revision';
    if (
      value[allergy ? 'allergyId' : 'releaseId'] !== record.targetResourceId ||
      String(value[allergy ? 'version' : 'workflowVersion']) !==
        version(record.responseResourceVersion)
    )
      deny();
    return bytes;
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}
export interface ReceiptDependencies {
  store: ReceiptStore;
  provider: KeyProvider | undefined;
  authorize(scope: MutationScope): Promise<void>;
  /** Includes exact original artifactReview disclosure/material eligibility. */
  authorizeDisclosure(scope: MutationScope, record: ReceiptRecord): Promise<void>;
  /** Authorize exact material/facts/reason disclosure and finish all external
   * evidence/key work. No asynchronous/external work is permitted in compose. */
  prepare(scope: MutationScope): Promise<PreparedMutation>;
}
function sameReceipt(left: ReceiptRecord, right: ReceiptRecord): boolean {
  return (
    identity(left).join('\0') === identity(right).join('\0') &&
    canonicalBytes(left.receiptEnvelope).equals(canonicalBytes(right.receiptEnvelope))
  );
}
async function replayOriginal(
  scope: MutationScope,
  deps: ReceiptDependencies,
  original: ReceiptRecord,
): Promise<HttpReceipt> {
  await deps.authorizeDisclosure(scope, original);
  if (!original.receiptEnvelope) deny();
  const cap = await prepareCapability(
    deps.provider,
    'receipt',
    'decrypt',
    original.receiptEnvelope.keyRef,
  );
  let body: Buffer | undefined;
  try {
    return await deps.store.replay(scope, (current) => {
      if (!sameReceipt(original, current) || !current.receiptEnvelope) deny();
      body = cap.decrypt(current.receiptEnvelope, receiptAad({ ...current, keyRef: cap.keyRef }));
      const parsed = decodeCanonical(body),
        checked = serializeResponse(scope.operationId, parsed, current);
      checked.fill(0);
      return { status: Number(current.responseStatus), headers: responseHeaders(current), body };
    });
  } catch (error) {
    body?.fill(0);
    throw error;
  } finally {
    cap.dispose();
  }
}
/** Every invocation settles the authoritative scope before any new protection. */
export async function executeReceipt(
  scope: MutationScope,
  deps: ReceiptDependencies,
): Promise<HttpReceipt> {
  await deps.authorize(scope);
  const original = await deps.store.probe(scope);
  if (original) return replayOriginal(scope, deps, original);
  const prepared = await deps.prepare(scope);
  let body: Buffer | undefined;
  try {
    const cap = await prepareCapability(deps.provider, 'receipt', 'encrypt');
    try {
      const result = await deps.store.mutate(scope, prepared.input, (meta, projection) => {
        body = serializeResponse(scope.operationId, prepared.compose(meta, projection), meta);
        const envelope = cap.encrypt(body, receiptAad({ ...meta, keyRef: cap.keyRef }));
        return {
          envelope,
          http: { status: Number(meta.responseStatus), headers: responseHeaders(meta), body },
        };
      });
      if ('replay' in result) {
        cap.dispose();
        body?.fill(0);
        return await replayOriginal(scope, deps, result.replay);
      }
      return result.value;
    } finally {
      cap.dispose();
    }
  } catch (error) {
    body?.fill(0);
    throw error;
  } finally {
    prepared.dispose();
  }
}
