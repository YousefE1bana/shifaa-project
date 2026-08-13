import type { Locale } from '@shifaa/i18n';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type PatientLocaleContextValue = {
  locale: Locale;
  setLocale(locale: Locale): void;
};

const PatientLocaleContext = createContext<PatientLocaleContextValue>({
  locale: 'ar-EG',
  setLocale: () => undefined,
});

export function PatientLocaleProvider({ children }: React.PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof localStorage === 'undefined') return 'ar-EG';
    return localStorage.getItem('shifaa.patient.locale') === 'en-EG' ? 'en-EG' : 'ar-EG';
  });
  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('shifaa.patient.locale', nextLocale);
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar-EG' ? 'rtl' : 'ltr';
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <PatientLocaleContext.Provider value={value}>{children}</PatientLocaleContext.Provider>;
}

export function usePatientLocale(override?: Locale): Locale {
  const context = useContext(PatientLocaleContext);
  return override ?? context.locale;
}

export function usePatientLocaleController(): PatientLocaleContextValue {
  return useContext(PatientLocaleContext);
}
