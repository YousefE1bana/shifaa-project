'use client';

import React, { useState } from 'react';
import { IdentityOnboardingClient } from '@shifaa/api-client';
import {
  color,
  localizedType,
  minimumTargetSize,
  radius,
  spacing,
} from '@shifaa/design-system/tokens';
import { ScheduleWorkspace } from '../../components/clinic-scheduling/ScheduleWorkspace';

type Locale = 'ar-EG' | 'en-EG';
const field: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: minimumTargetSize,
  border: `1px solid ${color.border}`,
  borderRadius: radius.control,
  paddingInline: spacing.sm,
  marginBlock: spacing.sm,
  background: color.surface,
  color: color.ink,
};
const button: React.CSSProperties = {
  minHeight: minimumTargetSize,
  border: `1px solid ${color.brand}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  paddingInline: spacing.md,
  marginBlock: spacing.sm,
};

export default function Page() {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  const auth = baseUrl ? new IdentityOnboardingClient({ baseUrl, acceptLanguage: locale }) : null;
  const ar = locale === 'ar-EG';

  const login = async () => {
    if (!auth) return;
    setBusy(true);
    setError(false);
    try {
      const result = (await auth.login({ handle, password }, crypto.randomUUID())) as {
        kind?: string;
        challenge_id?: string;
      };
      if (result.kind !== 'challenge' || !result.challenge_id)
        throw new Error('challenge-required');
      setChallenge(result.challenge_id);
      setPassword('');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!auth) return;
    setBusy(true);
    setError(false);
    try {
      const result = (await auth.verifyOtp(
        { challenge_id: challenge, code: otp },
        crypto.randomUUID(),
      )) as { kind?: string; access_token?: string };
      if (result.kind !== 'session' || !result.access_token) throw new Error('session-required');
      setToken(result.access_token);
      setOtp('');
      setChallenge('');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir={ar ? 'rtl' : 'ltr'}
      lang={locale}
      style={{
        background: color.canvas,
        color: color.ink,
        minHeight: '100vh',
        ...localizedType(locale, 'body'),
      }}
    >
      <div style={{ padding: spacing.md }}>
        <button style={button} onClick={() => setLocale(ar ? 'en-EG' : 'ar-EG')}>
          {ar ? 'English' : 'العربية'}
        </button>
      </div>
      {token ? (
        <ScheduleWorkspace accessToken={token} locale={locale} />
      ) : (
        <main style={{ maxWidth: 560, marginInline: 'auto', padding: spacing.lg }}>
          <h1>{ar ? 'إدارة جدول العيادة' : 'Clinic schedule management'}</h1>
          <p>
            {ar
              ? 'يلزم سياق موظف مخوّل. لا تُحفظ بيانات الدخول على هذا الجهاز.'
              : 'An authorized staff context is required. Credentials are not stored on this device.'}
          </p>
          {!challenge ? (
            <>
              <label>
                {ar ? 'وسيلة الدخول' : 'Sign-in handle'}
                <input
                  style={field}
                  autoComplete="username"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                />
              </label>
              <label>
                {ar ? 'كلمة المرور' : 'Password'}
                <input
                  style={field}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                style={button}
                disabled={!baseUrl || busy || !handle || !password}
                onClick={() => void login()}
              >
                {ar ? 'متابعة' : 'Continue'}
              </button>
            </>
          ) : (
            <>
              <label>
                {ar ? 'رمز التحقق' : 'Verification code'}
                <input
                  style={field}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <button
                style={button}
                disabled={!baseUrl || busy || otp.length !== 6}
                onClick={() => void verify()}
              >
                {ar ? 'تحقق' : 'Verify'}
              </button>
            </>
          )}
          {!baseUrl && (
            <p role="status">
              {ar ? 'خدمة العيادة غير مهيأة.' : 'Clinic service is not configured.'}
            </p>
          )}
          {error && (
            <p role="alert">
              {ar ? 'تعذّر التحقق. حاول مجددًا.' : 'Verification failed. Try again.'}
            </p>
          )}
        </main>
      )}
    </div>
  );
}
