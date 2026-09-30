'use client';

import { useEffect } from 'react';

type Feature010Locale = 'ar-EG' | 'en-EG';

export function useFeature010DocumentLocale(locale: Feature010Locale) {
  useEffect(() => {
    const root = document.documentElement;
    const previousLang = root.getAttribute('lang');
    const previousDir = root.getAttribute('dir');

    root.setAttribute('lang', locale);
    root.setAttribute('dir', locale === 'ar-EG' ? 'rtl' : 'ltr');

    return () => {
      if (previousLang === null) root.removeAttribute('lang');
      else root.setAttribute('lang', previousLang);

      if (previousDir === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previousDir);
    };
  }, [locale]);
}
