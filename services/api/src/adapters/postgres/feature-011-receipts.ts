import type { Sql, TransactionSql, JSONValue } from 'postgres';
import { idempotencyScopeHash } from '../../platform/idempotency.js';
import { deny, uuid, type Envelope } from '../../modules/feature-011/protection.js';
import type {
  HttpReceipt,
  MutationScope,
  ReceiptRecord,
  ReceiptStore,
} from '../../modules/feature-011/mutation-receipts.js';
const operations = {
  createAllergy: {
    fn: 'clinical.create_allergy_api_v1',
    route: '/v1/patients/{managedPatientId}/allergies',
  },
  verifyAllergy: {
    fn: 'clinical.verify_allergy_api_v1',
    route: '/v1/allergies/{allergyId}/verification',
  },
  createClinicalContentRelease: {
    fn: 'clinical.create_clinical_content_release_api_v1',
    route: '/v1/admin/clinical-content/{contentType}/releases',
  },
  signClinicalContentRelease: {
    fn: 'clinical.sign_clinical_content_release_api_v1',
    route: '/v1/admin/clinical-content/releases/{releaseId}/signatures',
  },
  publishClinicalContentRelease: {
    fn: 'clinical.publish_clinical_content_release_api_v1',
    route: '/v1/admin/clinical-content/releases/{releaseId}/publish',
  },
} as const;
type Tx = TransactionSql;
interface DomainMetadata {
  receiptId: string;
  operationId: ReceiptRecord['operationId'];
  resourceType: string;
  resourceId: string;
  resourceVersion: number;
  responseStatus: number;
  responseEtag: string;
  responseLanguage: string;
  responseRequestId: string;
  replay: boolean;
  receiptEnvelope?: Envelope;
  response?: unknown;
}
function probeInput(scope: MutationScope): Readonly<Record<string, unknown>> {
  const input = { ...scope.input };
  for (const field of ['preparation', 'handoff', 'materialBindings', 'signing'])
    if (Object.hasOwn(input, field)) input[field] = null;
  if (scope.operationId === 'publishClinicalContentRelease')
    for (const field of ['artifactVersion', 'artifactDigest', 'confirmPublication'])
      input[field] = null;
  return input;
}
/** Fresh root pool only. It never inherits a transaction holding caller locks. */
export class PostgresFeature011Receipts implements ReceiptStore {
  constructor(private readonly pool: Sql) {
    if (typeof pool.begin !== 'function') deny();
  }
  private async context(tx: Tx, scope: MutationScope): Promise<void> {
    const [role] = await tx`SELECT session_user AS session, current_user AS current`;
    if (role?.['session'] !== 'shifaa_api' || role['current'] !== 'shifaa_api') deny();
    // Values come from the verified native/action port; these GUCs themselves
    // are not authentication. The narrow SQL entrypoint rechecks actual rows.
    for (const name of [
      'environment',
      'person_id',
      'actor_role',
      'aal',
      'purposes',
      'facility_id',
      'encounter_id',
      'request_id',
      'idempotency_key',
      'request_hash',
    ])
      await tx`SELECT set_config(${`shifaa.${name}`},${scope.context[name] ?? ''},true)`;
    await tx`SELECT set_config('shifaa.action',${scope.operationId},true)`;
    await tx`SELECT set_config('shifaa.principal_hash',${idempotencyScopeHash('principal', uuid(scope.context['person_id']))},true)`;
  }
  private async call(
    tx: Tx,
    scope: MutationScope,
    input: Readonly<Record<string, unknown>>,
  ): Promise<DomainMetadata> {
    const binding = operations[scope.operationId];
    if (!binding) deny();
    const content = scope.operationId === 'createClinicalContentRelease',
      three =
        scope.operationId === 'verifyAllergy' ||
        scope.operationId === 'signClinicalContentRelease' ||
        scope.operationId === 'publishClinicalContentRelease';
    const args: unknown[] = [content ? scope.contentType : uuid(scope.targetId)];
    if (three) args.push(scope.expectedVersion);
    args.push(tx.json(input as JSONValue));
    const [row] = await tx.unsafe(
      `SELECT ${binding.fn}($1::${content ? 'text' : 'uuid'},${three ? '$2::integer,$3' : '$2'}::jsonb) AS result`,
      args as Parameters<Tx['unsafe']>[1],
    );
    if (!row?.['result']) deny();
    return row['result'] as DomainMetadata;
  }
  private async record(
    tx: Tx,
    scope: MutationScope,
    domain: DomainMetadata,
  ): Promise<ReceiptRecord> {
    const [row] = await tx`SELECT id FROM platform.idempotency_records
      WHERE principal_type='sha256-v1' AND principal_hash=${idempotencyScopeHash('principal', uuid(scope.context['person_id']))}
        AND key_hash=${idempotencyScopeHash('key', scope.context['idempotency_key'] ?? '')}
        AND method='POST' AND route_template=${operations[scope.operationId].route}
        AND request_hash=${scope.context['request_hash'] ?? ''}`;
    if (!row) deny();
    const record: ReceiptRecord = {
      receiptId: domain.receiptId,
      idempotencyRecordId: uuid(row['id']),
      operationId: domain.operationId,
      targetResourceType: domain.resourceType,
      targetResourceId: domain.resourceId,
      responseResourceVersion: domain.resourceVersion,
      responseStatus: domain.responseStatus,
      responseETag: domain.responseEtag,
      responseLanguage: domain.responseLanguage,
      responseRequestId: domain.responseRequestId,
    };
    if (domain.receiptEnvelope) record.receiptEnvelope = domain.receiptEnvelope;
    return record;
  }
  async probe(scope: MutationScope): Promise<ReceiptRecord | undefined> {
    try {
      return await this.pool.begin(async (tx) => {
        await this.context(tx, scope);
        const domain = await this.call(tx, scope, probeInput(scope));
        if (!domain.replay) deny();
        return this.record(tx, scope, domain);
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === '22023' &&
        error.message === 'F011_FRESH_PREPARATION_REQUIRED'
      )
        return undefined;
      // Connection/runtime/auth/processing/hash failures never mean absence.
      throw error;
    }
  }
  private async projection(tx: Tx, scope: MutationScope, domain: DomainMetadata): Promise<unknown> {
    if (scope.operationId === 'signClinicalContentRelease') return domain.response;
    await tx`SELECT set_config('shifaa.action',${scope.operationId.includes('Allergy') ? 'listAllergies' : 'listClinicalContent'},true)`;
    try {
      if (scope.operationId.includes('Allergy')) {
        const patient =
          scope.operationId === 'createAllergy' ? scope.targetId : uuid(scope.patientId);
        const [row] =
          await tx`SELECT clinical.list_allergies_api_v1(${patient}::uuid,${tx.json({ view: 'history', allergyId: domain.resourceId, limit: 100 })}::jsonb) AS result`;
        const result = row?.['result'] as { data: Record<string, unknown>[] } | undefined;
        const revision = result?.data.find(
          (value) =>
            value['allergyId'] === domain.resourceId && value['version'] === domain.resourceVersion,
        );
        if (!revision) deny();
        return revision;
      }
      const [row] =
        await tx`SELECT clinical.list_clinical_content_api_v1(${scope.contentType},${tx.json({ projection: 'governance', releaseId: domain.resourceId })}::jsonb) AS result`;
      const releases = row?.['result'] as Record<string, unknown>[] | undefined;
      const release = releases?.find(
        (value) =>
          value['releaseId'] === domain.resourceId &&
          value['workflowVersion'] === domain.resourceVersion,
      );
      if (!release) deny();
      return release;
    } finally {
      await tx`SELECT set_config('shifaa.action',${scope.operationId},true)`;
    }
  }
  async mutate(
    scope: MutationScope,
    input: Readonly<Record<string, unknown>>,
    work: (meta: ReceiptRecord, projection: unknown) => { envelope: Envelope; http: HttpReceipt },
  ): Promise<{ value: HttpReceipt } | { replay: ReceiptRecord }> {
    return this.pool.begin(async (tx) => {
      await this.context(tx, scope);
      const domain = await this.call(tx, scope, input),
        record = await this.record(tx, scope, domain);
      if (domain.replay) return { replay: record };
      const projection = await this.projection(tx, scope, domain),
        result = work(record, projection);
      await tx`SELECT clinical.f011_finalize_receipt_v1(${record.receiptId}::uuid,${tx.json(result.envelope as unknown as JSONValue)}::jsonb)`;
      return { value: result.http };
    });
  }
  async replay(
    scope: MutationScope,
    work: (meta: ReceiptRecord) => HttpReceipt,
  ): Promise<HttpReceipt> {
    return this.pool.begin(async (tx) => {
      await this.context(tx, scope);
      const domain = await this.call(tx, scope, probeInput(scope));
      if (!domain.replay) deny();
      return work(await this.record(tx, scope, domain));
    });
  }
}
