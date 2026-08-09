import { color, semanticStyles, spacing, type } from '@shifaa/design-system';
import { translate, type Locale } from '@shifaa/i18n';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PatientScreen } from '../src/PatientScreen';
import { commonStateMessage, type AsyncState } from '../src/view-models';
import { StatusMessage } from '../src/PatientScreen';
import { patientOnboardingApi } from '../src/identity-onboarding-api';

export default function PrivacyRoute({
  locale = 'ar-EG',
  state = 'ready',
}: {
  locale?: Locale;
  state?: AsyncState;
}) {
  const [notice, setNotice] = useState('');
  const [loadState, setLoadState] = useState<AsyncState>(state);
  useEffect(() => {
    if (state !== 'ready') return;
    setLoadState('loading');
    void patientOnboardingApi
      .getPrivacyNotice()
      .then((value) => {
        setNotice(value.content);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, [state]);
  const messageKey = commonStateMessage(loadState, 'privacy.empty');
  if (loadState !== 'ready' && messageKey)
    return (
      <PatientScreen locale={locale} title="privacy.title" current={3} critical>
        <StatusMessage text={translate(locale, messageKey)} />
      </PatientScreen>
    );
  return (
    <PatientScreen locale={locale} title="privacy.title" current={3} critical>
      <View style={{ ...semanticStyles.card, gap: spacing.md }}>
        <Text style={{ ...type.body, color: color.ink }}>{translate(locale, 'privacy.read')}</Text>
        <Text selectable style={{ ...type.body, color: color.mutedInk }}>
          {notice}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/privacy-consents')}
          style={semanticStyles.primaryAction}
        >
          <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
            {translate(locale, 'nav.continue')}
          </Text>
        </Pressable>
      </View>
    </PatientScreen>
  );
}
