import { FamilyContextBanner } from '@shifaa/design-system/family-context';
import { directionFor, translate } from '@shifaa/i18n';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { createPatientFamilyClient, syntheticFamilyIds } from '../src/family-care-api';
import { usePatientLocaleController } from '../src/locale-context';

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
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    createPatientFamilyClient(locale)
      .listRelationships(syntheticFamilyIds.selfPatient)
      .then(() => mounted.current && setState('ready'))
      .catch(
        (error: unknown) =>
          mounted.current && setState(error instanceof TypeError ? 'offline' : 'error'),
      );
    return () => {
      mounted.current = false;
    };
  }, [locale]);
  const dependent = patientId === syntheticFamilyIds.dependentPatient;
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
        {[syntheticFamilyIds.selfPatient, syntheticFamilyIds.dependentPatient].map((id) => (
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
              {id === syntheticFamilyIds.selfPatient
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
    </ScrollView>
  );
}
