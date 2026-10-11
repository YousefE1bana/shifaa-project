import type { Sql, JSONValue } from 'postgres';
import { uuid } from '../../modules/feature-011/protection.js';
import type { ContentActor, ContentRepository } from '../../modules/feature-011/create-release.js';
import { PostgresFeature011Receipts } from './feature-011-receipts.js';
import type { ContentReadContext } from '../../modules/feature-011/list-clinical-content.js';
/** Existing narrow projection only; no direct protected table privileges. */
export class PostgresFeature011Content implements ContentRepository {
  readonly receipts: PostgresFeature011Receipts;
  constructor(private readonly pool: Sql) {
    this.receipts = new PostgresFeature011Receipts(pool);
  }
  async read(
    actor: ContentActor,
    contentType: string,
    query: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>[]> {
    return this.readContext(actor, contentType, query, { role: 'ADM-MEDICAL' });
  }
  async readContext(
    actor: ContentActor,
    contentType: string,
    query: Readonly<Record<string, unknown>>,
    context: ContentReadContext,
  ): Promise<Record<string, unknown>[]> {
    return this.pool.begin(async (tx) => {
      const [role] = await tx`SELECT session_user AS session,current_user AS current`;
      if (role?.['session'] !== 'shifaa_api' || role['current'] !== 'shifaa_api')
        throw Error('F011_NON_OWNER_REQUIRED');
      const values = {
        environment: 'local',
        person_id: uuid(actor.personId),
        actor_role: context.role,
        action: 'listClinicalContent',
        aal: String(actor.aal),
        purposes: actor.purposes.join(','),
        facility_id: context.facilityId ? uuid(context.facilityId) : '',
        encounter_id: '',
        request_id: uuid(actor.requestId),
      };
      for (const [name, value] of Object.entries(values))
        await tx`SELECT set_config(${`shifaa.${name}`},${value},true)`;
      const [row] =
        await tx`SELECT clinical.list_clinical_content_api_v1(${contentType},${tx.json(query as JSONValue)}::jsonb) AS result`;
      if (!Array.isArray(row?.['result'])) throw Error('F011_INVALID_GOVERNANCE_PROJECTION');
      return row['result'] as Record<string, unknown>[];
    });
  }
}
