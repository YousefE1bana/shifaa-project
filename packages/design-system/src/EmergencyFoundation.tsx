import React, { useState } from 'react';
import { Linking, Pressable, Text, View, type PressableProps } from 'react-native';

import { color, localizedType, minimumTargetSize, semanticStyles, spacing } from './tokens.ts';

export type FreshnessState = 'fresh' | 'stale' | 'unknown';

export function FocusVisiblePressable({ style, onFocus, onBlur, ...props }: PressableProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...props}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        focused ? semanticStyles.focusRing : null,
      ]}
    />
  );
}

export function StalenessIndicator({
  state,
  label,
  updatedLabel,
  updatedAt,
  direction,
}: {
  state: FreshnessState;
  label: string;
  updatedLabel: string;
  updatedAt?: string;
  direction: 'rtl' | 'ltr';
}) {
  const tone =
    state === 'fresh' ? color.positive : state === 'stale' ? color.warning : color.mutedInk;
  return (
    <View
      accessibilityLabel={`${label}${updatedAt ? `, ${updatedLabel} ${updatedAt}` : ''}`}
      style={{
        direction,
        ...(direction === 'rtl'
          ? { borderRightColor: tone, borderRightWidth: 4 }
          : { borderLeftColor: tone, borderLeftWidth: 4 }),
        backgroundColor: color.surfaceSubtle,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <Text
        style={{ ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'label'), color: tone }}
      >
        {label}
      </Text>
      {updatedAt ? (
        <Text
          style={{
            ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'body'),
            color: color.mutedInk,
          }}
        >
          {updatedLabel}:{' '}
          <Text style={{ direction: 'ltr', fontVariant: ['tabular-nums'] }}>{updatedAt}</Text>
        </Text>
      ) : null}
    </View>
  );
}

export function RouteStatePanel({
  title,
  detail,
  assertive = false,
  actionLabel,
  onAction,
  direction,
}: {
  title: string;
  detail?: string;
  assertive?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  direction: 'rtl' | 'ltr';
}) {
  return (
    <View
      accessibilityRole={assertive ? 'alert' : undefined}
      accessibilityLiveRegion={assertive ? 'assertive' : 'polite'}
      style={{ ...semanticStyles.card, gap: spacing.sm }}
    >
      <Text
        accessibilityRole="header"
        style={{
          ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'title'),
          color: color.ink,
        }}
      >
        {title}
      </Text>
      {detail ? (
        <Text
          style={{
            ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'body'),
            color: color.ink,
          }}
        >
          {detail}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={onAction}
          style={{
            minHeight: minimumTargetSize,
            justifyContent: 'center',
            alignSelf: 'flex-start',
          }}
        >
          <Text
            style={{
              ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'label'),
              color: color.brand,
            }}
          >
            {actionLabel}
          </Text>
        </FocusVisiblePressable>
      ) : null}
    </View>
  );
}

export function Call123Action({
  label,
  hint,
  direction,
}: {
  label: string;
  hint: string;
  direction: 'rtl' | 'ltr';
}) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        borderColor: color.emergency,
        borderWidth: 2,
        borderRadius: 12,
        padding: spacing.md,
        gap: spacing.sm,
        backgroundColor: color.surface,
      }}
    >
      <Text
        style={{
          ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'body'),
          color: color.ink,
        }}
      >
        {hint}
      </Text>
      <FocusVisiblePressable
        accessibilityRole="link"
        accessibilityLabel={label}
        onPress={() => Linking.openURL('tel:123')}
        style={semanticStyles.emergencyAction}
      >
        <Text
          style={{
            ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'label'),
            color: color.inverse,
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      </FocusVisiblePressable>
    </View>
  );
}

export function OfflineNoQueueBanner({
  text,
  direction,
}: {
  text: string;
  direction: 'rtl' | 'ltr';
}) {
  return (
    <View accessibilityRole="alert" style={{ ...semanticStyles.card, borderColor: color.warning }}>
      <Text
        style={{
          ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'body'),
          color: color.ink,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
