import { color, semanticStyles, spacing, type } from '@shifaa/design-system';
import { translate, type Locale } from '@shifaa/i18n';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { FieldLabel, PatientScreen, StatusMessage } from '../src/PatientScreen';
import { profileStateMessage, type ProfileState } from '../src/view-models';
import { patientOnboardingApi } from '../src/identity-onboarding-api';
import { usePatientLocale } from '../src/locale-context';
import { patientSessionRuntime } from '../src/patient-session-runtime';

export default function ProfileRoute({
  locale: localeOverride,
  initialState = 'ready',
}: {
  locale?: Locale;
  initialState?: ProfileState;
}) {
  const locale = usePatientLocale(localeOverride);
  const [state, setState] = useState(initialState);
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [nationality, setNationality] = useState('EG');
  const logout = async (allSessions: boolean) => {
    try {
      await patientSessionRuntime.controller.logout(
        allSessions,
        typeof navigator === 'undefined' || navigator.onLine,
      );
      router.replace('/login');
    } catch {
      setState('error');
    }
  };
  useEffect(() => {
    if (initialState !== 'ready') return;
    setState('loading');
    void patientOnboardingApi
      .getProfile()
      .then((profile) => {
        setDisplayName(profile.display_name);
        setBirthDate(profile.birth_date ?? '');
        setNationality(profile.nationality_code);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [initialState]);
  const messageKey = profileStateMessage(state);
  if (state !== 'ready' && state !== 'success' && messageKey)
    return (
      <PatientScreen locale={locale} title="profile.title" current={1}>
        <StatusMessage
          text={translate(locale, messageKey)}
          retry={state === 'conflict' || state === 'error' ? () => setState('ready') : undefined}
        />
      </PatientScreen>
    );
  return (
    <PatientScreen locale={locale} title="profile.title" current={1}>
      {state === 'success' && messageKey ? (
        <StatusMessage text={translate(locale, messageKey)} />
      ) : null}
      <View style={{ ...semanticStyles.card, gap: spacing.md }}>
        <FieldLabel>{translate(locale, 'profile.name')}</FieldLabel>
        <TextInput
          accessibilityLabel={translate(locale, 'profile.name')}
          value={displayName}
          onChangeText={setDisplayName}
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: 10,
            paddingInline: 12,
          }}
        />
        <FieldLabel>{translate(locale, 'profile.birthDate')}</FieldLabel>
        <TextInput
          accessibilityLabel={translate(locale, 'profile.birthDate')}
          inputMode="numeric"
          value={birthDate}
          onChangeText={setBirthDate}
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: 10,
            paddingInline: 12,
          }}
        />
        <FieldLabel>{translate(locale, 'profile.nationality')}</FieldLabel>
        <TextInput
          accessibilityLabel={translate(locale, 'profile.nationality')}
          maxLength={2}
          value={nationality}
          onChangeText={setNationality}
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: 10,
            paddingInline: 12,
          }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            try {
              await patientOnboardingApi.updateProfile({
                display_name: displayName,
                birth_date: birthDate || null,
                nationality_code: nationality.toUpperCase(),
                preferred_locale: locale,
              });
              setState('success');
            } catch (error) {
              setState(
                error instanceof Error && error.message.includes('409') ? 'conflict' : 'error',
              );
            }
          }}
          style={semanticStyles.primaryAction}
        >
          <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
            {translate(locale, 'profile.save')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/identity')}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ ...type.label, color: color.careBlue }}>
            {translate(locale, 'nav.continue')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void logout(false)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ ...type.label, color: color.careBlue, textAlign: 'center' }}>
            {translate(locale, 'security.session.logoutCurrent')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void logout(true)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ ...type.label, color: color.danger, textAlign: 'center' }}>
            {translate(locale, 'security.session.logoutAll')}
          </Text>
        </Pressable>
      </View>
    </PatientScreen>
  );
}
