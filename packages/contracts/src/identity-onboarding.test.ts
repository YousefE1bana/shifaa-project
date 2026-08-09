import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { operationIds, routeCatalog, targetRequirementIds } from './identity-onboarding.js';

describe('identity onboarding contract', () => {
  const contract = parse(
    readFileSync(
      resolve(import.meta.dirname, '../../../specs/001-identity-onboarding/contracts/openapi.yaml'),
      'utf8',
    ),
  ) as {
    paths: Record<
      string,
      Record<string, { operationId?: string; 'x-shifaa-requirements'?: string[] }>
    >;
  };

  it('has exactly the 16 approved operation IDs in OpenAPI and runtime catalog', () => {
    const fromOpenApi = Object.values(contract.paths)
      .flatMap((path) => Object.values(path))
      .flatMap((operation) => (operation.operationId ? [operation.operationId] : []));

    expect(new Set(fromOpenApi)).toEqual(new Set(operationIds));
    expect(new Set(routeCatalog.map(({ operationId }) => operationId))).toEqual(
      new Set(operationIds),
    );
    expect(operationIds).toHaveLength(16);
  });

  it('keeps every targeted functional requirement represented', () => {
    const represented = new Set(routeCatalog.flatMap(({ requirements }) => requirements));
    for (const requirement of targetRequirementIds.filter((id) => id.startsWith('FR-'))) {
      expect(represented.has(requirement), requirement).toBe(true);
    }
  });
});
