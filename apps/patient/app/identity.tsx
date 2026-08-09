import { color, semanticStyles, spacing, type } from '@shifaa/design-system';
import { isolateLtr, translate, type Locale } from '@shifaa/i18n';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { FieldLabel, PatientScreen, StatusMessage } from '../src/PatientScreen';
import { identityStateMessage, type IdentityState } from '../src/view-models';
import { patientOnboardingApi } from '../src/identity-onboarding-api';
import { usePatientLocale } from '../src/locale-context';

export default function IdentityRoute({
  locale: localeOverride,
  online = true,
  initialState = 'ready',
}: {
  locale?: Locale;
  online?: boolean;
  initialState?: IdentityState;
}) {
  const locale = usePatientLocale(localeOverride);
  const [state, setState] = useState(initialState);
  const [identityValue, setIdentityValue] = useState('');
  const [maskedValue, setMaskedValue] = useState('');
  if (!online)
    return (
      <PatientScreen locale={locale} title="identity.title" current={2} critical>
        <StatusMessage text={translate(locale, 'identity.offline')} />
      </PatientScreen>
    );
  const stateKey = identityStateMessage(state);
  return (
    <PatientScreen locale={locale} title="identity.title" current={2} critical>
      {stateKey ? <StatusMessage text={translate(locale, stateKey)} /> : null}
      {(
        [
          'pending',
          'manual_review',
          'quarantine',
          'verified',
          'rejected',
          'failed',
        ] as IdentityState[]
      ).includes(state) ? (
        <Text
          accessibilityLabel={translate(locale, 'identity.masked')}
          style={{ ...type.body, color: color.ink, writingDirection: 'ltr' }}
        >
          {isolateLtr(maskedValue)}
        </Text>
      ) : state === 'ready' ? (
        <View style={{ ...semanticStyles.card, gap: spacing.md }}>
          <FieldLabel>{translate(locale, 'identity.type')}</FieldLabel>
          <Text
            accessibilityLabel={translate(locale, 'identity.type')}
            style={{ ...type.body, color: color.ink }}
          >
            {translate(locale, 'identity.nationalId')}
          </Text>
          <FieldLabel>{translate(locale, 'identity.value')}</FieldLabel>
          <TextInput
            accessibilityLabel={translate(locale, 'identity.value')}
            inputMode="numeric"
            value={identityValue}
            onChangeText={setIdentityValue}
            secureTextEntry
            style={{
              minHeight: 44,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: 10,
              paddingInline: 12,
              writingDirection: 'ltr',
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              try {
                const identity = await patientOnboardingApi.createIdentity({
                  identity_type: 'egyptian_national_id',
                  value: identityValue,
                  issuing_country: 'EG',
                });
                setIdentityValue('');
                setMaskedValue(identity.masked_value);
                setState(identity.verification_case.status as IdentityState);
              } catch {
                setState('failed');
              }
            }}
            style={semanticStyles.primaryAction}
          >
            <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
              {translate(locale, 'identity.send')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {(['pending', 'manual_review', 'quarantine', 'verified'] as IdentityState[]).includes(
        state,
      ) ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/privacy')}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ ...type.label, color: color.careBlue }}>
            {translate(locale, 'nav.continue')}
          </Text>
        </Pressable>
      ) : null}
    </PatientScreen>
  );
}
