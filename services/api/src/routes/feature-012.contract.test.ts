import { Value } from '@sinclair/typebox/value';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  feature012HeaderSchemas,
  feature012Operations,
  feature012ResponseSchemas,
  feature012Schemas,
  type Feature012OperationId,
} from '@shifaa/contracts/feature-012';

const scenarios = [
  ['createPrescription', 'atomic-create', 201],
  ['updatePrescription', 'draft-update', 200, 'numeric'],
  ['updatePrescription', 'release-projection', 200, 'projection'],
  ['updatePrescription', 'withdraw-projection', 200, 'projection'],
  ['getPrescription', 'released-subject', 200],
  ['runPrescriptionSafety', 'fresh-check', 200],
  ['acknowledgeWarning', 'warning-acknowledgement', 201],
  ['requestContraindicatedOverride', 'independent-review-request', 201],
  ['decideOverride', 'assigned-independent-decision', 200],
  ['signPrescription', 'signed-simulation', 200],
  ['cancelPrescription', 'cancelled-prescription', 200],
  ['listPatientMedications', 'released-prescribed-statements', 200],
  ['getOverrideReviewCases', 'discover', 200],
  ['getOverrideReviewCases', 'discover-next-page-same-scope', 200],
  ['getOverrideReviewCases', 'detail-after-claim', 200],
  ['transitionOverrideReviewAssignment', 'claim', 200],
  ['transitionOverrideReviewAssignment', 'release_own', 200],
  ['transitionOverrideReviewAssignment', 'takeover_invalid', 200],
] as const satisfies readonly (readonly [
  Feature012OperationId,
  string,
  number,
  ('numeric' | 'projection')?,
])[];

const rejectionScenarios = [
  ['createPrescription', 'forged-patient-and-facility', [400], 'validation-failed'],
  ['updatePrescription', 'mixed-draft-and-release', [400], 'validation-failed'],
  ['updatePrescription', 'cross-branch-etag', [400, 409]],
  ['updatePrescription', 'manual-release-after-withdrawal', [409], 'state-transition-invalid'],
  ['getPrescription', 'cross-subject-disclosure', [403, 404]],
  ['runPrescriptionSafety', 'missing-if-match', [400], 'validation-failed'],
  ['runPrescriptionSafety', 'stale-if-match', [409], 'version-conflict'],
  ['acknowledgeWarning', 'missing-applicable-monitoring', [400], 'validation-failed'],
  ['requestContraindicatedOverride', 'forged-context-header-without-native-session', [401]],
  ['decideOverride', 'alternate-account-same-person', [403, 404]],
  ['signPrescription', 'missing-idempotency-key', [400], 'validation-failed'],
  ['cancelPrescription', 'changed-body-replay', [409], 'idempotency-key-reused'],
  ['listPatientMedications', 'transferred-cursor-other-subject', [400, 403, 404]],
  ['getOverrideReviewCases', 'duplicate-selector', [400], 'validation-failed'],
  ['getOverrideReviewCases', 'mixed-selectors', [400], 'validation-failed'],
  ['getOverrideReviewCases', 'guessed-unassigned-detail', [403, 404]],
  ['getOverrideReviewCases', 'stale-detail', [409], 'version-conflict'],
  ['getOverrideReviewCases', 'transferred-cursor-other-actor', [400, 403, 404]],
  ['getOverrideReviewCases', 'transferred-cursor-other-facility', [400, 403, 404]],
  ['getOverrideReviewCases', 'transferred-cursor-other-lane', [400, 403, 404]],
  ['getOverrideReviewCases', 'transferred-cursor-other-scope', [400, 403, 404]],
  ['getOverrideReviewCases', 'expired-cursor', [400, 403, 404]],
  ['getOverrideReviewCases', 'auth-revoked-between-pages', [403, 404]],
  ['transitionOverrideReviewAssignment', 'assignee-injection', [400], 'validation-failed'],
  [
    'transitionOverrideReviewAssignment',
    'valid-holder-takeover',
    [409],
    'state-transition-invalid',
  ],
] as const satisfies readonly (readonly [
  Feature012OperationId,
  string,
  readonly number[],
  string?,
])[];

