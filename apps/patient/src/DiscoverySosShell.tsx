import {
  color,
  FocusVisiblePressable,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import { directionFor, translate, type MessageKey } from '@shifaa/i18n';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { usePatientLocaleController } from './locale-context';

export function DiscoverySosShell({
  title,
  emergency = false,
  children,
}: React.PropsWithChildren<{ title: MessageKey; emergency?: boolean }>) {
  const { locale, setLocale } = usePatientLocaleController();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        ...semanticStyles.screen,
        minHeight: '100%',
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        paddingBlock: spacing.lg,
        gap: spacing.md,
        direction: directionFor(locale),
      }}
    >
      <FocusVisiblePressable
        accessibilityRole="button"
        accessibilityLabel={translate(locale, 'locale.switch')}
        onPress={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
          {translate(locale, 'locale.switch')}
        </Text>
      </FocusVisiblePressable>
      <View
        style={{
          ...(locale === 'ar-EG'
            ? {
                borderRightWidth: emergency ? 6 : 0,
                borderRightColor: color.emergency,
                paddingRight: emergency ? spacing.md : 0,
              }
            : {
                borderLeftWidth: emergency ? 6 : 0,
                borderLeftColor: color.emergency,
                paddingLeft: emergency ? spacing.md : 0,
              }),
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ ...localizedType(locale, 'display'), color: color.ink }}
        >
          {translate(locale, title)}
        </Text>
      </View>
      {children}
    </ScrollView>
  );
}
