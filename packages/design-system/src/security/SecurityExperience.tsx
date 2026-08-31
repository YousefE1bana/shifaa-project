import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import { FocusVisiblePressable } from '../EmergencyFoundation.tsx';
import { color, localizedType, minimumTargetSize, semanticStyles, spacing } from '../tokens.ts';

export type SecurityBannerTone = 'information' | 'success' | 'warning' | 'danger' | 'offline';

const toneColor: Record<SecurityBannerTone, string> = {
  information: color.info,
  success: color.positive,
  warning: color.warning,
  danger: color.danger,
  offline: color.warning,
};

const toneCue: Record<SecurityBannerTone, string> = {
  information: 'ⓘ',
  success: '✓',
  warning: '!',
  danger: '!',
  offline: '↻',
};

export function SecurityStatusBanner({
  tone,
  title,
  detail,
  actionLabel,
  onAction,
  direction,
  focusKey,
}: {
  tone: SecurityBannerTone;
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  direction: 'rtl' | 'ltr';
  focusKey?: string;
}) {
  const headingRef = useRef<{ focus?: () => void } | null>(null);
  useEffect(() => headingRef.current?.focus?.(), [focusKey]);
  const locale = direction === 'rtl' ? 'ar-EG' : 'en-EG';
  const assertive = tone === 'danger';
  return (
    <View
      accessibilityRole={assertive ? 'alert' : undefined}
      accessibilityLiveRegion={assertive ? 'assertive' : 'polite'}
      style={{
        ...semanticStyles.card,
        borderColor: toneColor[tone],
        borderWidth: 2,
        gap: spacing.sm,
        direction,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text accessible={false} aria-hidden style={{ color: toneColor[tone] }}>
          {toneCue[tone]}
        </Text>
        <View
          ref={headingRef as never}
          tabIndex={-1}
          accessibilityRole="header"
          accessible
          style={{ flexShrink: 1 }}
        >
          <Text style={{ ...localizedType(locale, 'title'), color: color.ink }}>{title}</Text>
        </View>
      </View>
      {detail ? (
        <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>{detail}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={onAction}
          style={{ ...semanticStyles.primaryAction, minHeight: minimumTargetSize }}
        >
          <Text
            style={{ ...localizedType(locale, 'label'), color: color.inverse, textAlign: 'center' }}
          >
            {actionLabel}
          </Text>
        </FocusVisiblePressable>
      ) : null}
    </View>
  );
}

export function SecurityDestructiveConfirmation({
  title,
  resourceLabel,
  consequence,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  direction,
  disabled = false,
}: {
  title: string;
  resourceLabel: string;
  consequence: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  direction: 'rtl' | 'ltr';
  disabled?: boolean;
}) {
  const locale = direction === 'rtl' ? 'ar-EG' : 'en-EG';
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
      <Text style={{ ...localizedType(locale, 'label'), color: color.danger }}>{title}</Text>
      <BidiSafeText text={resourceLabel} direction={direction} />
      <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>{consequence}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <FocusVisiblePressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={onConfirm}
          style={{ ...semanticStyles.destructiveAction, minHeight: minimumTargetSize, flexGrow: 1 }}
        >
          <Text
            style={{ ...localizedType(locale, 'label'), color: color.inverse, textAlign: 'center' }}
          >
            {confirmLabel}
          </Text>
        </FocusVisiblePressable>
        <FocusVisiblePressable
          accessibilityRole="button"
          onPress={onCancel}
          style={{
            minHeight: minimumTargetSize,
            borderWidth: 1,
            borderColor: color.border,
            paddingInline: spacing.lg,
            justifyContent: 'center',
            flexGrow: 1,
          }}
        >
          <Text
            style={{ ...localizedType(locale, 'label'), color: color.ink, textAlign: 'center' }}
          >
            {cancelLabel}
          </Text>
        </FocusVisiblePressable>
      </View>
    </View>
  );
}

export function BidiSafeText({ text, direction }: { text: string; direction: 'rtl' | 'ltr' }) {
  return (
    <Text
      selectable
      style={{
        ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'body'),
        color: color.ink,
        direction: 'ltr',
        textAlign: direction === 'rtl' ? 'right' : 'left',
      }}
    >
      {'\u2066'}
      {text}
      {'\u2069'}
    </Text>
  );
}