type ScenarioName = (typeof scenarios | typeof rejectionScenarios)[number][1];

interface RouteFixture {
  app: FastifyInstance;
  request: InjectOptions & { url: string; method: string };
  // Fixture-specific observable effect/readback, including no writes on rejections.
  checkEffects: (response: unknown) => Promise<void>;
  close: () => Promise<void>;
}

type Setup = (operation: Feature012OperationId, scenario: ScenarioName) => Promise<RouteFixture>;

function assertBinding(operationId: Feature012OperationId, request: RouteFixture['request']) {
  const operation = feature012Operations.find((row) => row.operationId === operationId)!;
  const pathPattern = operation.path.replace(/\{\w+\}/g, '[^/]+');
  expect(request.method).toBe(operation.method);
  expect(request.url.split('?')[0]).toMatch(new RegExp(`^/v1${pathPattern}$`));
  return operation;
}

// Owning story checkpoints supply isolated synthetic fixture setup using the
// registered routes and native authority sessions. No harness is started by
// the schema/client tests or by discovery of this suite.
export function defineFeature012RouteCases(setup?: Setup) {
  describe.skipIf(!setup)('F012 route integration (requires owning story fixture setup)', () => {
    it.each(scenarios)('%s / %s', async (operationId, scenario, status, branch?) => {
      const fixture = await setup!(operationId, scenario);
      try {
        const operation = assertBinding(operationId, fixture.request);
        const response = await fixture.app.inject(fixture.request);
        const payload: unknown = response.json();
        expect(response.statusCode).toBe(status);
        expect(response.headers['content-type']).toMatch(/^application\/json\b/);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(
          Value.Check(feature012HeaderSchemas.RequestId, response.headers['x-request-id']),
        ).toBe(true);
        expect(
          Value.Check(
            feature012HeaderSchemas.ContentLanguage,
            response.headers['content-language'],
          ),
        ).toBe(true);
        expect(Value.Check(feature012ResponseSchemas[operationId], payload)).toBe(true);
        const etag = operation.etag;
        if (etag) {
          expect(Value.Check(feature012HeaderSchemas[etag], response.headers.etag)).toBe(true);
        }
        if (branch) {
          expect(response.headers.etag).toMatch(branch === 'numeric' ? /^"[1-9]\d*"$/ : /^"ppc:/);
          expect(
            Value.Check(
              feature012Schemas[
                branch === 'numeric' ? 'PrescriptionMutation' : 'ProjectionControlResult'
              ],
              payload,
            ),
          ).toBe(true);
        }
        await fixture.checkEffects(payload);
      } finally {
        await fixture.close();
      }
    });

    it.each(rejectionScenarios)('%s / %s', async (operationId, scenario, statuses, code?) => {
      const fixture = await setup!(operationId, scenario);
      try {
        const operation = assertBinding(operationId, fixture.request);
        const response = await fixture.app.inject(fixture.request);
        expect(statuses).toContain(response.statusCode);
        expect(response.headers['content-type']).toMatch(/^application\/problem\+json\b/);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(
          Value.Check(feature012HeaderSchemas.RequestId, response.headers['x-request-id']),
        ).toBe(true);
        expect(
          Value.Check(
            feature012HeaderSchemas.ContentLanguage,
            response.headers['content-language'],
          ),
        ).toBe(true);
        const problem = response.json<{ code: string; request_id: string }>();
        const name =
          operation.problems[String(response.statusCode) as keyof typeof operation.problems];
        expect(Value.Check(feature012Schemas[name], problem)).toBe(true);
        expect(problem.request_id).toBe(response.headers['x-request-id']);
        if (code) expect(problem.code).toBe(code);
        await fixture.checkEffects(problem);
      } finally {
        await fixture.close();
      }
    });
  });
}

defineFeature012RouteCases();
