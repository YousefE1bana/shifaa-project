'use client';

import { IdentityOnboardingClient } from '@shifaa/api-client';
import { IdentityContinuityClient } from '@shifaa/api-client/identity-continuity';
import React, { useCallback, useMemo, useState } from 'react';

type Session = { accessToken: string; aal: 1 | 2; factorAgeSeconds: number | null };
type StepUpEnrollment = { enrollmentId: string; qrUri: string };
const mutationKey = (scope: string) => `${scope}-${globalThis.crypto.randomUUID()}`;

export function AdminAuditSession({
  children,
}: {
  children(
    session: Session & { accessTokenProvider: () => string; onStepUp: () => void },
  ): React.ReactNode;
}) {
  const synthetic =
    process.env.NODE_ENV === 'development' &&
    process.env['NEXT_PUBLIC_FEATURE_008_EVIDENCE_MODE'] === 'synthetic';
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState<string>();
  const [otp, setOtp] = useState('');
  const [stepUp, setStepUp] = useState<StepUpEnrollment>();
  const [stepUpCode, setStepUpCode] = useState('');
  const [session, setSession] = useState<Session | null>(
    synthetic
      ? { accessToken: 'synthetic-feature-008-ui-evidence', aal: 2, factorAgeSeconds: 0 }
      : null,
  );
  const [error, setError] = useState(false);
  const client = useMemo(
    () =>
      new IdentityOnboardingClient({
        baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
        acceptLanguage: 'ar-EG',
      }),
    [],
  );
  const accessTokenProvider = useCallback(() => session?.accessToken ?? '', [session]);
  const continuityClient = useMemo(
    () =>
      new IdentityContinuityClient({
        baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
        accessToken: accessTokenProvider,
        acceptLanguage: 'ar-EG',
      }),
    [accessTokenProvider],
  );

  const login = async () => {
    setError(false);
    try {
      const loginResponse = (await client.login(
        { handle, password },
        mutationKey('admin-login'),
      )) as {
        challenge_id?: string;
      };
      if (!loginResponse.challenge_id) throw new Error('challenge-required');
      setChallengeId(loginResponse.challenge_id);
    } catch {
      setError(true);
    }
  };
  const verify = async () => {
    if (!challengeId) return;
    setError(false);
    try {
      const otpResponse = (await client.verifyOtp(
        { challenge_id: challengeId, code: otp },
        mutationKey('admin-otp'),
      )) as { access_token?: string; aal?: 1 | 2 };
      if (!otpResponse.access_token || (otpResponse.aal !== 1 && otpResponse.aal !== 2))
        throw new Error('session-required');
      setSession({
        accessToken: otpResponse.access_token,
        aal: otpResponse.aal,
        factorAgeSeconds: otpResponse.aal === 2 ? 0 : null,
      });
      setPassword('');
      setOtp('');
    } catch {
      setError(true);
    }
  };

  const beginStepUp = async () => {
    if (!session || session.aal === 2) return;
    setError(false);
    try {
      const enrollment = (await continuityClient.beginMfaEnrollment(
        { factorType: 'totp', friendlyName: 'SHIFAA admin audit' },
        mutationKey('admin-mfa-begin'),
      )) as StepUpEnrollment;
      if (!enrollment.enrollmentId || !enrollment.qrUri) throw new Error('enrollment-required');
      setStepUp(enrollment);
    } catch {
      setError(true);
    }
  };

  const verifyStepUp = async () => {
    if (!session || !stepUp) return;
    setError(false);
    try {
      const verification = (await continuityClient.verifyMfaEnrollment(
        { enrollmentId: stepUp.enrollmentId, code: stepUpCode },
        mutationKey('admin-mfa-verify'),
      )) as { assurance?: 'aal2'; session?: { accessToken?: string } };
      if (verification.assurance !== 'aal2' || !verification.session?.accessToken)
        throw new Error('aal2-required');
      setSession({
        accessToken: verification.session.accessToken,
        aal: 2,
        factorAgeSeconds: 0,
      });
      setStepUp(undefined);
      setStepUpCode('');
    } catch {
      setError(true);
    }
  };

  if (session && stepUp) {
    return (
      <main dir="rtl" lang="ar-EG" style={{ maxWidth: 560, margin: '48px auto', padding: 24 }}>
        <h1>التحقق بخطوتين لمساحة التدقيق</h1>
        <p>أكمل مسار Feature 007 المعتمد. لا تُرسل سر العامل أو الرمز إلى السجلات.</p>
        <a href={stepUp.qrUri}>افتح إعداد العامل في تطبيق المصادقة</a>
        <label htmlFor="audit-admin-totp">رمز TOTP المكون من 6 أرقام</label>
        <input
          id="audit-admin-totp"
          value={stepUpCode}
          onChange={(event) => setStepUpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
        <button
          type="button"
          disabled={stepUpCode.length !== 6}
          onClick={() => void verifyStepUp()}
        >
          تحقق واستأنف مساحة التدقيق
        </button>
        {error ? <p role="alert">تعذر إكمال التحقق بخطوتين. حاول مرة أخرى.</p> : null}
      </main>
    );
  }
  if (session)
    return <>{children({ ...session, accessTokenProvider, onStepUp: () => void beginStepUp() })}</>;
  return (
    <main dir="rtl" lang="ar-EG" style={{ maxWidth: 560, margin: '48px auto', padding: 24 }}>
      <h1>تسجيل دخول الإدارة الآمن</h1>
      <p>استخدم جلسة SHIFAA الحالية. يتحقق الخادم من الدور وAAL2 وعمر عامل MFA.</p>
      <label htmlFor="audit-admin-handle">وسيلة الدخول</label>
      <input
        id="audit-admin-handle"
        value={handle}
        onChange={(event) => setHandle(event.target.value)}
        autoComplete="username"
      />
      {!challengeId ? (
        <>
          <label htmlFor="audit-admin-password">كلمة المرور</label>
          <input
            id="audit-admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
          <button type="button" disabled={!handle || !password} onClick={() => void login()}>
            متابعة آمنة
          </button>
        </>
      ) : (
        <>
          <label htmlFor="audit-admin-otp">رمز التحقق</label>
          <input
            id="audit-admin-otp"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <button type="button" disabled={!otp} onClick={() => void verify()}>
            تحقق وافتح مساحة الإدارة
          </button>
        </>
      )}
      {error ? <p role="alert">تعذر التحقق من الجلسة. حاول مرة أخرى.</p> : null}
    </main>
  );
}
