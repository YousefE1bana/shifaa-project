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
  sessionId?: string;
}

export interface SessionAuthority {
  authorize(session: AuthSession): Promise<'allowed' | 'revoked' | 'restricted'>;
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
  transaction<T>(work: () => Promise<T> | T, context?: RepositoryContext): Promise<T>;
  createRegistration(
    authSubjectId: string,
    handle: string,
    locale: Locale,
  ): Promise<PersonAggregate> | PersonAggregate;
  profileByAuthSubject(
    authSubjectId: string,
  ): Promise<ProfileRecord | undefined> | ProfileRecord | undefined;
  updateProfile(
    personId: string,
    expectedVersion: number,
    patch: Partial<
      Pick<ProfileRecord, 'displayName' | 'birthDate' | 'nationalityCode' | 'preferredLocale'>
    >,
  ): Promise<ProfileRecord> | ProfileRecord;
  hasActiveInventory(purposeCode: string): Promise<boolean> | boolean;
  setInventory(purposeCode: string, enabled: boolean): Promise<void> | void;
  createIdentity(
    input: Omit<StoredIdentity, 'id' | 'version'>,
  ): Promise<StoredIdentity> | StoredIdentity;
  identitiesForPerson(
    personId: string,
  ): Promise<readonly StoredIdentity[]> | readonly StoredIdentity[];
  createVerificationCase(
    input: Omit<StoredVerificationCase, 'id' | 'version'>,
  ): Promise<StoredVerificationCase> | StoredVerificationCase;
  verificationCase(
    caseId: string,
  ): Promise<StoredVerificationCase | undefined> | StoredVerificationCase | undefined;
  verificationCases():
    | Promise<readonly StoredVerificationCase[]>
    | readonly StoredVerificationCase[];
  replaceVerificationCase(value: StoredVerificationCase): Promise<void> | void;
  currentNotice(locale: Locale):
    | Promise<{
        noticeCode: string;
        version: string;
        locale: Locale;
        content: string;
        purposes: readonly {
          purposeCode: string;
          version: string;
          label: string;
          optional: boolean;
        }[];
      }>
    | {
        noticeCode: string;
        version: string;
        locale: Locale;
        content: string;
        purposes: readonly {
          purposeCode: string;
          version: string;
          label: string;
          optional: boolean;
        }[];
      };
  consentsForPerson(personId: string): Promise<readonly ConsentRecord[]> | readonly ConsentRecord[];
  appendConsent(record: ConsentRecord): Promise<void> | void;
  consent(consentId: string): Promise<ConsentRecord | undefined> | ConsentRecord | undefined;
  appendAudit(value: AuditOutcome): Promise<void> | void;
  appendOutbox(value: OutboxOutcome): Promise<void> | void;
  readonly audits: readonly AuditOutcome[];
  readonly outbox: readonly OutboxOutcome[];
}

export interface RepositoryContext {
  personId: string;
  role: 'PAT' | 'ADM-FACILITY' | 'SYS';
  aal: 1 | 2;
  purposes: readonly string[];
  principal: string;
}

export type IdentityOnboardingPorts = {
  auth: AuthIssuer;
  sessionAuthority?: SessionAuthority;
  cipher: IdentityCipher;
  proofing: ProofingProvider;
  uploads: UploadStore;
  repository: IdentityRepository;
  clock: { now(): Date };
  ids: { uuid(): string };
};
