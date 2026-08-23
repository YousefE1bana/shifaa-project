import React, { useRef } from 'react';
import { Text, View } from 'react-native';

import { FocusVisiblePressable } from './EmergencyFoundation.tsx';
import { color, localizedType, minimumTargetSize, spacing } from './tokens.ts';

export type FamilyContextKind = 'self' | 'guardian' | 'delegate';

export function FamilyContextBanner({
  patientName,
  relationshipLabel,
  confirmed,
  direction,
  confirmLabel,
  changeLabel,
  title,
  onConfirm,
  onChange,
}: {
  patientName: string;
  relationshipLabel: string;
  confirmed: boolean;
  direction: 'rtl' | 'ltr';
  confirmLabel: string;
  changeLabel: string;
  title: string;
  onConfirm(): void;
  onChange(): void;
}) {
  const heading = useRef<Text>(null);
  const activate = () => {
    onConfirm();
    requestAnimationFrame(() => heading.current?.focus());
  };
  return (
    <View
      accessibilityLabel={`${title}: ${patientName}, ${relationshipLabel}`}
      style={{
        borderWidth: 2,
        borderColor: confirmed ? color.positive : color.careBlue,
        backgroundColor: confirmed ? '#ecfdf5' : '#eff8ff',
        borderRadius: 16,
        padding: spacing.md,
        gap: spacing.sm,
        direction,
      }}
    >
      <Text
        ref={heading}
        accessibilityRole="header"
        style={localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'label')}
      >
        {title}
      </Text>
      <Text
        style={{
          ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'body'),
          color: color.ink,
        }}
      >
        <Text style={localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'label')}>
          {patientName}
        </Text>{' '}
        · {relationshipLabel}
      </Text>
      <FocusVisiblePressable
        accessibilityRole="button"
        onPress={confirmed ? onChange : activate}
        style={{ minHeight: minimumTargetSize, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text
          style={{
            ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'label'),
            color: color.careBlue,
          }}
        >
          {confirmed ? changeLabel : confirmLabel}
        </Text>
      </FocusVisiblePressable>
    </View>
  );
}
