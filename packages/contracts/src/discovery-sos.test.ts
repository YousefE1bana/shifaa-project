import { readFileSync } from 'node:fs';

import { FormatRegistry } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  CreateEmergencyShareRequestSchema,
  CreateSosIncidentRequestSchema,
  CapacityProjectionSchema,
  DISCOVERY_SOS_FEATURE_ID,
  EmergencyShareViewResponseSchema,
  discoverySosOperationIds,
  discoverySosOperations,
} from './discovery-sos.js';

FormatRegistry.Set('uuid', (candidate) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate),
);
FormatRegistry.Set('date-time', (candidate) => Number.isFinite(Date.parse(candidate)));
FormatRegistry.Set('uri', (candidate) => {
  try {
    new URL(candidate);
    return true;
  } catch {
    return false;
  }
});

describe('discovery and SOS contracts', () => {
  it('matches the frozen exact ten-operation OpenAPI inventory', () => {
    const contractPath = new URL(
      '../../../specs/006-discovery-sos-foundation/contracts/openapi.yaml',
      import.meta.url,
    );
    const document = parse(readFileSync(contractPath, 'utf8')) as {
      paths: Record<
        string,
        Record<string, { operationId: string; 'x-shifaa-requirements': string[] }>
      >;
    };
    const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({ path, method, ...operation })),
    );
    expect(DISCOVERY_SOS_FEATURE_ID).toBe('006-discovery-sos-foundation');
    expect(operations.map(({ operationId }) => operationId)).toEqual(discoverySosOperationIds);
    for (const operationId of discoverySosOperationIds) {
      const [method, path, requirements] = discoverySosOperations[operationId];
      const contractOperation = operations.find((entry) => entry.operationId === operationId);
      expect(contractOperation).toMatchObject({
        operationId,
        method: method.toLowerCase(),
        path,
        'x-shifaa-requirements': [...requirements],
      });
    }
  });

  it('accepts explicit activation and rejects unknown or unconfirmed input', () => {
    const activation = {
      managed_patient_id: '61000000-0000-4000-8000-000000000001',
      coordinates: { latitude: 30.0444, longitude: 31.2357 },
      qualifying_reason_code: 'medical_emergency',
      contact_preference: 'all_confirmed',
      callback_source: 'patient_verified_contact',
      explicit_activation: true,
    };
    expect(Value.Check(CreateSosIncidentRequestSchema, activation)).toBe(true);
    expect(
      Value.Check(CreateSosIncidentRequestSchema, { ...activation, explicit_activation: false }),
    ).toBe(false);
    expect(
      Value.Check(CreateSosIncidentRequestSchema, { ...activation, symptoms: 'sentinel' }),
    ).toBe(false);
  });

  it('requires a closed aggregate capacity band and forbids exact counts', () => {
    const projection = {
      signal: 'available',
      count_band: 'one_to_four',
      freshness: 'fresh',
      observed_at: '2026-08-20T09:55:00.000Z',
      fresh_until: '2026-08-20T10:05:00.000Z',
    };
    expect(Value.Check(CapacityProjectionSchema, projection)).toBe(true);
    expect(
      Value.Check(CapacityProjectionSchema, { ...projection, count_band: 'one_to_five' }),
    ).toBe(false);
    expect(Value.Check(CapacityProjectionSchema, { ...projection, available_count: 3 })).toBe(
      false,
    );
  });

  it('freezes share scope and distinguishes unavailable fields from empty clinical facts', () => {
    expect(
      Value.Check(CreateEmergencyShareRequestSchema, {
        allowed_fields: ['blood_group', 'confirmed_allergies'],
      }),
    ).toBe(true);
    expect(Value.Check(CreateEmergencyShareRequestSchema, { allowed_fields: ['diagnosis'] })).toBe(
      false,
    );
    expect(
      Value.Check(EmergencyShareViewResponseSchema, {
        available_fields: { blood_group: 'O+' },
        unavailable_fields: ['confirmed_allergies'],
        expires_at: '2026-08-20T10:30:00.000Z',
      }),
    ).toBe(true);
    expect(
      Value.Check(EmergencyShareViewResponseSchema, {
        available_fields: { confirmed_allergies: [], diagnosis: 'sentinel' },
        unavailable_fields: [],
        expires_at: '2026-08-20T10:30:00.000Z',
      }),
    ).toBe(false);
  });
});
