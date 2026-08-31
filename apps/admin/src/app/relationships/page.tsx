'use client';

import { IdentityOnboardingClient } from '@shifaa/api-client';
import React, { useCallback, useMemo, useState } from 'react';

import { GuardianshipWorkspace } from './GuardianshipWorkspace';

const mutationKey = (scope: string) =>
  `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function RelationshipsPage() {
  const [handle, setHandle] = useState('');
  const [credential, setCredential] = useState('');
  const [challengeId, setChallengeId] = useState<string>();
  const [otp, setOtp] = useState('');
  const [accessToken, setAccessToken] = useState<string>();
  const [error, setError] = useState(false);
  const client = useMemo(
    () =>
      new IdentityOnboardingClient({
        baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
        acceptLanguage: 'ar-EG',
      }),
    [],
  );
  const provideAccessToken = useCallback(() => accessToken, [accessToken]);
  const login = async () => {
    setError(false);
    try {
      const result = (await client.login(
        { handle, password: credential },
        mutationKey('staff-login'),
      )) as { challenge_id?: string };
      if (!result.challenge_id) throw new Error('challenge-required');
      setChallengeId(result.challenge_id);
    } catch {
      setError(true);
    }
  };
  const verify = async () => {
    if (!challengeId) return;
    setError(false);
    try {
      const result = (await client.verifyOtp(
        { challenge_id: challengeId, code: otp },
        mutationKey('staff-otp'),
      )) as { access_token?: string };
      if (!result.access_token) throw new Error('staff-session-required');
      setAccessToken(result.access_token);
      setCredential('');
      setOtp('');
    } catch {
      setError(true);
    }
  };

  if (accessToken) return <GuardianshipWorkspace accessToken={provideAccessToken} />;

  return (
    <main dir="rtl" lang="ar-EG" style={{ maxWidth: 560, margin: '48px auto', padding: 24 }}>
      <h1>تسجيل دخول موظف المراجعة</h1>
      <p>استخدم جلسة الموظف الحقيقية ثم أكمل رمز التحقق قبل فتح قرارات الانتقال.</p>
      <label htmlFor="staff-handle">وسيلة الدخول</label>
      <input
        id="staff-handle"
        value={handle}
        onChange={(event) => setHandle(event.target.value)}
        autoComplete="username"
      />
      {!challengeId ? (
        <>
          <label htmlFor="staff-password">كلمة المرور</label>
          <input
            id="staff-password"
            type="password"
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            autoComplete="current-password"
          />
          <button type="button" disabled={!handle || !credential} onClick={() => void login()}>
            متابعة آمنة
          </button>
        </>
      ) : (
        <>
          <label htmlFor="staff-otp">رمز التحقق</label>
          <input
            id="staff-otp"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <button type="button" disabled={!otp} onClick={() => void verify()}>
            تحقق وافتح قائمة المراجعة
          </button>
        </>
      )}
      {error ? <p role="alert">تعذر التحقق من جلسة الموظف. حاول مرة أخرى.</p> : null}
    </main>
  );
}
