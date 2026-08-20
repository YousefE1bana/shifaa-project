import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeReview,
  minimumReviewProjection,
  validateDecision,
  type ReviewCase,
} from '../src/app/identity-reviews/review-model.ts';

const reviewCase: ReviewCase = {
  id: 'case-1',
  subjectId: 'patient-1',
  identityType: 'passport',
  maskedValue: '••••4812',
  status: 'manual_review',
  ageHours: 2,
  version: 1,
};

test('review requires AAL2, purpose, assignment and separation of duties', () => {
  assert.equal(
    authorizeReview(
      { aal: 1, purpose: 'identity_review', assignedCaseIds: ['case-1'], subjectId: 'reviewer-1' },
      reviewCase,
    ),
    'aal2_required',
  );
  assert.equal(
    authorizeReview(
      { aal: 2, purpose: null, assignedCaseIds: ['case-1'], subjectId: 'reviewer-1' },
      reviewCase,
    ),
    'purpose_required',
  );
  assert.equal(
    authorizeReview(
      { aal: 2, purpose: 'identity_review', assignedCaseIds: ['case-1'], subjectId: 'patient-1' },
      reviewCase,
    ),
    'self_review_denied',
  );
  assert.equal(
    authorizeReview(
      { aal: 2, purpose: 'identity_review', assignedCaseIds: ['case-2'], subjectId: 'reviewer-1' },
      reviewCase,
    ),
    'assignment_required',
  );
  assert.equal(
    authorizeReview(
      { aal: 2, purpose: 'identity_review', assignedCaseIds: ['case-1'], subjectId: 'reviewer-1' },
      reviewCase,
    ),
    'allowed',
  );
});

test('minimum projection contains no unrelated patient fields and reason is mandatory', () => {
  const projection = minimumReviewProjection(reviewCase);
  assert.deepEqual(
    Object.keys(projection).sort(),
    ['ageHours', 'id', 'identityType', 'maskedValue', 'status', 'version'].sort(),
  );
  assert.equal(validateDecision('approve', ' ').valid, false);
  assert.equal(validateDecision('reject', 'Document unreadable').valid, true);
});

test('live admin review is bilingual and permits the documented local dev origin', async () => {
  const fs = await import('node:fs/promises');
  const worklist = await fs.readFile(
    new URL('../src/app/identity-reviews/ReviewWorklist.tsx', import.meta.url),
    'utf8',
  );
  const nextConfig = await fs.readFile(new URL('../next.config.ts', import.meta.url), 'utf8');
  assert.match(worklist, /Identity review/);
  assert.match(worklist, /مراجعة الهوية/);
  assert.match(nextConfig, /allowedDevOrigins:/);
  assert.match(nextConfig, /'127\.0\.0\.1'/);
  assert.match(nextConfig, /'host\.docker\.internal'/);
});
