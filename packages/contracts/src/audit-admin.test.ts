import { describe, expect, it } from 'vitest';

import { auditAdminOperations, auditAdminSchemas } from './audit-admin.js';

describe('generated Feature 008 contracts', () => {
  it('locks the seven approved operations and no others', () => {
    expect(auditAdminOperations).toEqual([
      { operationId: 'getAdminSummary', method: 'GET', path: '/admin/dashboard-summary' },
      { operationId: 'listAuditEvents', method: 'GET', path: '/admin/audit/events' },
      { operationId: 'getAuditEvent', method: 'GET', path: '/admin/audit/events/{eventId}' },
      { operationId: 'createAuditExport', method: 'POST', path: '/admin/audit/exports' },
      { operationId: 'exportAuditPartition', method: 'POST', path: '/internal/audit/exports' },
      { operationId: 'healthLive', method: 'GET', path: '/internal/health/live' },
      { operationId: 'healthReady', method: 'GET', path: '/internal/health/ready' },
    ]);
  });

  it('retains RFC 9457, bounded cursor, and export integrity schemas', () => {
    expect(auditAdminSchemas.Problem['required']).toContain('request_id');
    expect(
      (auditAdminSchemas.PageMeta['properties'] as Record<string, { maxLength: number }>)[
        'next_cursor'
      ]?.maxLength,
    ).toBe(512);
    expect(auditAdminSchemas.AuditExportProofResponse['required']).toContain('object_digest');
  });
});
