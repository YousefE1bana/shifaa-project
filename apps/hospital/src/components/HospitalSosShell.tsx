'use client';

import { color, spacing } from '@shifaa/design-system/tokens';
import { directionFor, translate, type Locale } from '@shifaa/i18n';
import React, { useEffect, useState } from 'react';

import { syntheticHospitalContext } from '../discovery-sos-client';

export function HospitalSosShell({ children }: React.PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>('ar-EG');
  const direction = directionFor(locale);
  useEffect(() => {
    document.documentElement.lang = locale === 'ar-EG' ? 'ar' : 'en';
    document.documentElement.dir = direction;
  }, [direction, locale]);
  return (
    <main
      lang={locale}
      dir={direction}
      style={{
        minHeight: '100vh',
        background: color.canvas,
        color: color.ink,
        fontFamily: locale === 'ar-EG' ? "'IBM Plex Sans Arabic', system-ui" : 'Inter, system-ui',
        padding: 'clamp(16px, 4vw, 40px)',
      }}
    >
      <nav
        aria-label={locale === 'ar-EG' ? 'تنقل المستشفى' : 'Hospital navigation'}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: 64,
        }}
      >
        <strong>شفاء · SHIFAA</strong>
        <button type="button" onClick={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}>
          {translate(locale, 'locale.switch')}
        </button>
      </nav>
      <header style={{ maxWidth: 960, marginBlock: '24px' }}>
        <p>{translate(locale, 'hospital.workspace')}</p>
        <h1>{translate(locale, 'hospital.facilityContext')}</h1>
        <p>
          <b>
            {locale === 'ar-EG'
              ? syntheticHospitalContext.facilityNameAr
              : syntheticHospitalContext.facilityNameEn}
          </b>{' '}
          · HSP · AAL2 · seeded-synthetic
        </p>
      </header>
      {typeof children === 'function'
        ? (children as (locale: Locale) => React.ReactNode)(locale)
        : React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<{ locale?: Locale }>, { locale })
              : child,
          )}
    </main>
  );
}

export const hospitalCard: React.CSSProperties = {
  maxWidth: 960,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 12,
  padding: 'clamp(16px, 3vw, 32px)',
  marginBlock: 16,
};
