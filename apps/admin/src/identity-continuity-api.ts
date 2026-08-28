import { FamilyCareClient } from '@shifaa/api-client/family-care';
import { IdentityContinuityClient } from '@shifaa/api-client/identity-continuity';
import type { DependentTransitionWorklistPage } from '@shifaa/contracts/family-care';
import type { TransitionRequest, TransitionResult } from '@shifaa/contracts/identity-continuity';

type Locale = 'ar-EG' | 'en-EG';

export class AdminTransitionApi {
  public constructor(
    private readonly options: {
      locale: Locale;
      accessToken: () => string | undefined;
      fetch?: typeof globalThis.fetch;
      apiBaseUrl?: string;
    },
  ) {}

  public async listAssignedTransitions(): Promise<DependentTransitionWorklistPage> {
    assertIdentityContinuityOnline();
    return this.familyClient().listGuardianshipCases({ mode: 'dependent_transition', limit: 25 });
  }

  public async decideTransition(
    relationshipId: string,
    body: TransitionRequest,
    continuityCaseVersion: number,
  ): Promise<TransitionResult> {
    assertIdentityContinuityOnline();
    return (await this.identityClient().transitionDependent(
      relationshipId,
      body,
      continuityCaseVersion,
      mutationKey('transition-decision'),
    )) as TransitionResult;
  }

  private familyClient(): FamilyCareClient {
    return new FamilyCareClient({
      baseUrl: this.baseUrl(),
      accessToken: this.requireAccessToken(),
      acceptLanguage: this.options.locale,
      defaultHeaders: { 'X-AAL': '2', 'X-Purpose': 'guardianship_review' },
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }

  private identityClient(): IdentityContinuityClient {
    return new IdentityContinuityClient({
      baseUrl: this.baseUrl(),
      accessToken: () => this.requireAccessToken(),
      acceptLanguage: this.options.locale,
      defaultHeaders: { 'X-Purpose': 'guardianship_review' },
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }

  private baseUrl(): string {
    return (
      this.options.apiBaseUrl ?? process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000'
    );
  }

  private requireAccessToken(): string {
    const accessToken = this.options.accessToken();
    if (!accessToken) throw new Error('authentication-required');
    return accessToken;
  }
}

export function assertIdentityContinuityOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline-no-queue');
}

function mutationKey(action: string): string {
  return `synthetic-ui-007-${action}-${globalThis.crypto.randomUUID()}`;
}
