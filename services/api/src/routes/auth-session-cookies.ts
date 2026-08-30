import { randomBytes } from 'node:crypto';

import type { FastifyReply } from 'fastify';

const refreshCookieName = 'shifaa_refresh';
const csrfCookieName = 'shifaa_csrf';
const cookiePath = '/v1/auth';

export function setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
  reply.header(
    'set-cookie',
    `${refreshCookieName}=${encodeURIComponent(refreshToken)}; Path=${cookiePath}; Max-Age=85500; HttpOnly; Secure; SameSite=Strict`,
  );
}

export function setInitialBrowserSessionCookies(reply: FastifyReply, refreshToken: string): void {
  reply.header('set-cookie', initialBrowserSessionCookies(refreshToken));
}

export function initialBrowserSessionCookies(refreshToken: string): string[] {
  const csrfToken = randomBytes(32).toString('base64url');
  return [
    `${refreshCookieName}=${encodeURIComponent(refreshToken)}; Path=${cookiePath}; Max-Age=85500; HttpOnly; Secure; SameSite=Strict`,
    `${csrfCookieName}=${encodeURIComponent(csrfToken)}; Path=${cookiePath}; Max-Age=85500; Secure; SameSite=Strict`,
  ];
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.header(
    'set-cookie',
    `${refreshCookieName}=; Path=${cookiePath}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  );
}
