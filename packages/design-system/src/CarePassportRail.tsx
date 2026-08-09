import React from 'react';
import { Text, View } from 'react-native';
import { color, minimumTargetSize, spacing, type } from './tokens.ts';

export type RailStatus = 'complete' | 'current' | 'pending';
export type RailItem = { key: string; label: string; status: RailStatus; statusLabel: string };

export function CarePassportRail({
  items,
  critical = false,
}: {
  items: RailItem[];
  critical?: boolean;
}) {
  return (
    <View
      accessibilityRole="list"
      accessibilityLabel="Care passport status"
      style={{ gap: spacing.sm }}
    >
      {items.map((item) => (
        <View
          key={item.key}
          accessibilityLabel={`${item.label}: ${item.statusLabel}`}
          style={{
            minHeight: minimumTargetSize,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <View
            aria-hidden
            style={{
              width: 8,
              alignSelf: 'stretch',
              borderRadius: 4,
              backgroundColor:
                item.status === 'complete'
                  ? color.positive
                  : item.status === 'current'
                    ? color.careBlue
                    : color.border,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ ...type.label, color: color.ink }}>{item.label}</Text>
            <Text style={{ ...type.body, color: color.mutedInk }}>{item.statusLabel}</Text>
          </View>
          {!critical && item.status === 'current' ? (
            <Text accessibilityLabel="Current section" style={{ color: color.careBlue }}>
              ●
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
