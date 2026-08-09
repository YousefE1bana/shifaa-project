import { randomUUID } from 'node:crypto';

import type { ConsentRecord, Locale, PersonAggregate } from '@shifaa/core';

import { ApiPolicyError } from './errors.js';
import type {
  AuditOutcome,
  IdentityRepository,
  OutboxOutcome,
  ProfileRecord,
  StoredIdentity,
  StoredVerificationCase,
} from './ports.js';

interface Snapshot {
  profiles: Map<string, ProfileRecord>;
  aggregates: Map<string, PersonAggregate>;
  identities: Map<string, StoredIdentity>;
  cases: Map<string, StoredVerificationCase>;
  consents: Map<string, ConsentRecord>;
  audits: AuditOutcome[];
  outbox: OutboxOutcome[];
}

export class InMemoryIdentityRepository implements IdentityRepository {
  private profiles = new Map<string, ProfileRecord>();
  private aggregates = new Map<string, PersonAggregate>();
  private identities = new Map<string, StoredIdentity>();
  private cases = new Map<string, StoredVerificationCase>();
  private consentRecords = new Map<string, ConsentRecord>();
  private auditRecords: AuditOutcome[] = [];
  private outboxRecords: OutboxOutcome[] = [];
  private inventory = new Set(['identity_proofing', 'care_updates']);

  public get audits(): readonly AuditOutcome[] {
    return this.auditRecords;
  }

  public get outbox(): readonly OutboxOutcome[] {
    return this.outboxRecords;
  }

  public async transaction<T>(work: () => Promise<T> | T): Promise<T> {
    const before = this.snapshot();
    try {
      return await work();
    } catch (error) {
      this.restore(before);
      throw error;
    }
  }

  public createRegistration(
    authSubjectId: string,
    handle: string,
    locale: Locale,
  ): PersonAggregate {
    const existing = this.aggregates.get(authSubjectId);
    if (existing) return existing;
    const personId = randomUUID();
    const aggregate: PersonAggregate = {
      authSubjectId,
      personId,
      patientId: randomUUID(),
      selfRelationshipId: randomUUID(),
      preferredLocale: locale,
      version: 1,
    };
    this.aggregates.set(authSubjectId, aggregate);
    this.profiles.set(personId, {
      id: personId,
      authSubjectId,
      displayName: '',
      birthDate: null,
      nationalityCode: 'EG',
      preferredLocale: locale,
      verificationStatus: 'unverified',
      version: 1,
    });
    void handle;
    return aggregate;
  }

  public profileByAuthSubject(authSubjectId: string): ProfileRecord | undefined {
    return [...this.profiles.values()].find((profile) => profile.authSubjectId === authSubjectId);
  }

  public updateProfile(
    personId: string,
    expectedVersion: number,
    patch: Partial<
      Pick<ProfileRecord, 'displayName' | 'birthDate' | 'nationalityCode' | 'preferredLocale'>
    >,
  ): ProfileRecord {
    const current = this.profiles.get(personId);
    if (!current) throw new ApiPolicyError('profile-not-found', 404, 'Profile not found.');
    if (current.version !== expectedVersion) {
      throw new ApiPolicyError('version-conflict', 409, 'Refresh the profile before saving again.');
    }
    const next = { ...current, ...patch, version: current.version + 1 };
    this.profiles.set(personId, next);
    return next;
  }

  public hasActiveInventory(purposeCode: string): boolean {
    return this.inventory.has(purposeCode);
  }

  public setInventory(purposeCode: string, enabled: boolean): void {
    if (enabled) this.inventory.add(purposeCode);
    else this.inventory.delete(purposeCode);
  }

  public createIdentity(input: Omit<StoredIdentity, 'id' | 'version'>): StoredIdentity {
    const duplicate = [...this.identities.values()].find(
      (identity) =>
        identity.identityType === input.identityType &&
        Buffer.from(identity.encrypted.blindIndex).equals(
          Buffer.from(input.encrypted.blindIndex),
        ) &&
        !['rejected'].includes(identity.verificationStatus),
    );
    if (duplicate) {
      throw new ApiPolicyError('identity-already-registered', 409, 'This identity already exists.');
    }
    const stored = { ...input, id: randomUUID(), version: 1 };
    this.identities.set(stored.id, stored);
    return stored;
  }

