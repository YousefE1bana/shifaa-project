import {
  CarePassportRail,
  color,
  semanticStyles,
  spacing,
  type,
  type RailItem,
} from '@shifaa/design-system';
import { directionFor, translate, type Locale, type MessageKey } from '@shifaa/i18n';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

const railKeys: readonly MessageKey[] = [
  'rail.account',
  'rail.profile',
  'rail.identity',
  'rail.privacy',
];

export function PatientScreen({
  locale = 'ar-EG',
  title,
  current,
  critical = false,
  children,
}: React.PropsWithChildren<{
  locale?: Locale;
  title: MessageKey;
  current: number;
  critical?: boolean;
}>) {
  const items: RailItem[] = railKeys.map((key, index) => {
    const status = index < current ? 'complete' : index === current ? 'current' : 'pending';
    return {
      key,
      label: translate(locale, key),
      status,
      statusLabel: translate(locale, `rail.${status}` as MessageKey),
    };
  });
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        ...semanticStyles.screen,
        paddingBlock: spacing.lg,
        gap: spacing.lg,
      }}
    >
      <View style={{ direction: directionFor(locale) }}>
        <Text accessibilityRole="header" style={{ ...type.display, color: color.ink }}>
          {translate(locale, title)}
        </Text>
      </View>
      <CarePassportRail items={items} critical={critical} />
      {children}
    </ScrollView>
  );
}

export function StatusMessage({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ ...semanticStyles.card, gap: spacing.sm }}>
      <Text style={{ ...type.body, color: color.ink }}>{text}</Text>
      {retry ? (
        <Pressable accessibilityRole="button" onPress={retry} style={semanticStyles.primaryAction}>
          <Text style={{ ...type.label, color: color.inverse }}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FieldLabel({ children }: React.PropsWithChildren) {
  return <Text style={{ ...type.label, color: color.ink }}>{children}</Text>;
}
