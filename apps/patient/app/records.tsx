import {
  color,
  FocusVisiblePressable,
  OfflineNoQueueBanner,
  radius,
  RouteStatePanel,
  localizedType,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import type {
  PendingSubjectReferralProjection,
  PublicDoctorProjection,
  TargetSlot,
} from '@shifaa/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';

import { createPatientClinicSchedulingClient } from '../src/clinic-scheduling-api';
import { patientAccessTokens } from '../src/patient-auth-store';
import { patientOnboardingApi } from '../src/identity-onboarding-api';
import {
  PatientFeature010ReferralApi,
  referralRecordsCopy,
  type EncounterTypeChoice,
  type PatientReferralActorRole,
} from '../src/feature-010-referrals';
import { usePatientLocaleController } from '../src/locale-context';
import { patientPlatform } from '../src/patient-auth-store';
import { resolvePatientApiBaseUrl } from '../src/patient-api-base-url';

type ScreenState =
  | 'loading'
  | 'empty'
  | 'denied'
  | 'offline'
  | 'stale'
  | 'error'
  | 'conflict'
  | 'pending'
  | 'review'
  | 'searching'
  | 'slots'
  | 'submitting'
  | 'accepted';

type TargetChoice = { doctor: PublicDoctorProjection; slot: TargetSlot };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actorRoles: PatientReferralActorRole[] = ['PAT', 'GUA', 'DEL'];
type WebKeyboardEvent = {
  key?: string;
  repeat?: boolean;
  preventDefault?: () => void;
};

function webKeyboardActivationProps(onActivate: () => void) {
  if (Platform.OS !== 'web') return {};
  return {
    onKeyDown: (event: WebKeyboardEvent) => {
      if (
        (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') &&
        !event.repeat
      ) {
        event.preventDefault?.();
        onActivate();
      }
    },
  };
}

const statusOf = (error: unknown) =>
  error && typeof error === 'object' && 'status' in error
    ? (error as { status?: unknown }).status
    : null;

function localDateAfter(days: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (name: string) => parts.find((part) => part.type === name)?.value ?? '';
  const date = new Date(
    Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')) + days),
  );
  return date.toISOString().slice(0, 10);
}

function displayTime(value: string, locale: 'ar-EG' | 'en-EG', timezone: string): string {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return '—';
  try {
    return new Intl.DateTimeFormat(`${locale}-u-ca-gregory`, {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(instant);
  } catch {
    return '—';
  }
}

function validActorRole(value: unknown): value is PatientReferralActorRole {
  return actorRoles.includes(value as PatientReferralActorRole);
}

export default function PatientRecordsRoute() {
  const params = useLocalSearchParams<{ actingRole?: string; patientId?: string }>();
  const router = useRouter();
  const { locale, setLocale } = usePatientLocaleController();
  const copy = referralRecordsCopy[locale];
  const initialRole = validActorRole(params.actingRole) ? params.actingRole : 'PAT';
  const [actorRole, setActorRole] = useState<PatientReferralActorRole>(initialRole);
  const [state, setState] = useState<ScreenState>('loading');
  const [patientId, setPatientId] = useState('');
  const [referrals, setReferrals] = useState<PendingSubjectReferralProjection[]>([]);
  const [selectedReferral, setSelectedReferral] = useState<PendingSubjectReferralProjection | null>(
    null,
  );
  const [reasonAuthorized, setReasonAuthorized] = useState(false);
  const [encounterTypeChoice, setEncounterTypeChoice] = useState<EncounterTypeChoice>(null);
  const [targets, setTargets] = useState<TargetChoice[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<PublicDoctorProjection | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<TargetChoice | null>(null);
  const [booked, setBooked] = useState<Awaited<
    ReturnType<PatientFeature010ReferralApi['acceptReferral']>
  > | null>(null);
  const requestGeneration = useRef(0);
  const mutationInFlight = useRef(false);
  const searchInFlight = useRef(false);
  const resultFocus = useRef<View>(null);
  const actionFocus = useRef<View>(null);
  const referralApi = useRef<PatientFeature010ReferralApi | null>(null);
  const direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const apiBaseUrl = useMemo(
    () =>
      resolvePatientApiBaseUrl({
        platform: patientPlatform,
        configuredBaseUrl: process.env['EXPO_PUBLIC_API_BASE_URL'],
        ...(typeof globalThis.location?.origin === 'string'
          ? { webOrigin: globalThis.location.origin }
          : {}),
      }),
    [],
  );
  const clearReferralState = useCallback(() => {
    referralApi.current?.clearProtectedState();
    setReferrals([]);
    setSelectedReferral(null);
    setReasonAuthorized(false);
    setEncounterTypeChoice(null);
    setTargets([]);
    setSelectedDoctor(null);
    setSelectedTarget(null);
    setBooked(null);
  }, []);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    clearReferralState();
    setPatientId('');
    referralApi.current = null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('offline');
      return;
    }
    if (!patientAccessTokens.read()) {
      setState('denied');
      return;
    }
    setState('loading');
    try {
      const profile = await patientOnboardingApi.getProfile();
      if (generation !== requestGeneration.current) return;
      if (!uuid.test(profile.id)) {
        setState('denied');
        return;
      }
      const subjectId = actorRole === 'PAT' ? profile.id : (params.patientId ?? '');
      if (!uuid.test(subjectId)) {
        setState('denied');
        return;
      }
      const currentApi = new PatientFeature010ReferralApi({
        locale,
        actorRole,
        patientId: subjectId,
        accessToken: () => patientAccessTokens.read(),
        apiBaseUrl,
      });
      referralApi.current = currentApi;
      const page = await currentApi.listPendingReferrals();
      if (generation !== requestGeneration.current) return;
      setPatientId(subjectId);
      setReferrals(page.data);
      setState(page.data.length ? 'pending' : 'empty');
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      const api = referralApi.current;
      clearReferralState();
      setState(
        api?.readState === 'denied' || statusOf(error) === 401 || statusOf(error) === 403
          ? 'denied'
          : api?.readState === 'offline' ||
              (error instanceof TypeError &&
                typeof navigator !== 'undefined' &&
                navigator.onLine === false)
            ? 'offline'
            : api?.readState === 'stale' ||
                (typeof statusOf(error) === 'number' && Number(statusOf(error)) >= 500)
              ? 'stale'
              : 'error',
      );
    }
  }, [actorRole, apiBaseUrl, clearReferralState, locale, params.patientId]);

  useEffect(() => {
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const online = () => void load();
    const offline = () => {
      requestGeneration.current += 1;
      referralApi.current?.markOffline();
      clearReferralState();
      setState('offline');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      }
    };
  }, [clearReferralState, load]);

  useEffect(() => {
    if (['accepted', 'conflict', 'denied', 'error', 'stale'].includes(state))
      resultFocus.current?.focus?.();
  }, [state]);

  const schedulingApi = () =>
    createPatientClinicSchedulingClient({
      locale,
      ...(patientId ? { patientId } : {}),
      accessToken: () => patientAccessTokens.read(),
      apiBaseUrl,
    });

  const selectActorRole = (role: PatientReferralActorRole) => {
    if (role === actorRole) return;
    requestGeneration.current += 1;
    setPatientId('');
    setActorRole(role);
    setState('loading');
    clearReferralState();
  };

  const discoverSlots = async () => {
    if (!selectedReferral || !reasonAuthorized || encounterTypeChoice === null) return;
    if (searchInFlight.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      clearReferralState();
      setState('offline');
      return;
    }
    searchInFlight.current = true;
    const generation = ++requestGeneration.current;
    setState('searching');
    setTargets([]);
    setSelectedDoctor(null);
    setSelectedTarget(null);
    try {
      const referralsApi = referralApi.current;
      if (!referralsApi) {
        clearReferralState();
        setState('denied');
        return;
      }
      const currentPage = await referralsApi.listPendingReferrals();
      if (generation !== requestGeneration.current) return;
      const currentReferral = currentPage.data.find((item) => item.id === selectedReferral.id);
      if (!currentReferral || currentReferral.version !== selectedReferral.version) {
        clearReferralState();
        setState('conflict');
        return;
      }
      setSelectedReferral(currentReferral);
      const api = schedulingApi();
      const fromDate = localDateAfter(0);
      const toDate = localDateAfter(30);
      const doctors: PublicDoctorProjection[] = [];
      let cursor: string | undefined;
      const seen = new Set<string>();
      let pagesRead = 0;
      do {
        pagesRead += 1;
        if (pagesRead > 20) throw new Error('discovery-page-limit');
        const page = await api.searchDoctors({
          specialty: selectedReferral.targetSpecialty,
          ...(selectedReferral.targetFacilityId
            ? { facilityId: selectedReferral.targetFacilityId }
            : {}),
          date: fromDate,
          ...(cursor ? { cursor } : {}),
        });
        if (page.freshness !== 'fresh') throw new Error('stale-discovery-projection');
        if (generation !== requestGeneration.current) return;
        doctors.push(
          ...page.items.filter(
            (doctor) =>
              doctor.specialty === selectedReferral.targetSpecialty &&
              !doctor.stale &&
              (!selectedReferral.targetFacilityId ||
                doctor.facilityId === selectedReferral.targetFacilityId) &&
              (!selectedReferral.targetDoctorId ||
                doctor.doctorId === selectedReferral.targetDoctorId),
          ),
        );
        cursor = page.nextCursor ?? undefined;
        if (cursor && seen.has(cursor)) throw new Error('discovery-cursor-loop');
        if (cursor) seen.add(cursor);
      } while (cursor);

      const found: TargetChoice[] = [];
      for (const doctor of doctors) {
        const availability = await api.listDoctorAvailability(doctor.facilityId, doctor.doctorId, {
          fromDate,
          toDate,
        });
        if (generation !== requestGeneration.current) return;
        if (availability.freshness !== 'fresh') throw new Error('stale-availability-projection');
        for (const slot of availability.items) {
          if (slot.facilityId !== doctor.facilityId || slot.doctorId !== doctor.doctorId) continue;
          found.push({
            doctor,
            slot: { ...slot, availabilityVersion: availability.version },
          });
        }
      }
      if (generation !== requestGeneration.current) return;
      setTargets(found);
      setState('slots');
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      setTargets([]);
      setSelectedTarget(null);
      clearReferralState();
      setState(
        statusOf(error) === 401 || statusOf(error) === 403
          ? 'denied'
          : error instanceof TypeError
            ? 'offline'
            : /stale/.test(error instanceof Error ? error.message : '') ||
                (typeof statusOf(error) === 'number' && Number(statusOf(error)) >= 500)
              ? 'stale'
              : 'error',
      );
    } finally {
      searchInFlight.current = false;
    }
  };

  const accept = async () => {
    if (!selectedReferral || !reasonAuthorized || encounterTypeChoice === null || !selectedTarget)
      return;
    if (mutationInFlight.current) return;
    const api = referralApi.current;
    if (!api) {
      setState('denied');
      clearReferralState();
      return;
    }
    const generation = requestGeneration.current;
    mutationInFlight.current = true;
    setState('submitting');
    setBooked(null);
    try {
      const result = await api.acceptReferral(
        selectedReferral,
        reasonAuthorized,
        encounterTypeChoice,
        selectedTarget.slot,
      );
      if (generation !== requestGeneration.current) return;
      setBooked(result);
      setReferrals((current) => current.filter((item) => item.id !== selectedReferral.id));
      setState('accepted');
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      if (statusOf(error) === 401 || statusOf(error) === 403 || api.readState === 'denied') {
        clearReferralState();
        setState('denied');
      } else if (statusOf(error) === 409 || statusOf(error) === 412) {
        clearReferralState();
        setState('conflict');
      } else if (
        error instanceof TypeError ||
        (typeof navigator !== 'undefined' && navigator.onLine === false)
      ) {
        clearReferralState();
        setState('offline');
      } else {
        clearReferralState();
        setState('error');
      }
    } finally {
      mutationInFlight.current = false;
    }
  };

  const stateText =
    state === 'loading'
      ? copy.loading
      : state === 'empty'
        ? copy.empty
        : state === 'denied'
          ? copy.denied
          : state === 'offline'
            ? copy.offline
            : state === 'stale'
              ? copy.stale
              : state === 'conflict'
                ? copy.conflict
                : state === 'error'
                  ? copy.error
                  : '';

  return (
    <ScrollView
      role="main"
      keyboardShouldPersistTaps="handled"
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
      <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>{copy.intro}</Text>

      <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
        <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>{copy.actingAs}</Text>
        <View
          testID="records-context-role"
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
        >
          {actorRoles.map((role) => (
            <FocusVisiblePressable
              key={role}
              testID={`records-context-role-${role}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: actorRole === role }}
              aria-checked={actorRole === role}
              {...webKeyboardActivationProps(() => selectActorRole(role))}
              onPress={() => selectActorRole(role)}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingInline: spacing.md,
                borderWidth: actorRole === role ? 2 : 1,
                borderColor: actorRole === role ? color.brand : color.border,
                borderRadius: radius.control,
              }}
            >
              <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                {role === 'PAT' ? copy.pat : role === 'GUA' ? copy.gua : copy.del}
              </Text>
            </FocusVisiblePressable>
          ))}
        </View>
        <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
          {copy.patientContext}
        </Text>
        <Text
          testID="records-context-patient"
          selectable
          style={{
            ...localizedType(locale, 'body'),
            color: color.ink,
            direction: 'ltr',
            writingDirection: 'ltr',
            textAlign: 'left',
          }}
        >
          {patientId ||
            (actorRole === 'PAT'
              ? locale === 'ar-EG'
                ? 'سجل المريض المسجّل'
                : 'Signed-in patient record'
              : '—')}
        </Text>
      </View>

      {state === 'loading' && <RouteStatePanel title={copy.loading} direction={direction} />}
      {state === 'offline' && <OfflineNoQueueBanner text={copy.offline} direction={direction} />}
      {(state === 'pending' || state === 'review' || state === 'slots') && (
        <FocusVisiblePressable
          testID="records-refresh"
          accessibilityRole="button"
          onPress={() => void load()}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
        >
          <Text style={{ ...localizedType(locale, 'label'), color: color.brand }}>
            {copy.refresh}
          </Text>
        </FocusVisiblePressable>
      )}
      {['empty', 'denied', 'stale', 'error', 'conflict'].includes(state) && (
        <View
          testID={state === 'denied' ? undefined : 'records-refresh'}
          ref={resultFocus}
          focusable
          accessibilityLiveRegion="polite"
        >
          <RouteStatePanel
            title={stateText}
            actionLabel={state === 'denied' ? undefined : copy.refresh}
            onAction={state === 'denied' ? undefined : () => void load()}
            assertive={state === 'denied' || state === 'conflict'}
            direction={direction}
          />
        </View>
      )}
      {(state === 'pending' ||
        state === 'review' ||
        state === 'searching' ||
        state === 'slots' ||
        state === 'submitting' ||
        state === 'accepted') && (
        <View testID="records-pending-list" style={{ gap: spacing.md }}>
          {referrals.map((referral) => (
            <View
              key={referral.id}
              testID={`records-referral-card-${referral.id}`}
              style={{ ...semanticStyles.card, gap: spacing.sm }}
            >
              <Text style={{ ...localizedType(locale, 'title'), color: color.ink }}>
                {copy.specialty}: {referral.targetSpecialty}
              </Text>
              <Text
                selectable
                style={{
                  ...localizedType(locale, 'body'),
                  color: color.ink,
                  direction: 'ltr',
                  writingDirection: 'ltr',
                  textAlign: 'left',
                }}
              >
                {copy.source}: {referral.sourceEncounterId}
              </Text>
              {state !== 'review' &&
                state !== 'searching' &&
                state !== 'slots' &&
                state !== 'submitting' &&
                state !== 'accepted' && (
                  <FocusVisiblePressable
                    testID="records-review"
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedReferral(referral);
                      setReasonAuthorized(false);
                      setEncounterTypeChoice(null);
                      setTargets([]);
                      setSelectedDoctor(null);
                      setSelectedTarget(null);
                      setState('review');
                    }}
                    style={{ ...semanticStyles.primaryAction, minHeight: 48 }}
                  >
                    <Text
                      style={{
                        ...localizedType(locale, 'label'),
                        color: color.inverse,
                        textAlign: 'center',
                      }}
                    >
                      {copy.review}
                    </Text>
                  </FocusVisiblePressable>
                )}
              {selectedReferral?.id === referral.id && state !== 'accepted' && (
                <View style={{ gap: spacing.sm }}>
                  <View style={{ ...semanticStyles.card, gap: spacing.xs }}>
                    <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                      {copy.reason}
                    </Text>
                    <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                      {referral.reasonSummary}
                    </Text>
                    <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                      {copy.encounterType}
                    </Text>
                    {referral.encounterType ? (
                      <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                        {referral.encounterType}
                      </Text>
                    ) : (
                      <Text style={{ ...localizedType(locale, 'body'), color: color.mutedInk }}>
                        {copy.encounterTypeHelp}
                      </Text>
                    )}
                    <Text style={{ ...localizedType(locale, 'body'), color: color.mutedInk }}>
                      {copy.noNote}
                    </Text>
                  </View>
                  <FocusVisiblePressable
                    testID="records-reason-authorize"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: reasonAuthorized }}
                    aria-checked={reasonAuthorized}
                    {...webKeyboardActivationProps(() => setReasonAuthorized((value) => !value))}
                    onPress={() => setReasonAuthorized((value) => !value)}
                    style={{ minHeight: 48, justifyContent: 'center' }}
                  >
                    <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                      {reasonAuthorized ? '☑ ' : '☐ '}
                      {copy.reasonAuthorize}
                    </Text>
                  </FocusVisiblePressable>
                  <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                    {copy.encounterType}
                  </Text>
                  {(['include', 'exclude'] as const).map((choice) => (
                    <FocusVisiblePressable
                      key={choice}
                      testID={`records-encounter-type-choice-${choice}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: encounterTypeChoice === choice }}
                      aria-checked={encounterTypeChoice === choice}
                      {...webKeyboardActivationProps(() => setEncounterTypeChoice(choice))}
                      onPress={() => setEncounterTypeChoice(choice)}
                      style={{
                        minHeight: 44,
                        justifyContent: 'center',
                        paddingInline: spacing.sm,
                        borderWidth: 1,
                        borderColor: color.border,
                        borderRadius: radius.control,
                      }}
                    >
                      <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                        {encounterTypeChoice === choice ? '◉ ' : '○ '}
                        {choice === 'include' ? copy.includeType : copy.excludeType}
                      </Text>
                    </FocusVisiblePressable>
                  ))}
                  <FocusVisiblePressable
                    testID="records-find-slots"
                    disabled={!reasonAuthorized || encounterTypeChoice === null}
                    onPress={() => void discoverSlots()}
                    style={{
                      ...semanticStyles.primaryAction,
                      minHeight: 48,
                      opacity: reasonAuthorized && encounterTypeChoice !== null ? 1 : 0.5,
                    }}
                  >
                    <Text
                      style={{
                        ...localizedType(locale, 'label'),
                        color: color.inverse,
                        textAlign: 'center',
                      }}
                    >
                      {state === 'searching' ? copy.loading : copy.findSlots}
                    </Text>
                  </FocusVisiblePressable>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {state === 'searching' && <RouteStatePanel title={copy.loading} direction={direction} />}
      {state === 'slots' && selectedReferral && (
        <View style={{ ...semanticStyles.card, gap: spacing.sm }}>
          <Text
            accessibilityRole="header"
            style={{ ...localizedType(locale, 'title'), color: color.ink }}
          >
            {copy.selectDoctor}
          </Text>
          {targets.length === 0 && (
            <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
              {copy.noSlots}
            </Text>
          )}
          {[
            ...new Map(targets.map((target) => [target.doctor.doctorId, target.doctor])).values(),
          ].map((doctor) => {
            const chosen = selectedDoctor?.doctorId === doctor.doctorId;
            return (
              <FocusVisiblePressable
                key={doctor.doctorId}
                testID="records-target-doctor"
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen }}
                aria-checked={chosen}
                {...webKeyboardActivationProps(() => {
                  setSelectedDoctor(doctor);
                  setSelectedTarget(null);
                })}
                onPress={() => {
                  setSelectedDoctor(doctor);
                  setSelectedTarget(null);
                }}
                style={{
                  minHeight: 64,
                  justifyContent: 'center',
                  padding: spacing.sm,
                  borderWidth: chosen ? 2 : 1,
                  borderColor: chosen ? color.brand : color.border,
                  borderRadius: radius.control,
                  gap: spacing.xs,
                }}
              >
                <Text style={{ ...localizedType(locale, 'label'), color: color.ink }}>
                  {copy.doctor}: {doctor.doctorDisplayName}
                </Text>
                <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                  {copy.facility}: {doctor.facilityDisplayName}
                </Text>
              </FocusVisiblePressable>
            );
          })}
          {selectedDoctor &&
            targets
              .filter((target) => target.doctor.doctorId === selectedDoctor.doctorId)
              .map((target) => (
                <FocusVisiblePressable
                  key={`${target.doctor.doctorId}-${target.slot.startsAt}`}
                  testID="records-target-slot"
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked:
                      selectedTarget?.slot.startsAt === target.slot.startsAt &&
                      selectedTarget?.doctor.doctorId === target.doctor.doctorId,
                  }}
                  aria-checked={
                    selectedTarget?.slot.startsAt === target.slot.startsAt &&
                    selectedTarget?.doctor.doctorId === target.doctor.doctorId
                  }
                  {...webKeyboardActivationProps(() => setSelectedTarget(target))}
                  onPress={() => setSelectedTarget(target)}
                  style={{
                    minHeight: 48,
                    justifyContent: 'center',
                    paddingInline: spacing.sm,
                    borderWidth: selectedTarget?.slot.startsAt === target.slot.startsAt ? 2 : 1,
                    borderColor:
                      selectedTarget?.slot.startsAt === target.slot.startsAt
                        ? color.brand
                        : color.border,
                    borderRadius: radius.control,
                  }}
                >
                  <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
                    {copy.slot}: {displayTime(target.slot.startsAt, locale, target.slot.timezone)}
                  </Text>
                </FocusVisiblePressable>
              ))}
          <FocusVisiblePressable
            testID="records-accept"
            accessibilityRole="button"
            disabled={!reasonAuthorized || encounterTypeChoice === null || !selectedTarget}
            onPress={() => void accept()}
            style={{
              ...semanticStyles.primaryAction,
              minHeight: 48,
              opacity: reasonAuthorized && encounterTypeChoice !== null && selectedTarget ? 1 : 0.5,
            }}
          >
            <Text
              style={{
                ...localizedType(locale, 'label'),
                color: color.inverse,
                textAlign: 'center',
              }}
            >
              {copy.accept}
            </Text>
          </FocusVisiblePressable>
        </View>
      )}
      {state === 'submitting' && <RouteStatePanel title={copy.submitting} direction={direction} />}
      {state === 'accepted' && booked && selectedTarget && (
        <View
          testID="records-success-appointment"
          ref={resultFocus}
          focusable
          accessibilityLiveRegion="polite"
          style={{ ...semanticStyles.card, gap: spacing.sm }}
        >
          <Text
            accessibilityRole="header"
            style={{ ...localizedType(locale, 'title'), color: color.ink }}
          >
            {copy.success}
          </Text>
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {copy.appointment}: {booked.appointment.id}
          </Text>
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {copy.doctor}: {selectedTarget.doctor.doctorDisplayName}
          </Text>
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {copy.facility}: {selectedTarget.doctor.facilityDisplayName}
          </Text>
          <Text style={{ ...localizedType(locale, 'body'), color: color.ink }}>
            {copy.slot}:{' '}
            {displayTime(booked.appointment.startsAt, locale, selectedTarget.slot.timezone)}
          </Text>
          <FocusVisiblePressable
            testID="records-view-appointment"
            accessibilityRole="link"
            onPress={() =>
              router.push({
                pathname: '/appointments/[id]',
                params: { id: booked.appointment.id, patientId },
              })
            }
            style={{ ...semanticStyles.primaryAction, minHeight: 48 }}
          >
            <Text
              style={{
                ...localizedType(locale, 'label'),
                color: color.inverse,
                textAlign: 'center',
              }}
            >
              {copy.viewAppointment}
            </Text>
          </FocusVisiblePressable>
        </View>
      )}
      <View ref={actionFocus} focusable accessibilityLiveRegion="polite" />
    </ScrollView>
  );
}
