'use client';
import React, { useState } from 'react';
import { IdentityOnboardingClient } from '@shifaa/api-client';
import { clinicalStatusCopy } from '@shifaa/i18n';
import { spacing } from '@shifaa/design-system/tokens';
import { StatusWorkspace, statusControl, statusLayout } from './StatusWorkspace';
export default function ClinicalContentStatusPage() {
  const [locale, setLocale] = useState<'ar-EG' | 'en-EG'>('ar-EG'),
    [handle, setHandle] = useState(''),
    [password, setPassword] = useState(''),
    [challenge, setChallenge] = useState(''),
    [otp, setOtp] = useState(''),
    [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const c = clinicalStatusCopy[locale],
    baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'];
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!baseUrl) return;
    setBusy(true);
    setError(false);
    try {
      const auth = new IdentityOnboardingClient({ baseUrl, acceptLanguage: locale });
      if (!challenge) {
        const result = (await auth.login({ handle, password }, crypto.randomUUID())) as {
          kind?: string;
          challenge_id?: string;
        };
        if (result.kind !== 'challenge' || !result.challenge_id) throw Error('challenge-required');
        setChallenge(result.challenge_id);
        setPassword('');
      } else {
        const result = (await auth.verifyOtp(
          { challenge_id: challenge, code: otp },
          crypto.randomUUID(),
        )) as { kind?: string; access_token?: string; aal?: number };
        if (result.kind !== 'session' || !result.access_token || result.aal !== 2)
          throw Error('aal2-required');
        setToken(result.access_token);
        setOtp('');
        setChallenge('');
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main
      dir={locale === 'ar-EG' ? 'rtl' : 'ltr'}
      lang={locale}
      style={{
        ...statusLayout,
        fontFamily: locale === 'ar-EG' ? 'IBM Plex Sans Arabic' : 'Inter',
        fontSize: '1rem',
        lineHeight: 1.5,
      }}
    >
      <button
        style={statusControl}
        onClick={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
      >
        {locale === 'ar-EG' ? 'English' : 'العربية'}
      </button>
      {token ? (
        <StatusWorkspace
          accessToken={token}
          locale={locale}
          onSignOut={() => {
            setToken('');
            setPassword('');
            setOtp('');
            setHandle('');
          }}
        />
      ) : (
        <section>
          <h1>{c.title}</h1>
          <p>{c.boundary}</p>
          <h2>{c.signIn}</h2>
          <p>{c.context}</p>
          {error && <p role="alert">{c.authError}</p>}
          <form onSubmit={(event) => void submit(event)}>
            {!challenge ? (
              <>
                <label htmlFor="status-handle">{c.handle}</label>
                <input
                  id="status-handle"
                  autoComplete="username"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  required
                  style={{
                    ...statusControl,
                    display: 'block',
                    width: '100%',
                    marginBlock: spacing.sm,
                  }}
                />
                <label htmlFor="status-password">{c.password}</label>
                <input
                  id="status-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  style={{
                    ...statusControl,
                    display: 'block',
                    width: '100%',
                    marginBlock: spacing.sm,
                  }}
                />
              </>
            ) : (
              <>
                <label htmlFor="status-otp">{c.otp}</label>
                <input
                  id="status-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  required
                  style={{
                    ...statusControl,
                    display: 'block',
                    width: '100%',
                    marginBlock: spacing.sm,
                  }}
                />
              </>
            )}
            <button style={statusControl} disabled={busy || !baseUrl}>
              {challenge ? c.verify : c.continue}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
