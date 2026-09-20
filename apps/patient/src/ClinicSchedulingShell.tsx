import {
  color,
  FocusVisiblePressable,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import { clinicSchedulingArEG, clinicSchedulingEnEG, type Locale } from '@shifaa/i18n';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { usePatientLocaleController } from './locale-context';

export type SchedulingCopyKey = keyof typeof clinicSchedulingArEG;
export function schedulingCopy(locale: Locale, key: SchedulingCopyKey): string {
  return (locale === 'ar-EG' ? clinicSchedulingArEG : clinicSchedulingEnEG)[key];
}

export function ClinicSchedulingShell({
  title,
  children,
}: React.PropsWithChildren<{ title: SchedulingCopyKey }>) {
  const { locale, setLocale } = usePatientLocaleController();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        ...semanticStyles.screen,
        width: '100%',
        maxWidth: 720,
        minHeight: '100%',
        alignSelf: 'center',
        paddingBlock: spacing.lg,
        gap: spacing.md,
        direction: locale === 'ar-EG' ? 'rtl' : 'ltr',
      }}
    >
      <FocusVisiblePressable
        accessibilityRole="button"
        accessibilityLabel={locale === 'ar-EG' ? 'English' : 'العربية'}
        onPress={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
          {locale === 'ar-EG' ? 'English' : 'العربية'}
        </Text>
      </FocusVisiblePressable>
      <View>
        <Text
          accessibilityRole="header"
          style={{ ...localizedType(locale, 'display'), color: color.ink }}
        >
          {schedulingCopy(locale, title)}
        </Text>
      </View>
      {children}
    </ScrollView>
  );
}
