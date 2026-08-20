import { color, semanticStyles, spacing, type } from '@shifaa/design-system';
import { translate, type Locale, type MessageKey } from '@shifaa/i18n';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PatientScreen, StatusMessage } from '../../src/PatientScreen';
import {
  createPatientPrivacyClient,
  createPrivacyRequest,
  syntheticPrivacyIds,
} from '../../src/privacy-dsr-api';
import { usePatientLocale } from '../../src/locale-context';

type DsrType = 'access_export' | 'correction' | 'restriction' | 'erasure_pseudonymization';
type Dsr = {
  id: string;
  request_type: DsrType;
  status: string;
  submitted_at: string;
  due_at: string;
  due_policy_label: 'synthetic_non_statutory';
  version: number;
};
type DisplayState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'offline'
  | 'permission'
  | 'stale'
  | 'export-ready'
  | 'export-expired'
  | 'failure'
  | 'success';
const types: readonly { value: DsrType; label: MessageKey }[] = [
  { value: 'access_export', label: 'privacy.requests.access' },
  { value: 'correction', label: 'privacy.requests.correction' },
  { value: 'restriction', label: 'privacy.requests.restriction' },
  { value: 'erasure_pseudonymization', label: 'privacy.requests.erasure' },
];
const displayStates: readonly DisplayState[] = [
  'loading',
  'ready',
  'empty',
  'offline',
  'permission',
  'stale',
  'export-ready',
  'export-expired',
  'failure',
  'success',
];

function readSyntheticDisplayState(): DisplayState | undefined {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return undefined;
  const candidate = new URLSearchParams(window.location.search).get('qa');
  return displayStates.find((value) => value === candidate);
}

export default function PrivacyRequestsRoute({
  locale: localeOverride,
  qaState,
}: {
  locale?: Locale;
  qaState?: DisplayState;
}) {
  const locale = usePatientLocale(localeOverride);
  const effectiveQaState = qaState ?? readSyntheticDisplayState();
  const client = useMemo(() => createPatientPrivacyClient(locale), [locale]);
  const [items, setItems] = useState<Dsr[]>([]);
  const [state, setState] = useState<DisplayState>(effectiveQaState ?? 'loading');
  const load = useCallback(async () => {
    if (effectiveQaState) return setState(effectiveQaState);
    if (typeof navigator !== 'undefined' && !navigator.onLine) return setState('offline');
    setState('loading');
    try {
      const result = (await client.listMyDsrs({
        managedPatientId: syntheticPrivacyIds.patient,
      })) as { items: Dsr[] };
      setItems(result.items);
      setState(result.items.length ? 'ready' : 'empty');
    } catch (error: unknown) {
      setState(
        error instanceof Error && 'status' in error && error.status === 403
          ? 'permission'
          : 'failure',
      );
    }
  }, [client, effectiveQaState]);
  useEffect(() => void load(), [load]);
  const stateMessage: Partial<Record<DisplayState, MessageKey>> = {
    loading: 'state.loading',
    empty: 'privacy.empty',
    offline: 'privacy.requests.offline',
    permission: 'state.permission',
    stale: 'privacy.requests.stale',
    'export-ready': 'privacy.requests.exportReady',
    'export-expired': 'privacy.requests.exportExpired',
    failure: 'state.unavailable',
    success: 'privacy.requests.success',
  };
  return (
    <PatientScreen locale={locale} title="privacy.requests.title" current={3} critical>
      <Text style={{ ...type.body, color: color.mutedInk }}>
        {translate(locale, 'privacy.requests.intro')}
      </Text>
      {stateMessage[state] ? (
        <StatusMessage
          text={translate(locale, stateMessage[state]!)}
          retry={state === 'failure' ? load : undefined}
        />
      ) : null}
      <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
        {types.map((requestType) => (
          <Pressable
            key={requestType.value}
            accessibilityRole="button"
            disabled={state === 'offline' || state === 'loading'}
            onPress={async () => {
              setState('loading');
              try {
                await createPrivacyRequest(locale, requestType.value);
                await load();
                setState('success');
              } catch {
                setState(
                  typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'failure',
                );
              }
            }}
            style={semanticStyles.primaryAction}
          >
            <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
              {translate(locale, requestType.label)}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ gap: spacing.md }}>
        {items.map((item) => (
          <View
            key={item.id}
            style={{ ...semanticStyles.card, gap: spacing.xs }}
            accessible
            accessibilityLabel={`${translate(locale, `privacy.status.${item.status}` as MessageKey)} ${item.id}`}
          >
            <Text style={{ ...type.title, color: color.ink }}>
              {translate(locale, types.find((entry) => entry.value === item.request_type)!.label)}
            </Text>
            <Text selectable style={{ ...type.body, color: color.ink }}>
              {item.id}
            </Text>
            <Text style={{ ...type.label, color: color.careBlue }}>
              {translate(locale, `privacy.status.${item.status}` as MessageKey)}
            </Text>
            <Text style={{ ...type.body, color: color.mutedInk }}>
              {translate(locale, 'privacy.requests.due')}:{' '}
              {new Date(item.due_at).toLocaleDateString(locale)}
            </Text>
            <Text style={{ ...type.body, color: color.mutedInk }}>
              {translate(locale, 'privacy.requests.history')}: v{item.version}
            </Text>
            {item.request_type === 'access_export' && item.status === 'fulfilled' ? (
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  setState('loading');
                  try {
                    const issued = (await client.downloadDsrExport(
                      item.id,
                      `synthetic-ui-005-export-issue-${Date.now()}`,
                    )) as { download_url: string };
                    const token = new URL(
                      issued.download_url,
                      'https://synthetic.invalid',
                    ).searchParams.get('capability');
                    if (!token) throw new Error('export-capability-missing');
                    const bytes = (await client.downloadDsrExport(
                      item.id,
                      `synthetic-ui-005-export-consume-${Date.now()}`,
                      { capability_token: token },
                    )) as ArrayBuffer;
                    if (typeof document !== 'undefined') {
                      const url = URL.createObjectURL(new Blob([bytes]));
                      const anchor = document.createElement('a');
                      anchor.href = url;
                      anchor.download = `shifaa-${item.id}.json`;
                      anchor.click();
                      URL.revokeObjectURL(url);
                    }
                    setState('success');
                  } catch (error: unknown) {
                    setState(
                      error instanceof Error && 'status' in error && error.status === 410
                        ? 'export-expired'
                        : 'failure',
                    );
                  }
                }}
                style={semanticStyles.primaryAction}
              >
                <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
                  {translate(locale, 'privacy.requests.download')}
                </Text>
              </Pressable>
            ) : null}
            {item.request_type === 'erasure_pseudonymization' ? (
              <Text style={{ ...type.body, color: color.mutedInk }}>
                {translate(locale, 'privacy.requests.retentionBlocked')}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </PatientScreen>
  );
}
