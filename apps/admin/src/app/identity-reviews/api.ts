import { IdentityOnboardingClient } from '@shifaa/api-client';

import type { ReviewCase } from './review-model';

type ReviewList = {
  data: Array<{
    id: string;
    identity_type?: string;
    masked_value?: string;
    status: 'manual_review';
    version: number;
  }>;
  meta: { next_cursor: string | null };
};

const client = new IdentityOnboardingClient({
  baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
  accessToken: 'synthetic-reviewer:00000000-0000-4000-8000-000000000002',
  defaultHeaders: { 'X-AAL': '2', 'X-Purpose': 'identity.review' },
});

export async function loadAssignedReviews(): Promise<ReviewCase[]> {
  const result = (await client.listIdentityVerificationCases()) as ReviewList;
  return result.data.map((item) => ({
    id: item.id,
    subjectId: 'redacted',
    identityType: item.identity_type ?? 'unknown',
    maskedValue: item.masked_value ?? '—',
    status: item.status,
    ageHours: 0,
    version: item.version,
  }));
}

export async function saveReviewDecision(
  reviewCase: ReviewCase,
  decision: 'approve' | 'reject',
  reason: string,
): Promise<void> {
  await client.reviewVerificationCase(
    reviewCase.id,
    { decision, reason },
    reviewCase.version,
    `review-${reviewCase.id}-${reviewCase.version}-${decision}`,
  );
}
