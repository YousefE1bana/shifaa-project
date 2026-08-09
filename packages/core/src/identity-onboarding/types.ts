export type Locale = 'ar-EG' | 'en-EG';
export type IdentityType = 'egyptian_national_id' | 'passport' | 'unhcr_card';
export type VerificationState =
  | 'pending'
  | 'manual_review'
  | 'verified'
  | 'rejected'
  | 'failed'
  | 'expired';
export type ConsentDecision = 'granted' | 'refused' | 'withdrawn';

export interface PersonAggregate {
  authSubjectId: string;
  personId: string;
  patientId: string;
  selfRelationshipId: string;
  preferredLocale: Locale;
  version: number;
}

export interface EncryptedIdentity {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authenticationTag: Uint8Array;
  blindIndex: Uint8Array;
  keyVersion: number;
}

export interface IdentityCipher {
  encrypt(value: string, type: IdentityType): EncryptedIdentity;
  decrypt(value: EncryptedIdentity, type: IdentityType): string;
}

export interface VerificationCaseState {
  id: string;
  state: VerificationState;
  version: number;
  reasonCode?: string;
}

export interface ConsentRecord {
  id: string;
  personId: string;
  purposeCode: string;
  purposeVersion: string;
  noticeVersion: string;
  decision: ConsentDecision;
  occurredAt: string;
  supersedesId?: string;
  version: number;
}
