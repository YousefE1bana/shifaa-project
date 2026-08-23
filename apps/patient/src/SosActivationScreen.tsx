import {
  Call123Action,
  FamilyContextBanner,
  FocusVisiblePressable,
  OfflineNoQueueBanner,
  RouteStatePanel,
  color,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import { translate } from '@shifaa/i18n';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import {
  assertDiscoverySosOnline,
  createPatientDiscoverySosClient,
  hasDiscoverySosStatus,
  retainedMutationKey,
  syntheticDiscoverySosIds,
  type SosIncidentProjection,
} from './discovery-sos-api';
import { DiscoverySosShell } from './DiscoverySosShell';
import { usePatientLocaleController } from './locale-context';

const reasons = ['medical_emergency', 'accident_or_injury', 'other_life_safety'] as const;

export function SosActivationScreen() {
  const { locale } = usePatientLocaleController();
  const router = useRouter();
  const client = useMemo(() => createPatientDiscoverySosClient(locale), [locale]);
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const [contextConfirmed, setContextConfirmed] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const activationIntent = useRef<{ signature: string; key: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState<(typeof reasons)[number]>('medical_emergency');
  const [contactPreference, setContactPreference] = useState<'none' | 'all_confirmed'>('none');
  const [callbackSource, setCallbackSource] = useState<
    'patient_verified_contact' | 'initiator_verified_contact'
  >('patient_verified_contact');
  const [state, setState] = useState<'idle' | 'locating' | 'offline' | 'permission' | 'error'>(
    'idle',
  );
  const activate = async () => {
    if (!confirmed || !contextConfirmed || !locationConfirmed) return;
    try {
      assertDiscoverySosOnline();
      setState('locating');
      const body = {
        managed_patient_id: syntheticDiscoverySosIds.patient,
        coordinates: { latitude: 30.1005, longitude: 31.2005 },
        qualifying_reason_code: reason,
        contact_preference: contactPreference,
        callback_source: callbackSource,
        explicit_activation: true as const,
      };
      const payload = (await client.createSosIncident(
        body,
        retainedMutationKey(activationIntent, 'activate', body),
      )) as { incident?: SosIncidentProjection };
      if (!payload.incident) throw new Error('invalid-response');
      router.replace(`/sos/${payload.incident.incident_id}`);
    } catch (error: unknown) {
      setState(
        error instanceof Error && error.message === 'offline-no-queue'
          ? 'offline'
          : hasDiscoverySosStatus(error, 403)
            ? 'permission'
            : 'error',
      );
    }
  };
  const reasonKeys = {
    medical_emergency: 'sos.reason.medical',
    accident_or_injury: 'sos.reason.accident',
    other_life_safety: 'sos.reason.other',
  } as const;
  return (
    <DiscoverySosShell title="sos.title" emergency>
      <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
        {translate(locale, 'sos.intro')}
      </Text>
      <FamilyContextBanner
        patientName={translate(locale, 'sos.syntheticPatient')}
        relationshipLabel={translate(locale, 'family.context.self')}
        confirmed={contextConfirmed}
        direction={direction}
        confirmLabel={translate(locale, 'family.context.confirm')}
        changeLabel={translate(locale, 'family.context.change')}
        title={translate(locale, 'family.context.title')}
        onConfirm={() => setContextConfirmed(true)}
        onChange={() => setContextConfirmed(false)}
      />
      <Call123Action
        label={translate(locale, 'sos.call123')}
        hint={translate(locale, 'sos.call123Hint')}
        direction={direction}
      />
      <View style={{ ...semanticStyles.card, gap: spacing.md }}>
        <Text
          accessibilityRole="header"
          style={{ ...localizedType(locale, 'title'), color: color.ink }}
        >
          {translate(locale, 'sos.reason')}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={translate(locale, 'sos.reason')}
          style={{ gap: spacing.sm }}
        >
          {reasons.map((value) => (
            <FocusVisiblePressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: reason === value }}
              onPress={() => setReason(value)}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {reason === value ? '● ' : '○ '}
                {translate(locale, reasonKeys[value])}
              </Text>
            </FocusVisiblePressable>
          ))}
        </View>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={translate(locale, 'family.contact.title')}
          style={{ gap: spacing.sm }}
        >
          {(['none', 'all_confirmed'] as const).map((value) => (
            <FocusVisiblePressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: contactPreference === value }}
              onPress={() => setContactPreference(value)}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {contactPreference === value ? '● ' : '○ '}
                {translate(locale, value === 'none' ? 'sos.contact.none' : 'sos.contact.all')}
              </Text>
            </FocusVisiblePressable>
          ))}
        </View>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={locale === 'ar-EG' ? 'رقم الرجوع' : 'Callback source'}
          style={{ gap: spacing.sm }}
        >
          {(['patient_verified_contact', 'initiator_verified_contact'] as const).map((value) => (
            <FocusVisiblePressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: callbackSource === value }}
              onPress={() => setCallbackSource(value)}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                {callbackSource === value ? '● ' : '○ '}
                {translate(
                  locale,
                  value === 'patient_verified_contact'
                    ? 'sos.callback.patient'
                    : 'sos.callback.initiator',
                )}
              </Text>
            </FocusVisiblePressable>
          ))}
        </View>
        <FocusVisiblePressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: locationConfirmed }}
          onPress={() => setLocationConfirmed((value) => !value)}
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {locationConfirmed ? '☑ ' : '☐ '}
            {translate(locale, 'sos.syntheticLocation')}
          </Text>
        </FocusVisiblePressable>
        <FocusVisiblePressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          onPress={() => setConfirmed((value) => !value)}
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {confirmed ? '☑ ' : '☐ '}
            {translate(locale, 'sos.confirm')}
          </Text>
        </FocusVisiblePressable>
        {!confirmed ? (
          <Text style={{ ...localizedType(locale, 'body'), color: color.danger }}>
            {translate(locale, 'sos.confirm')}
          </Text>
        ) : null}
        <FocusVisiblePressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: !confirmed || !contextConfirmed || !locationConfirmed,
            busy: state === 'locating',
          }}
          disabled={!confirmed || !contextConfirmed || !locationConfirmed || state === 'locating'}
          onPress={activate}
          style={{
            ...semanticStyles.emergencyAction,
            opacity: confirmed && contextConfirmed && locationConfirmed ? 1 : 0.55,
          }}
        >
          <Text
            style={{ ...localizedType(locale, 'label'), color: color.inverse, textAlign: 'center' }}
          >
            {translate(locale, state === 'locating' ? 'sos.locating' : 'sos.activate')}
          </Text>
        </FocusVisiblePressable>
      </View>
      {state === 'offline' ? (
        <OfflineNoQueueBanner text={translate(locale, 'sos.offline')} direction={direction} />
      ) : null}
      {state === 'permission' ? (
        <RouteStatePanel
          title={translate(locale, 'sos.permission')}
          assertive
          direction={direction}
        />
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
