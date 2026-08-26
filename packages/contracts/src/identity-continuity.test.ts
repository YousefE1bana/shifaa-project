import { readFileSync } from 'node:fs';

import { FormatRegistry } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
  BeginEnrollmentRequestSchema,
  NativeRefreshRequestSchema,
  RefreshRequestSchema,
  SessionResultSchema,
  identityContinuityOperationIds,
  identityContinuityOperations,
  identityContinuityRequestSchemas,
  identityContinuityResponseSchemas,
} from './identity-continuity.js';

FormatRegistry.Set('uuid', (value) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value));
FormatRegistry.Set('date-time', (value) => Number.isFinite(Date.parse(value)));

describe('identity continuity contracts', () => {
  it('matches the frozen exact eight-operation OpenAPI inventory', () => {
    const document = parse(
      readFileSync(
        new URL(
          '../../../specs/007-identity-continuity-sessions-mfa-recovery/contracts/openapi.yaml',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as {
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            'x-shifaa-requirements': string[];
            responses: Record<string, unknown>;
          }
        >
      >;
    };
    const actual = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path,
        requirements: operation['x-shifaa-requirements'],
        responses: operation.responses,
      })),
    );
    expect(actual).toHaveLength(8);
    expect(new Set(actual.map(({ operationId }) => operationId))).toEqual(
      new Set(identityContinuityOperationIds),
    );
    for (const operation of actual) {
      const expected =
        identityContinuityOperations[
          operation.operationId as keyof typeof identityContinuityOperations
        ];
      expect([operation.method, operation.path]).toEqual(expected.slice(0, 2));
      for (const requirement of expected[2]) expect(operation.requirements).toContain(requirement);
      expect(operation.responses).toHaveProperty('400');
    }
    for (const operationId of [
      'beginMfaEnrollment',
      'removeMfaFactor',
      'completeRecovery',
      'transitionDependent',
    ]) {
      expect(
        actual.find((operation) => operation.operationId === operationId)?.responses,
      ).toHaveProperty('422');
    }
    expect(Object.keys(identityContinuityRequestSchemas)).toEqual(identityContinuityOperationIds);
    expect(Object.keys(identityContinuityResponseSchemas)).toEqual(identityContinuityOperationIds);
  });

  it('keeps web/native refresh mutually exclusive and rejects unknown fields', () => {
    expect(Value.Check(RefreshRequestSchema, { client: 'web', foregroundEngaged: true })).toBe(
      true,
    );
    expect(
      Value.Check(RefreshRequestSchema, {
        client: 'native',
        foregroundEngaged: true,
        refreshToken: 'opaque-token',
      }),
    ).toBe(true);
    expect(
      Value.Check(RefreshRequestSchema, {
        client: 'web',
        foregroundEngaged: true,
        refreshToken: 'opaque-token',
      }),
    ).toBe(false);
    expect(Value.Check(RefreshRequestSchema, { client: 'native', foregroundEngaged: true })).toBe(
      false,
    );
  });

  it('accepts opaque provider refresh tokens while rejecting empty values', () => {
    expect(
      Value.Check(NativeRefreshRequestSchema, {
        client: 'native',
        foregroundEngaged: true,
        refreshToken: '123456789012',
      }),
    ).toBe(true);
    expect(
      Value.Check(NativeRefreshRequestSchema, {
        client: 'native',
        foregroundEngaged: true,
        refreshToken: '',
      }),
    ).toBe(false);
    expect(
      Value.Check(NativeRefreshRequestSchema, {
        client: 'native',
        foregroundEngaged: true,
        refreshToken: 'x'.repeat(4096),
      }),
    ).toBe(true);
    expect(
      Value.Check(NativeRefreshRequestSchema, {
        client: 'native',
        foregroundEngaged: true,
        refreshToken: 'x'.repeat(4097),
      }),
    ).toBe(false);
    const session = {
      accessToken: 'x'.repeat(32),
      sessionId: '71000000-0000-4000-8000-000000000001',
      assurance: 'aal1',
      expiresAt: '2026-08-26T00:15:00.000Z',
      restriction: null,
    } as const;
    expect(Value.Check(SessionResultSchema, { ...session, refreshToken: '123456789012' })).toBe(
      true,
    );
    expect(Value.Check(SessionResultSchema, { ...session, refreshToken: '' })).toBe(false);
    expect(Value.Check(SessionResultSchema, { ...session, refreshToken: 'x'.repeat(4096) })).toBe(
      true,
    );
    expect(Value.Check(SessionResultSchema, { ...session, refreshToken: 'x'.repeat(4097) })).toBe(
      false,
    );
    expect(Value.Check(SessionResultSchema, { ...session, accessToken: 'x'.repeat(31) })).toBe(
      false,
    );
  });

  it('recognizes passkey input for a deterministic semantic rejection without enabling it', () => {
    expect(Value.Check(BeginEnrollmentRequestSchema, { factorType: 'passkey' })).toBe(true);
    expect(Value.Check(BeginEnrollmentRequestSchema, { factorType: 'phone' })).toBe(false);
  });
});
