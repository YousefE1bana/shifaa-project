export class ApiPolicyError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiPolicyError';
  }
}

export function deny(code = 'permission-denied'): never {
  throw new ApiPolicyError(
    code,
    403,
    'This action is not permitted for the current actor and purpose.',
  );
}
