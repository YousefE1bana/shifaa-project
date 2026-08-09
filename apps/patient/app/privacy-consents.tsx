import { color, semanticStyles, spacing, type } from '@shifaa/design-system';
import { translate, type Locale } from '@shifaa/i18n';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PatientScreen, StatusMessage } from '../src/PatientScreen';
import { consentStateMessage, type ConsentState } from '../src/view-models';
import { patientOnboardingApi } from '../src/identity-onboarding-api';
import { usePatientLocale } from '../src/locale-context';

const purposes = [
  { code: 'care_updates', label: 'privacy.purpose.careUpdates' },
  { code: 'identity_proofing', label: 'privacy.purpose.identityProofing' },
] as const;

export default function PrivacyConsentsRoute({
  locale: localeOverride,
  online = true,
  initialState = 'ready',
}: {
  locale?: Locale;
  online?: boolean;
  initialState?: ConsentState;
}) {
  const locale = usePatientLocale(localeOverride);
  const [saved, setSaved] = useState(false);
  const [choices, setChoices] = useState<Record<string, 'granted' | 'refused'>>({});
  const messageKey = consentStateMessage(initialState);
  if (initialState !== 'ready' && initialState !== 'saved' && messageKey)
    return (
      <PatientScreen locale={locale} title="privacy.choices" current={3} critical>
        <StatusMessage text={translate(locale, messageKey)} />
      </PatientScreen>
    );
  return (
    <PatientScreen locale={locale} title="privacy.choices" current={3} critical>
      {!online ? <StatusMessage text={translate(locale, 'privacy.offline')} /> : null}
      {saved ? <StatusMessage text={translate(locale, 'privacy.saved')} /> : null}
      {purposes.map((purpose) => (
        <View key={purpose.code} style={{ ...semanticStyles.card, gap: spacing.sm }}>
          <Text style={{ ...type.body, color: color.ink }}>{translate(locale, purpose.label)}</Text>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(['granted', 'refused'] as const).map((decision) => (
              <Pressable
                key={decision}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: choices[purpose.code] === decision,
                  disabled: !online,
                }}
                disabled={!online}
                onPress={() => setChoices((current) => ({ ...current, [purpose.code]: decision }))}
                style={{ ...semanticStyles.primaryAction, flex: 1 }}
              >
                <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
                  {translate(locale, decision === 'granted' ? 'privacy.grant' : 'privacy.refuse')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled: !online || !purposes.every((purpose) => choices[purpose.code]),
        }}
        disabled={!online || !purposes.every((purpose) => choices[purpose.code])}
        onPress={async () => {
          try {
            await Promise.all(
              Object.entries(choices).map(([purposeCode, decision]) =>
                patientOnboardingApi.recordConsent(purposeCode, decision),
              ),
            );
            setSaved(true);
            router.replace('/profile');
          } catch {
            setSaved(false);
          }
        }}
        style={semanticStyles.primaryAction}
      >
        <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
          {translate(locale, 'privacy.save')}
        </Text>
      </Pressable>
    </PatientScreen>
  );
}
