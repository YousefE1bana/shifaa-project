import { color, semanticStyles, spacing, type } from '@shifaa/design-system';
import { translate, type Locale } from '@shifaa/i18n';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { FieldLabel, PatientScreen, StatusMessage } from '../src/PatientScreen';
import { authStateMessage, type AuthState } from '../src/view-models';
import { patientOnboardingApi } from '../src/identity-onboarding-api';
import { usePatientLocale } from '../src/locale-context';

export default function LoginRoute({
  locale: localeOverride,
  online = true,
  initialState = 'ready',
}: {
  locale?: Locale;
  online?: boolean;
  initialState?: AuthState;
}) {
  const locale = usePatientLocale(localeOverride);
  const [challenge, setChallenge] = useState(patientOnboardingApi.hasPendingChallenge());
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!online)
    return (
      <PatientScreen locale={locale} title="auth.login" current={0}>
        <StatusMessage text={translate(locale, 'state.offline')} />
      </PatientScreen>
    );
  const messageKey = authStateMessage(initialState);
  if (initialState !== 'ready' && initialState !== 'otp' && messageKey)
    return (
      <PatientScreen locale={locale} title="auth.login" current={0}>
        <StatusMessage text={translate(locale, messageKey)} />
      </PatientScreen>
    );
  return (
    <PatientScreen locale={locale} title="auth.login" current={0}>
      {failed ? <StatusMessage text={translate(locale, 'state.unavailable')} /> : null}
      <View style={{ ...semanticStyles.card, gap: spacing.md }}>
        <FieldLabel>
          {translate(locale, challenge || initialState === 'otp' ? 'auth.otp' : 'auth.handle')}
        </FieldLabel>
        <TextInput
          accessibilityLabel={translate(locale, challenge ? 'auth.otp' : 'auth.handle')}
          inputMode={challenge ? 'numeric' : 'email'}
          maxLength={challenge ? 6 : undefined}
          value={challenge ? code : handle}
          onChangeText={challenge ? setCode : setHandle}
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: 10,
            paddingInline: 12,
          }}
        />
        {!challenge ? (
          <>
            <FieldLabel>{translate(locale, 'auth.password')}</FieldLabel>
            <TextInput
              accessibilityLabel={translate(locale, 'auth.password')}
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
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            setFailed(false);
            try {
              if (challenge) {
                await patientOnboardingApi.verifyOtp(code);
                router.replace('/profile');
              } else {
                await patientOnboardingApi.login(handle, password);
                setChallenge(true);
              }
            } catch {
              setFailed(true);
            } finally {
              setBusy(false);
            }
          }}
          style={semanticStyles.primaryAction}
        >
          <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
            {translate(locale, challenge ? 'auth.verify' : 'auth.login')}
          </Text>
        </Pressable>
      </View>
    </PatientScreen>
  );
}
