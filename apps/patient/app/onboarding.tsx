import { color, semanticStyles, spacing, type } from '@shifaa/design-system';
import { translate, type Locale } from '@shifaa/i18n';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { FieldLabel, PatientScreen } from '../src/PatientScreen';
import { authStateMessage, type AuthState } from '../src/view-models';
import { StatusMessage } from '../src/PatientScreen';
import { patientOnboardingApi } from '../src/identity-onboarding-api';
import { usePatientLocale } from '../src/locale-context';

export default function OnboardingRoute({
  locale: localeOverride,
  state = 'ready',
}: {
  locale?: Locale;
  state?: AuthState;
}) {
  const locale = usePatientLocale(localeOverride);
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const messageKey = authStateMessage(state);
  if (state !== 'ready' && messageKey)
    return (
      <PatientScreen locale={locale} title="auth.welcome" current={0}>
        <StatusMessage text={translate(locale, messageKey)} />
      </PatientScreen>
    );
  return (
    <PatientScreen locale={locale} title="auth.welcome" current={0}>
      <Text style={{ ...type.body, color: color.mutedInk }}>
        {translate(locale, 'auth.explainer')}
      </Text>
      {failed ? <StatusMessage text={translate(locale, 'state.unavailable')} /> : null}
      <View style={{ ...semanticStyles.card, gap: spacing.md }}>
        <FieldLabel>{translate(locale, 'auth.handle')}</FieldLabel>
        <TextInput
          accessibilityLabel={translate(locale, 'auth.handle')}
          autoComplete="email"
          inputMode="email"
          value={handle}
          onChangeText={setHandle}
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: 10,
            paddingInline: 12,
          }}
        />
        <FieldLabel>{translate(locale, 'auth.password')}</FieldLabel>
        <TextInput
          accessibilityLabel={translate(locale, 'auth.password')}
          autoComplete="new-password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
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
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            setFailed(false);
            try {
              await patientOnboardingApi.register(handle, password, locale);
              router.push('/login');
            } catch (error) {
              console.error('Patient registration failed.', error);
              setFailed(true);
            } finally {
              setBusy(false);
            }
          }}
          style={semanticStyles.primaryAction}
        >
          <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
            {translate(locale, 'auth.create')}
          </Text>
        </Pressable>
      </View>
    </PatientScreen>
  );
}
