import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  feature011Schemas,
  type Feature011CreateAllergyRequest,
  type Feature011AllergyCorrections,
} from '@shifaa/contracts/feature-011';
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
const factsSchema = Type.Object(
  {
    contractId: Type.Literal('SHIFAA-F011-ALLERGY-FACTS/1'),
    substance: feature011Schemas.Substance,
    source: feature011Schemas.Source,
    coding: feature011Schemas.KnownUnknownCoding,
    reaction: feature011Schemas.KnownUnknownText,
    severity: feature011Schemas.KnownUnknownText,
    onset: feature011Schemas.KnownUnknownText,
  },
  { additionalProperties: false },
);
const reasonSchema = Type.Object(
  {
    contractId: Type.Literal('SHIFAA-F011-ALLERGY-REASON/1'),
    reason: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type Facts = Static<typeof factsSchema>;
export type Reason = Static<typeof reasonSchema>;
export interface AllergyContext {
  allergyId: string;
  revisionId: string;
  revisionVersion: string | number;
  fieldId?: string;
  keyRef?: string;
  resourceType?: string;
}
export interface ProtectedAllergy {
  protectedFacts: Envelope;
  protectedReason: Envelope | null;
}
export function factsBytes(facts: unknown): Buffer {
  const bytes = canonicalBytes(facts);
  if (!Value.Check(factsSchema, facts)) {
    bytes.fill(0);
    deny();
  }
  return bytes;
}
export function reasonBytes(reason: unknown): Buffer {
  const bytes = canonicalBytes(reason);
  if (!Value.Check(reasonSchema, reason)) {
    bytes.fill(0);
    deny();
  }
  return bytes;
}
export function allergyAad(context: AllergyContext): Buffer {
  if (context.resourceType !== undefined && context.resourceType !== 'clinical.allergy_revision')
    deny();
  if (context.fieldId !== 'facts' && context.fieldId !== 'verification_reason') deny();
  return frames('SHIFAA-F011-ALLERGY-AAD/1;', [
    'clinical.allergy_revision',
    uuid(context.allergyId),
    uuid(context.revisionId),
    version(context.revisionVersion),
    context.fieldId,
    metadata(context.keyRef),
  ]);
}
export async function creationFacts(
  request: Feature011CreateAllergyRequest,
  validateCoding: (coding: Facts['coding']) => Promise<void>,
): Promise<Facts> {
  if (!Value.Check(feature011Schemas.CreateAllergyRequest, request)) deny();
  const facts: Facts = {
    contractId: 'SHIFAA-F011-ALLERGY-FACTS/1',
    substance: request.substance,
    source: request.source,
    coding: request.coding ?? { knowledge: 'unknown' },
    reaction: request.reaction ?? { knowledge: 'unknown' },
    severity: request.severity ?? { knowledge: 'unknown' },
    onset: request.onset ?? { knowledge: 'unknown' },
  };
  if (facts.coding.knowledge === 'known') await validateCoding(facts.coding);
  return facts;
}
export async function correctedFacts(
  previous: Facts,
  corrections: Feature011AllergyCorrections,
  validateCoding: (coding: Facts['coding']) => Promise<void>,
): Promise<Facts> {
  if (
    !Value.Check(factsSchema, previous) ||
    !Value.Check(feature011Schemas.AllergyCorrections, corrections)
  )
    deny();
  if (corrections.coding?.knowledge === 'known') {
    const candidateBytes = canonicalBytes(corrections.coding),
      previousBytes = canonicalBytes(previous.coding);
    try {
      if (!candidateBytes.equals(previousBytes)) await validateCoding(corrections.coding);
    } finally {
      candidateBytes.fill(0);
      previousBytes.fill(0);
    }
  }
  return { ...previous, ...corrections, source: previous.source };
}
export async function protectAllergy(
  provider: KeyProvider | undefined,
  context: AllergyContext,
  facts: Facts,
  reason: Reason | null,
): Promise<ProtectedAllergy> {
  if ((version(context.revisionVersion) === '1') !== (reason === null)) deny();
  const encrypt = async (field: 'facts' | 'verification_reason', bytes: Buffer) => {
    try {
      const cap = await prepareCapability(provider, 'allergy', 'encrypt');
      try {
        return cap.encrypt(bytes, allergyAad({ ...context, fieldId: field, keyRef: cap.keyRef }));
      } finally {
        cap.dispose();
      }
    } finally {
      bytes.fill(0);
    }
  };
  const protectedFacts = await encrypt('facts', factsBytes(facts));
  const protectedReason =
    reason === null ? null : await encrypt('verification_reason', reasonBytes(reason));
  return { protectedFacts, protectedReason };
}
export async function reconstructAllergy(
  provider: KeyProvider | undefined,
  context: AllergyContext,
  envelopes: ProtectedAllergy,
  authorizeExactRevision: () => Promise<void>,
): Promise<{ facts: Facts; reason: Reason | null }> {
  await authorizeExactRevision();
  const decrypt = async (field: 'facts' | 'verification_reason', envelope: Envelope) => {
    const cap = await prepareCapability(provider, 'allergy', 'decrypt', envelope.keyRef);
    let bytes: Buffer | undefined;
    try {
      bytes = cap.decrypt(envelope, allergyAad({ ...context, fieldId: field, keyRef: cap.keyRef }));
      const value = decodeCanonical(bytes);
      if (!Value.Check(field === 'facts' ? factsSchema : reasonSchema, value)) deny();
      return value;
    } finally {
      bytes?.fill(0);
      cap.dispose();
    }
  };
  return {
    facts: (await decrypt('facts', envelopes.protectedFacts)) as Facts,
    reason:
      envelopes.protectedReason === null
        ? null
        : ((await decrypt('verification_reason', envelopes.protectedReason)) as Reason),
  };
}
