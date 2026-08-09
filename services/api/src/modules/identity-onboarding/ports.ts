import type {
  ConsentRecord,
  EncryptedIdentity,
  IdentityCipher,
  IdentityType,
  Locale,
  PersonAggregate,
  VerificationState,
} from '@shifaa/core';

export interface AuthChallenge {
  subjectId: string;
  challengeId: string;
}

export interface AuthSession {
  subjectId: string;
  accessToken: string;
  aal: 1 | 2;
}

export interface AuthIssuer {
  register(handle: string, password: string, locale: Locale): Promise<AuthChallenge>;
  login(handle: string, password: string): Promise<AuthChallenge>;
  verifyOtp(challengeId: string, code: string): Promise<AuthSession>;
  resolveSession(accessToken: string): Promise<AuthSession | undefined>;
}

export type ProofingOutcome = 'verified' | 'pending' | 'manual_review' | 'failed' | 'timeout';

export interface ProofingProvider {
  readonly name: 'local' | 'valify';
  verify(input: {
    identityType: IdentityType;
    value: string;
    issuingCountry: string;
  }): Promise<{ outcome: ProofingOutcome; transactionId?: string }>;
}

export interface UploadStore {
  createIntent(input: {
    caseId: string;
    mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
    sizeBytes: number;
    sha256: string;
  }): Promise<{ objectId: string; uploadUrl: string; expiresAt: string; state: 'quarantine' }>;
}

export interface ProfileRecord {
  id: string;
  authSubjectId: string;
  displayName: string;
  birthDate: string | null;
  nationalityCode: string;
  preferredLocale: Locale;
  verificationStatus: string;
  version: number;
}

export interface StoredIdentity {
  id: string;
  personId: string;
  identityType: IdentityType;
  encrypted: EncryptedIdentity;
  issuingCountry: string;
  expiresOn?: string | null;
  maskedValue: string;
  verificationStatus: VerificationState;
  version: number;
}

export interface StoredVerificationCase {
  id: string;
  identityId: string;
  identityType: IdentityType;
  maskedValue: string;
  ownerPersonId: string;
  provider: string;
  providerTransactionId?: string;
  status: VerificationState;
  assignedReviewerPersonId?: string;
  reviewerPersonId?: string;
  reasonCode?: string;
  evidenceObjectId?: string;
  version: number;
}

export interface AuditOutcome {
  actorPersonId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome: 'allowed' | 'denied' | 'failed';
  requestId: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface OutboxOutcome {
  eventType:
    | 'identity.verification.changed'
    | 'identity.manual_review.requested'
    | 'consent.changed';
  aggregateId: string;
  payload: Readonly<Record<string, string>>;
}

export interface IdentityRepository {
  transaction<T>(work: () => Promise<T> | T): Promise<T>;
  createRegistration(authSubjectId: string, handle: string, locale: Locale): PersonAggregate;
  profileByAuthSubject(authSubjectId: string): ProfileRecord | undefined;
  updateProfile(
    personId: string,
    expectedVersion: number,
    patch: Partial<
      Pick<ProfileRecord, 'displayName' | 'birthDate' | 'nationalityCode' | 'preferredLocale'>
    >,
  ): ProfileRecord;
  hasActiveInventory(purposeCode: string): boolean;
  createIdentity(input: Omit<StoredIdentity, 'id' | 'version'>): StoredIdentity;
  identitiesForPerson(personId: string): readonly StoredIdentity[];
  createVerificationCase(
    input: Omit<StoredVerificationCase, 'id' | 'version'>,
  ): StoredVerificationCase;
  verificationCase(caseId: string): StoredVerificationCase | undefined;
  verificationCases(): readonly StoredVerificationCase[];
  replaceVerificationCase(value: StoredVerificationCase): void;
  currentNotice(locale: Locale): {
    noticeCode: string;
    version: string;
    locale: Locale;
    content: string;
    purposes: readonly { purposeCode: string; version: string; label: string; optional: boolean }[];
  };
  consentsForPerson(personId: string): readonly ConsentRecord[];
  appendConsent(record: ConsentRecord): void;
  consent(consentId: string): ConsentRecord | undefined;
  appendAudit(value: AuditOutcome): void;
  appendOutbox(value: OutboxOutcome): void;
  readonly audits: readonly AuditOutcome[];
  readonly outbox: readonly OutboxOutcome[];
}

export type IdentityOnboardingPorts = {
  auth: AuthIssuer;
  cipher: IdentityCipher;
  proofing: ProofingProvider;
  uploads: UploadStore;
  repository: IdentityRepository;
  clock: { now(): Date };
  ids: { uuid(): string };
};
