import {
  OfflineNoQueueBanner,
  FocusVisiblePressable,
  RouteStatePanel,
  color,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import { translate, type MessageKey } from '@shifaa/i18n';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import {
  assertDiscoverySosOnline,
  createPatientDiscoverySosClient,
  retainedMutationKey,
} from '../../../src/discovery-sos-api';
import { DiscoverySosShell } from '../../../src/DiscoverySosShell';
import { usePatientLocaleController } from '../../../src/locale-context';

const fields = [
  ['blood_group', 'share.field.bloodGroup'],
  ['confirmed_allergies', 'share.field.allergies'],
  ['active_dispensed_medicines', 'share.field.medicines'],
  ['chronic_conditions', 'share.field.conditions'],
  ['emergency_notes', 'share.field.notes'],
] as const;
type ShareField = (typeof fields)[number][0];

export default function EmergencyShareOwnerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale } = usePatientLocaleController();
  const client = useMemo(() => createPatientDiscoverySosClient(locale), [locale]);
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const createIntent = useRef<{ signature: string; key: string } | null>(null);
  const revokeIntent = useRef<{ signature: string; key: string } | null>(null);
  const [selected, setSelected] = useState<ShareField[]>(['blood_group']);
  const [share, setShare] = useState<{
    shareId: string;
    shareUrl: string | null;
    version: number;
  } | null>(null);
  const [state, setState] = useState<
    'idle' | 'loading' | 'copied' | 'manual-copy' | 'revoked' | 'offline' | 'error'
  >('idle');
  const toggle = (field: ShareField) =>
    setSelected((current) =>
      current.includes(field) ? current.filter((value) => value !== field) : [...current, field],
    );
  const create = async () => {
    try {
      assertDiscoverySosOnline();
      setState('loading');
      const body = { allowed_fields: [...selected].sort() as ShareField[] };
      const payload = (await client.createEmergencyShare(
        id,
        body,
        retainedMutationKey(createIntent, 'share-create', { incidentId: id, body }),
      )) as {
        share?: { share_id: string; version: number };
        share_url?: string;
      };
      if (!payload.share || !payload.share_url) throw new Error('invalid-response');
      setShare({
        shareId: payload.share.share_id,
        shareUrl: payload.share_url,
        version: payload.share.version,
      });
      setState('idle');
    } catch (error: unknown) {
      setState(
        error instanceof Error && error.message === 'offline-no-queue' ? 'offline' : 'error',
      );
    }
  };
  const copy = async () => {
    if (!share?.shareUrl) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setState('manual-copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setShare({ ...share, shareUrl: null });
      setState('copied');
    } catch {
      setState('manual-copy');
    }
  };
  const revoke = async () => {
    if (!share) return;
    try {
      assertDiscoverySosOnline();
      await client.revokeEmergencyShare(
        share.shareId,
        share.version,
        retainedMutationKey(revokeIntent, 'share-revoke', {
          shareId: share.shareId,
          version: share.version,
        }),
      );
      setShare(null);
      setState('revoked');
    } catch (error: unknown) {
      setState(
        error instanceof Error && error.message === 'offline-no-queue' ? 'offline' : 'error',
      );
    }
  };
  return (
    <DiscoverySosShell title="share.title" emergency>
      <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
        {translate(locale, 'share.risk')}
      </Text>
      <View accessibilityRole="list" style={{ ...semanticStyles.card, gap: spacing.sm }}>
        {fields.map(([field, key]) => (
          <FocusVisiblePressable
            key={field}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected.includes(field) }}
            onPress={() => toggle(field)}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
              {selected.includes(field) ? '☑ ' : '☐ '}
              {translate(locale, key as MessageKey)}
            </Text>
          </FocusVisiblePressable>
        ))}
        <FocusVisiblePressable
          accessibilityRole="button"
          accessibilityState={{ disabled: selected.length === 0, busy: state === 'loading' }}
          disabled={selected.length === 0 || state === 'loading'}
          onPress={create}
          style={{ ...semanticStyles.primaryAction, opacity: selected.length ? 1 : 0.55 }}
        >
          <Text
            style={{ ...localizedType(locale, 'label'), color: color.inverse, textAlign: 'center' }}
          >
            {translate(locale, 'share.create')}
          </Text>
        </FocusVisiblePressable>
      </View>
      {share ? (
        <View accessibilityRole="alert" style={{ ...semanticStyles.card, gap: spacing.md }}>
          {share.shareUrl ? (
            <>
              <Text style={{ ...localizedType(locale, 'body'), color: color.danger }}>
                {translate(locale, 'share.shownOnce')}
              </Text>
              <Text
                selectable
                style={{ ...localizedType(locale, 'body'), color: color.ink, direction: 'ltr' }}
              >
                {share.shareUrl}
              </Text>
              <FocusVisiblePressable
                accessibilityRole="button"
                onPress={copy}
                style={semanticStyles.primaryAction}
              >
                <Text
                  style={{
                    ...localizedType(locale, 'label'),
                    color: color.inverse,
                    textAlign: 'center',
                  }}
                >
                  {translate(locale, 'share.copy')}
                </Text>
              </FocusVisiblePressable>
            </>
          ) : null}
          <FocusVisiblePressable
            accessibilityRole="button"
            onPress={revoke}
            style={semanticStyles.destructiveAction}
          >
            <Text
              style={{
                ...localizedType(locale, 'label'),
                color: color.inverse,
                textAlign: 'center',
              }}
            >
              {translate(locale, 'share.revoke')}
            </Text>
          </FocusVisiblePressable>
        </View>
      ) : null}
      {state === 'copied' ? (
        <RouteStatePanel title={translate(locale, 'share.copied')} direction={direction} />
      ) : null}
      {state === 'manual-copy' ? (
        <RouteStatePanel
          title={translate(locale, 'share.manualCopy')}
          detail={translate(locale, 'share.manualCopyHelp')}
          direction={direction}
        />
      ) : null}
      {state === 'revoked' ? (
        <RouteStatePanel title={translate(locale, 'share.expired')} direction={direction} />
      ) : null}
      {state === 'offline' ? (
        <OfflineNoQueueBanner text={translate(locale, 'share.offline')} direction={direction} />
      ) : null}
      {state === 'error' ? (
        <RouteStatePanel
          title={translate(locale, 'state.unavailable')}
          assertive
          direction={direction}
        />
      ) : null}
    </DiscoverySosShell>
  );
}
