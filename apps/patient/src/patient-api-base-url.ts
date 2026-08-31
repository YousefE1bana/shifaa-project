export function resolvePatientApiBaseUrl(input: {
  platform: 'web' | 'native';
  configuredBaseUrl?: string;
  webOrigin?: string;
}): string {
  if (input.platform === 'native') {
    return input.configuredBaseUrl ?? 'http://127.0.0.1:3000';
  }
  if (!input.webOrigin) throw new Error('browser-origin-unavailable');
  const resolved = new URL(input.configuredBaseUrl ?? input.webOrigin, input.webOrigin);
  if (resolved.origin !== input.webOrigin) throw new Error('browser-api-origin-mismatch');
  return resolved.href.replace(/\/$/, '');
}
