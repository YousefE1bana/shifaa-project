import { randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import {
  feature011Schemas,
  type Feature011CreateAllergyRequest,
  type Feature011ListAllergiesQuery,
  type Feature011VerifyAllergyRequest,
} from '@shifaa/contracts/feature-011';
import { ApiPolicyError } from '../identity-onboarding/errors.js';
import { hashRequest } from '../../platform/idempotency.js';
import { creationFacts, protectAllergy, reconstructAllergy } from './allergy-protection.js';
import { composeAllergy, type AllergyPreflight } from './response-composition.js';
import { validateKnownCoding } from './allergy-evidence.js';
import { executeReceipt, type MutationScope } from './mutation-receipts.js';
import { canonicalBytes, uuid, type Envelope } from './protection.js';
import type { PatientActor } from '../identity-onboarding/service.js';
import type { KeyProvider } from './protection.js';
import type { CodingSource } from './allergy-evidence.js';
import type { EvidenceConfiguration } from './evidence-types.js';
import type { ReceiptStore, HttpReceipt } from './mutation-receipts.js';
import type { SupportSource } from './allergy-evidence.js';
import { verifyAllergy } from './verify-allergy.js';
export interface AllergyActor extends PatientActor {
  requestId: string;
  locale: 'ar-EG' | 'en-EG';
  purposes: readonly string[];
}
export interface AllergyScope {
  actor: AllergyActor;
  role: 'PAT' | 'GUA' | 'DEL' | 'CLN';
  facilityId?: string;
  encounterId?: string;
}
export interface AllergyRepository {
  receipts: ReceiptStore;
  resolve(actor: AllergyActor, patientId: string, encounterId?: string): Promise<AllergyScope>;
  read(
    scope: AllergyScope,
    patientId: string,
    query: Feature011ListAllergiesQuery,
  ): Promise<{ view: string; data: Record<string, unknown>[]; meta: Record<string, unknown> }>;
}
export interface AllergyDependencies {
  repository: AllergyRepository;
  provider: KeyProvider | undefined;
  evidence?: EvidenceConfiguration;
  coding?: CodingSource;
  support?: SupportSource;
}
export class Feature011Allergies {
  constructor(private readonly deps: AllergyDependencies) {}
  async verifyAllergy(
    actor: AllergyActor,
    allergyId: string,
    request: Feature011VerifyAllergyRequest,
    expectedVersion: number,
    key: string,
  ): Promise<HttpReceipt> {
    this.actor(actor);
    return verifyAllergy(this.deps, actor, allergyId, request, expectedVersion, key);
  }
  private actor(actor: AllergyActor): void {
    uuid(actor.personId);
    uuid(actor.requestId);
    if (actor.aal !== 2)
      throw new ApiPolicyError('mfa-required', 403, 'Complete the required authentication.');
    if (!actor.purposes.length)
      throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  }
  async listAllergies(
    actor: AllergyActor,
    patientId: string,
    query: Feature011ListAllergiesQuery = {},
  ): Promise<unknown> {
    this.actor(actor);
    uuid(patientId);
    if (!Value.Check(feature011Schemas.listAllergiesQuery, query))
      throw new ApiPolicyError('validation-failed', 422, 'Invalid allergy filters.');
    const scope = await this.deps.repository.resolve(actor, patientId);
    const page = await this.deps.repository.read(scope, patientId, query),
      data = [];
    const prepareRow = (row: Record<string, unknown>) => {
      const context = {
        allergyId: uuid(row['allergyId']),
        revisionId: uuid(row['revisionId']),
        revisionVersion: Number(row['version']),
      };
      const protectedFacts = row['facts'] as Envelope,
        protectedReason = row['reason'] as Envelope | null;
      const reauthorize = async () => {
        let cursor: string | undefined, current: Record<string, unknown> | undefined;
        const seen = new Set<string>();
        do {
          const exact = await this.deps.repository.read(scope, patientId, {
            view: 'history',
            allergyId: context.allergyId,
            limit: 100,
            ...(cursor ? { cursor } : {}),
          });
          current = exact.data.find((r) => r['revisionId'] === context.revisionId);
          const next = exact.meta['nextCursor'];
          cursor = typeof next === 'string' ? next : undefined;
          if (cursor && seen.has(cursor)) throw Error('F011_REPEATED_HISTORY_CURSOR');
          if (cursor) seen.add(cursor);
        } while (!current && cursor);
        if (!current || !canonicalBytes(current).equals(canonicalBytes(row)))
          throw new ApiPolicyError(
            'forbidden',
            403,
            'The protected revision is not currently available.',
          );
      };
      const reconstruct = async (authorized: Promise<void>) => {
        const reconstructed = await reconstructAllergy(
          this.deps.provider,
          context,
          { protectedFacts, protectedReason },
          () => authorized,
        );
        const record = {
          targetResourceId: context.allergyId,
          responseResourceVersion: context.revisionVersion,
        };
        const reconstructedRow = composeAllergy(
          {
            patientId,
            ...context,
            previousRevisionId: row['previousRevisionId'] as string | null,
            ...reconstructed,
            protectedFacts,
            protectedReason,
          },
          record as Parameters<typeof composeAllergy>[1],
          row,
        );
        return reconstructedRow;
      };
      return { reauthorize, reconstruct };
    };
    // Finish every authorization transaction before external key preparation,
    // then finish protection before final authorization. No partial page is disclosed.
    for (let offset = 0; offset < page.data.length; offset += 3) {
      const rows = page.data.slice(offset, offset + 3).map(prepareRow);
      const authorized = Promise.all(rows.map((row) => row.reauthorize())).then(() => {});
      await authorized;
      const reconstructed = await Promise.all(rows.map((row) => row.reconstruct(authorized)));
      await Promise.all(rows.map((row) => row.reauthorize()));
      data.push(...reconstructed);
    }
    const result = { view: page.view, data, meta: page.meta };
    if (!Value.Check(feature011Schemas.AllergyList, result))
      throw new Error('F011_INVALID_READ_PROJECTION');
    return result;
  }
  async createAllergy(
    actor: AllergyActor,
    patientId: string,
    request: Feature011CreateAllergyRequest,
    key: string,
  ): Promise<HttpReceipt> {
    this.actor(actor);
    uuid(patientId);
    if (!Value.Check(feature011Schemas.CreateAllergyRequest, request))
      throw new ApiPolicyError('validation-failed', 422, 'Invalid allergy report.');
    if (key.length < 16 || key.length > 128)
      throw new ApiPolicyError(
        'idempotency-key-invalid',
        400,
        'Idempotency-Key must contain between 16 and 128 characters.',
      );
    const authority = await this.deps.repository.resolve(actor, patientId, request.encounterId);
    if (!['PAT', 'CLN'].includes(authority.role))
      throw new ApiPolicyError('forbidden', 403, 'Reporting is not permitted for this context.');
    const scope: MutationScope = {
      operationId: 'createAllergy',
      targetId: patientId,
      contentType: '',
      expectedVersion: 0,
      input: {
        responseLanguage: actor.locale,
        responseRequestId: actor.requestId,
        preparation: null,
      },
      context: {
        environment: 'local',
        person_id: actor.personId,
        actor_role: authority.role,
        aal: String(actor.aal),
        purposes: actor.purposes.join(','),
        facility_id: authority.facilityId ?? '',
        encounter_id: authority.encounterId ?? '',
        request_id: actor.requestId,
        idempotency_key: key,
        request_hash: hashRequest({
          patientId,
          request,
          locale: actor.locale,
          purposes: actor.purposes,
          facilityId: authority.facilityId ?? null,
          encounterId: authority.encounterId ?? null,
        }),
      },
    };
    const authorize = async () => {
      await this.deps.repository.read(authority, patientId, { limit: 1 });
    };
    return executeReceipt(scope, {
      store: this.deps.repository.receipts,
      provider: this.deps.provider,
      authorize,
      authorizeDisclosure: authorize,
      prepare: async () => {
        if (request.coding?.knowledge === 'known' && (!this.deps.evidence || !this.deps.coding))
          throw new ApiPolicyError(
            'validation-failed',
            422,
            'Known coding requires an approved matching source.',
          );
        const allergyId = randomUUID(),
          revisionId = randomUUID();
        const facts = await creationFacts(request, (coding) =>
          validateKnownCoding(this.deps.evidence, this.deps.coding, coding, revisionId),
        );
        const context = { allergyId, revisionId, revisionVersion: 1 };
        const encrypted = await protectAllergy(this.deps.provider, context, facts, null);
        const prepared: AllergyPreflight = {
          ...context,
          patientId,
          previousRevisionId: null,
          facts,
          reason: null,
          ...encrypted,
        };
        const input = {
          ...scope.input,
          preparation: {
            ...context,
            previousRevisionId: null,
            ...encrypted,
            correctsAllergyId: request.correctsAllergyId ?? null,
          },
        };
        return {
          input,
          compose: (meta, projection) => {
            const dto = composeAllergy(prepared, meta, projection) as Record<string, unknown>;
            if (dto['status'] !== 'self_reported') throw new Error('F011_CREATE_NEVER_CONFIRMS');
            return dto;
          },
          dispose() {},
        };
      },
    });
  }
}
