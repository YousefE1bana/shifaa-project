import { FamilyContextBanner } from '@shifaa/design-system/family-context';
import { directionFor, translate } from '@shifaa/i18n';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { createPatientFamilyClient, syntheticFamilyIds } from '../src/family-care-api';
import { usePatientLocaleController } from '../src/locale-context';
import { patientOnboardingApi } from '../src/identity-onboarding-api';
import {
  currentManagedCareContext,
  revalidateManagedCareContext,
} from '../src/managed-care-context';
import { resolvePatientApiBaseUrl } from '../src/patient-api-base-url';
import { patientPlatform } from '../src/patient-auth-store';

type State =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'permission'
  | 'revoked'
  | 'expired'
  | 'offline'
  | 'error';

export default function CareSwitcher() {
  const router = useRouter();
  const { locale, setLocale } = usePatientLocaleController();
  const [state, setState] = useState<State>('loading');
  const [patientId, setPatientId] = useState<string>(syntheticFamilyIds.selfPatient);
  const [confirmed, setConfirmed] = useState(false);
  const [managedSelection, setManagedSelection] = useState(currentManagedCareContext());
  const [ownManagedId, setOwnManagedId] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    patientOnboardingApi
      .getProfile()
      .then(async (profile) => {
        const prior = currentManagedCareContext();
        if (prior) {
          const baseUrl = resolvePatientApiBaseUrl({
            platform: patientPlatform,
            configuredBaseUrl: process.env['EXPO_PUBLIC_API_BASE_URL'],
            ...(typeof location !== 'undefined' ? { webOrigin: location.origin } : {}),
          });
          const context = await revalidateManagedCareContext(locale, baseUrl);
          if (mounted.current) {
            setManagedSelection(context);
            setPatientId(context.managedPatientId);
          }
        }
        if (profile.managedPatientId) {
          if (mounted.current) {
            setOwnManagedId(profile.managedPatientId);
            if (!prior) setPatientId(profile.managedPatientId);
          }
          await createPatientFamilyClient(locale).listRelationships(profile.managedPatientId);
        } else if (!prior) throw Error('patient-context-required');
        if (mounted.current) setState('ready');
      })
      .catch(
        (error: unknown) =>
          mounted.current && setState(error instanceof TypeError ? 'offline' : 'error'),
      );
    return () => {
      mounted.current = false;
    };
  }, [locale]);
  const dependent = patientId !== ownManagedId;
  const patientName = dependent
    ? locale === 'ar-EG'
      ? 'مريض اصطناعي تابع'
      : 'Synthetic dependent patient'
    : locale === 'ar-EG'
      ? 'مريض اصطناعي ذاتي'
      : 'Synthetic self patient';
  const relationship = translate(
    locale,
    dependent ? 'family.context.guardian' : 'family.context.self',
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16, direction: directionFor(locale) }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
        style={{ minHeight: 44 }}
      >
        <Text>{translate(locale, 'locale.switch')}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '700' }}>
        {translate(locale, 'family.context.title')}
      </Text>
      <View accessibilityRole="radiogroup" style={{ gap: 12 }}>
        {[ownManagedId, managedSelection?.managedPatientId]
          .filter((id): id is string => !!id)
          .map((id) => (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ checked: patientId === id }}
              onPress={() => {
                setPatientId(id);
                setConfirmed(false);
              }}
              style={{ minHeight: 44, borderWidth: 1, padding: 12 }}
            >
              <Text>
                {id === ownManagedId
                  ? locale === 'ar-EG'
                    ? 'الرعاية الذاتية الاصطناعية'
                    : 'Synthetic self care'
                  : locale === 'ar-EG'
                    ? 'رعاية تابع اصطناعي'
                    : 'Synthetic dependent care'}
              </Text>
            </Pressable>
          ))}
      </View>
      <FamilyContextBanner
        patientName={patientName}
        relationshipLabel={relationship}
        confirmed={confirmed}
        direction={directionFor(locale)}
        title={translate(locale, 'family.context.title')}
        confirmLabel={translate(locale, 'family.context.confirm')}
        changeLabel={translate(locale, 'family.context.change')}
        onConfirm={() => setConfirmed(true)}
        onChange={() => setConfirmed(false)}
      />
      <Text role="status">
        {state === 'loading'
          ? translate(locale, 'state.loading')
          : state === 'ready'
            ? confirmed
              ? translate(locale, 'state.success')
              : translate(locale, 'family.context.required')
            : translate(
                locale,
                state === 'offline'
                  ? 'family.problem.offline'
                  : state === 'permission'
                    ? 'family.problem.permission'
                    : state === 'revoked'
                      ? 'family.context.revoked'
                      : state === 'expired'
                        ? 'family.context.expired'
                        : state === 'empty'
                          ? 'family.context.empty'
                          : 'state.unavailable',
              )}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={!confirmed}
        onPress={() => router.push({ pathname: '/relationships', params: { patientId } })}
        style={{ minHeight: 48, opacity: confirmed ? 1 : 0.5 }}
      >
        <Text>{translate(locale, 'nav.continue')}</Text>
      </Pressable>
      {managedSelection && patientId === managedSelection.managedPatientId && (
        <Pressable
          accessibilityRole="button"
          disabled={!confirmed || state !== 'ready'}
          onPress={() =>
            router.push({ pathname: '/records', params: { actingRole: managedSelection.role } })
          }
          style={{ minHeight: 48 }}
        >
          <Text>{locale === 'ar-EG' ? 'عرض السجل للتابع' : 'View managed records'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
