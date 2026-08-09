export type ReviewerContext = {
  aal: 1 | 2;
  purpose: 'identity_review' | null;
  assignedCaseIds: readonly string[];
  subjectId: string;
};
export type ReviewCase = {
  id: string;
  subjectId: string;
  identityType: string;
  maskedValue: string;
  status: 'manual_review';
  ageHours: number;
  version: number;
};

export const minimumReviewProjection = (reviewCase: ReviewCase) => ({
  id: reviewCase.id,
  identityType: reviewCase.identityType,
  maskedValue: reviewCase.maskedValue,
  status: reviewCase.status,
  ageHours: reviewCase.ageHours,
  version: reviewCase.version,
});

export const authorizeReview = (context: ReviewerContext, reviewCase: ReviewCase) => {
  if (context.aal !== 2) return 'aal2_required' as const;
  if (context.purpose !== 'identity_review') return 'purpose_required' as const;
  if (context.subjectId === reviewCase.subjectId) return 'self_review_denied' as const;
  if (!context.assignedCaseIds.includes(reviewCase.id)) return 'assignment_required' as const;
  return 'allowed' as const;
};

export const validateDecision = (decision: 'approve' | 'reject', reason: string) =>
  reason.trim().length < 3
    ? { valid: false, error: 'reason_required' as const }
    : { valid: true, decision, reason: reason.trim() };