  public identitiesForPerson(personId: string): readonly StoredIdentity[] {
    return [...this.identities.values()].filter((identity) => identity.personId === personId);
  }

  public createVerificationCase(
    input: Omit<StoredVerificationCase, 'id' | 'version'>,
  ): StoredVerificationCase {
    const stored = { ...input, id: randomUUID(), version: 1 };
    this.cases.set(stored.id, stored);
    return stored;
  }

  public verificationCase(caseId: string): StoredVerificationCase | undefined {
    return this.cases.get(caseId);
  }

  public verificationCases(): readonly StoredVerificationCase[] {
    return [...this.cases.values()];
  }

  public replaceVerificationCase(value: StoredVerificationCase): void {
    this.cases.set(value.id, value);
    const identity = this.identities.get(value.identityId);
    if (identity)
      this.identities.set(identity.id, { ...identity, verificationStatus: value.status });
  }

  public currentNotice(locale: Locale) {
    return {
      noticeCode: 'identity-onboarding',
      version: '1.0.0',
      locale,
      content:
        locale === 'ar-EG'
          ? 'نستخدم بياناتك لإنشاء ملفك والتحقق من هويتك. اختر كل غرض اختياري بشكل مستقل.'
          : 'We use your data to create your profile and verify your identity. Choose each optional purpose independently.',
      purposes: [
        {
          purposeCode: 'identity_proofing',
          version: '1.0.0',
          label: locale === 'ar-EG' ? 'التحقق من الهوية' : 'Identity verification',
          optional: false,
        },
        {
          purposeCode: 'care_updates',
          version: '1.0.0',
          label: locale === 'ar-EG' ? 'تحديثات الرعاية' : 'Care updates',
          optional: true,
        },
      ],
    } as const;
  }

  public consentsForPerson(personId: string): readonly ConsentRecord[] {
    return [...this.consentRecords.values()].filter((record) => record.personId === personId);
  }

  public appendConsent(record: ConsentRecord): void {
    this.consentRecords.set(record.id, record);
  }

  public consent(consentId: string): ConsentRecord | undefined {
    return this.consentRecords.get(consentId);
  }

  public appendAudit(value: AuditOutcome): void {
    this.auditRecords.push(value);
  }

  public appendOutbox(value: OutboxOutcome): void {
    const prohibited = ['value', 'handle', 'password', 'otp', 'token', 'document'];
    if (Object.keys(value.payload).some((key) => prohibited.includes(key.toLowerCase()))) {
      throw new ApiPolicyError('event-payload-prohibited', 500, 'Prohibited event payload field.');
    }
    this.outboxRecords.push(value);
  }

  private snapshot(): Snapshot {
    return {
      profiles: new Map([...this.profiles].map(([key, value]) => [key, { ...value }])),
      aggregates: new Map([...this.aggregates].map(([key, value]) => [key, { ...value }])),
      identities: new Map([...this.identities].map(([key, value]) => [key, { ...value }])),
      cases: new Map([...this.cases].map(([key, value]) => [key, { ...value }])),
      consents: new Map([...this.consentRecords].map(([key, value]) => [key, { ...value }])),
      audits: this.auditRecords.map((value) => ({ ...value })),
      outbox: this.outboxRecords.map((value) => ({ ...value })),
    };
  }

  private restore(snapshot: Snapshot): void {
    this.profiles = snapshot.profiles;
    this.aggregates = snapshot.aggregates;
    this.identities = snapshot.identities;
    this.cases = snapshot.cases;
    this.consentRecords = snapshot.consents;
    this.auditRecords = snapshot.audits;
    this.outboxRecords = snapshot.outbox;
  }
}
