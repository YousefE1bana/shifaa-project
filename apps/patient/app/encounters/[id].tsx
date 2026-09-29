import {
  color,
  FocusVisiblePressable,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePatientLocaleController } from '../../src/locale-context';
import { patientAccessTokens, patientPlatform } from '../../src/patient-auth-store';
import { resolvePatientApiBaseUrl } from '../../src/patient-api-base-url';
import {
  PatientFeature010EncounterApi,
  patientEncounterCopy,
  type PatientEncounterReadState,
} from '../../src/feature-010-encounter';

export default function PatientEncounterRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, setLocale } = usePatientLocaleController();
  const copy = patientEncounterCopy[locale];
  const [state, setState] = useState<PatientEncounterReadState>('loading');
  const [encounter, setEncounter] = useState<Awaited<
    ReturnType<PatientFeature010EncounterApi['getEncounter']>
  > | null>(null);
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const api = useMemo(
    () =>
      new PatientFeature010EncounterApi({
        locale,
        accessToken: () => patientAccessTokens.read(),
        apiBaseUrl: resolvePatientApiBaseUrl({
          platform: patientPlatform,
          configuredBaseUrl: process.env['EXPO_PUBLIC_API_BASE_URL'],
          ...(typeof globalThis.location?.origin === 'string'
            ? { webOrigin: globalThis.location.origin }
            : {}),
        }),
      }),
    [locale],
  );
  const invalidateActiveRequest = useCallback(() => {
    requestGeneration.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);
  const load = useCallback(async () => {
    invalidateActiveRequest();
    const generation = requestGeneration.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    setEncounter(null);
    setState('loading');
    try {
      const current = await api.getEncounter(id, controller.signal);
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      setEncounter(current);
      setState(current.status === 'completed' ? 'completed' : 'visible');
    } catch {
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      setEncounter(null);
      setState(api.readState);
    } finally {
      if (generation === requestGeneration.current) activeRequest.current = null;
    }
  }, [api, id, invalidateActiveRequest]);
  useEffect(() => {
    void load();
    return invalidateActiveRequest;
  }, [load, invalidateActiveRequest]);
  useEffect(() => {
    const online = () => {
      void load();
    };
    const offline = () => {
      invalidateActiveRequest();
      api.markOffline();
      setEncounter(null);
      setState('offline');
    };
    if (typeof window !== 'undefined') window.addEventListener('online', online);
    if (typeof window !== 'undefined') window.addEventListener('offline', offline);
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      }
    };
  }, [api, invalidateActiveRequest, load]);

  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const message =
    state === 'denied'
      ? copy.denied
      : state === 'offline'
        ? copy.offline
        : state === 'stale'
          ? copy.stale
          : state === 'error'
            ? copy.error
            : state === 'loading'
              ? copy.loading
              : copy.empty;
  return (
    <ScrollView
      role="main"
      contentContainerStyle={{
        ...semanticStyles.screen,
        direction,
        width: '100%',
        maxWidth: 720,
        minHeight: '100%',
        alignSelf: 'center',
        paddingBlock: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text
          accessibilityRole="header"
          style={{ ...localizedType(locale, 'display'), color: color.ink }}
        >
          {copy.title}
        </Text>
        <FocusVisiblePressable
          accessibilityRole="button"
          accessibilityLabel={locale === 'ar-EG' ? 'English' : 'العربية'}
          onPress={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
            {locale === 'ar-EG' ? 'English' : 'العربية'}
          </Text>
        </FocusVisiblePressable>
      </View>
      {!encounter ? (
        <View
          accessibilityRole={
            state === 'denied' || state === 'offline' || state === 'stale' ? 'alert' : 'summary'
          }
          accessibilityLiveRegion="polite"
          style={semanticStyles.card}
        >
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>{message}</Text>
          {state !== 'loading' && (
            <FocusVisiblePressable
              accessibilityRole="button"
              accessibilityLabel={copy.refresh}
              onPress={() => void load()}
              style={{ minWidth: 44, minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
                {copy.refresh}
              </Text>
            </FocusVisiblePressable>
          )}
        </View>
      ) : (
        <View accessibilityLiveRegion="polite" style={{ gap: spacing.md }}>
          <View style={semanticStyles.card}>
            <Text style={{ ...localizedType(locale, 'title'), color: color.ink }}>
              {state === 'completed' ? copy.completed : copy.open}
            </Text>
            <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
              {copy.started}:{' '}
              {new Date(encounter.startedAt).toLocaleString(locale, { timeZone: 'Africa/Cairo' })}
            </Text>
            {encounter.completionSummary !== undefined && (
              <View style={{ gap: spacing.xs }}>
                <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                  {copy.completion}
                </Text>
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {encounter.completionSummary}
                </Text>
              </View>
            )}
          </View>
          {encounter.notes
            ?.filter((note) => note.visibility === 'patient_visible')
            .map((note) => (
              <View key={note.id} style={semanticStyles.card}>
                <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                  {copy.note}
                </Text>
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {note.body}
                </Text>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}
