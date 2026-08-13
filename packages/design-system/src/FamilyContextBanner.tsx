import React, { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { color, minimumTargetSize, spacing, type } from './tokens.ts';

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
      accessibilityRole="summary"
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
      <Text ref={heading} accessibilityRole="header" style={type.label}>
        {title}
      </Text>
      <Text style={{ ...type.body, color: color.ink }}>
        <Text style={type.label}>{patientName}</Text> · {relationshipLabel}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={confirmed ? onChange : activate}
        style={{ minHeight: minimumTargetSize, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={{ ...type.label, color: color.careBlue }}>
          {confirmed ? changeLabel : confirmLabel}
        </Text>
      </Pressable>
    </View>
  );
}
