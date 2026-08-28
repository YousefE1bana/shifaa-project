export type SecurityProblemState =
  | 'offline'
  | 'rate-limited'
  | 'expired'
  | 'conflict'
  | 'session-expired'
  | 'step-up-required'
  | 'auth-degraded'
  | 'permission-denied'
  | 'error';

export type SecurityProblem = Readonly<{
  state: SecurityProblemState;
  code: string;
  status?: number;
}>;

export function mapSecurityProblem(error: unknown): SecurityProblem {
  const code = securityProblemCode(error);
  const status = securityProblemStatus(error);
  if (code === 'offline-no-queue') return { state: 'offline', code, status };
  if (code === 'rate-limited') return { state: 'rate-limited', code, status };
  if (code === 'recovery-challenge-invalid' || status === 410)
    return { state: 'expired', code, status };
  if (code === 'version-conflict' || code === 'idempotency-key-reused' || status === 409)
    return { state: 'conflict', code, status };
  if (['authentication-required', 'session-expired', 'session-revoked'].includes(code))
    return { state: 'session-expired', code, status };
  if (['mfa-required', 'mfa-step-up-required', 'identity-proof-required'].includes(code))
    return { state: 'step-up-required', code, status };
  if (code === 'vendor-unavailable' || code === 'auth-degraded' || status === 503)
    return { state: 'auth-degraded', code, status };
  if (code === 'forbidden' || code === 'purpose-required' || status === 403)
    return { state: 'permission-denied', code, status };
  return { state: 'error', code, status };
}

function securityProblemCode(error: unknown): string {
  if (error instanceof Error && error.message === 'offline-no-queue') return error.message;
  if (
    error instanceof Error &&
    ['auth-degraded', 'authentication-required'].includes(error.message)
  )
    return error.message;
  if (!error || typeof error !== 'object' || !('problem' in error)) return '';
  const problem = (error as { problem?: unknown }).problem;
  if (!problem || typeof problem !== 'object' || !('code' in problem)) return '';
  return String((problem as { code?: unknown }).code ?? '');
}

function securityProblemStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}
