import {
  color,
  BidiSafeText,
  localizedType,
  mapSecurityProblem,
  minimumTargetSize,
  patientPrimaryTargetSize,
  SecurityDestructiveConfirmation,
  SecurityStatusBanner,
  securityMutationAllowed,
  semanticStyles,
  spacing,
  useSecurityConnection,
} from '@shifaa/design-system';
import { directionFor, isolateLtr, translate, type Locale } from '@shifaa/i18n';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { NativeFactorSummary } from '@shifaa/auth/identity-continuity';
import type { EnrollmentSecretResult } from '@shifaa/contracts/identity-continuity';

import { PatientScreen } from '../src/PatientScreen';
import {
  PatientMfaApi,
  assertIdentityContinuityOnline,
  type PatientMfaApiPort,
} from '../src/identity-continuity-api';
import { usePatientLocale } from '../src/locale-context';

type MfaUiState =
  | 'loading'
  | 'ready'
  | 'pending'
  | 'success'
  | 'offline'
  | 'rate'
  | 'pending-existing'
  | 'expired'
  | 'last-required'
  | 'step-up'
  | 'session-expired'
  | 'auth-degraded'
  | 'error';

function stateForProblem(error: unknown): MfaUiState {
  const problem = mapSecurityProblem(error);
  switch (problem.code) {
    case 'factor-enrollment-pending':
      return problem.status === 410 ? 'expired' : 'pending-existing';
    case 'last-factor-removal-denied':
      return 'last-required';
  }
  switch (problem.state) {
    case 'offline':
      return 'offline';
    case 'rate-limited':
      return 'rate';
    case 'step-up-required':
      return 'step-up';
    case 'session-expired':
      return 'session-expired';
    case 'auth-degraded':
      return 'auth-degraded';
    default:
      return 'error';
  }
}

function stateMessage(locale: Locale, state: MfaUiState): string {
  switch (state) {
    case 'loading':
      return translate(locale, 'state.loading');
    case 'success':
      return translate(locale, 'mfa.success');
    case 'offline':
      return translate(locale, 'mfa.offline');
    case 'rate':
      return translate(locale, 'mfa.rate');
    case 'pending-existing':
      return translate(locale, 'mfa.pendingExisting');
    case 'expired':
      return translate(locale, 'mfa.pendingExpired');
    case 'last-required':
      return translate(locale, 'mfa.lastRequired');
    case 'step-up':
      return translate(locale, 'security.stepUp.required');
    case 'session-expired':
      return translate(locale, 'security.session.expired');
    case 'auth-degraded':
      return translate(locale, 'mfa.authDegraded');
    case 'error':
      return translate(locale, 'mfa.error');
    default:
      return '';
  }
}

function isLocalQrDataUri(value: string): boolean {
  return /^data:image\/(?:png|svg\+xml);/i.test(value);
}

export default function MfaRoute({
  locale: localeOverride,
  online: onlineOverride,
  api: apiOverride,
}: {
  locale?: Locale;
  online?: boolean;
  api?: PatientMfaApiPort;
}) {
  const locale = usePatientLocale(localeOverride);
  const connection = useSecurityConnection(onlineOverride);
  const { online } = connection;
  const api = useMemo(() => apiOverride ?? new PatientMfaApi({ locale }), [apiOverride, locale]);
  const [factors, setFactors] = useState<readonly NativeFactorSummary[]>([]);
  const [enrollment, setEnrollment] = useState<EnrollmentSecretResult>();
  const [friendlyName, setFriendlyName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [qrVisible, setQrVisible] = useState(false);
  const [confirmingFactorId, setConfirmingFactorId] = useState<string>();
  const [state, setState] = useState<MfaUiState>('loading');
  const [nowMs, setNowMs] = useState(Date.now());
  const removalActionRef = useRef<{ focus?: () => void } | null>(null);
  const busy = state === 'loading';

  const loadFactors = async (nextState: MfaUiState = 'ready') => {
    if (!online) {
      setState('offline');
      return;
    }
    try {
      assertIdentityContinuityOnline();
      setFactors(await api.listFactors());
      connection.markReconciled();
      setState(nextState);
    } catch (error) {
      setState(stateForProblem(error));
    }
  };

  useEffect(() => {
    void loadFactors();
  }, [api, online, connection.reconnectVersion]);

  useEffect(() => {
    if (!enrollment) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [enrollment]);

  const expiresInSeconds = enrollment
    ? Math.max(0, Math.ceil((Date.parse(enrollment.expiresAt) - nowMs) / 1_000))
    : 0;

  useEffect(() => {
    if (enrollment && expiresInSeconds === 0) {
      setEnrollment(undefined);
      setQrVisible(false);
      setVerificationCode('');
      setState('expired');
    }
  }, [enrollment, expiresInSeconds]);

  const beginEnrollment = async () => {
    if (
      !securityMutationAllowed({
        online,
        reconciliationRequired: connection.reconciliationRequired,
        sessionCurrent: state !== 'session-expired' && state !== 'auth-degraded',
        authorityCurrent: true,
      })
    ) {
      setState(online ? 'auth-degraded' : 'offline');
      return;
    }
    if (!online) {
      setState('offline');
      return;
    }
    try {
      assertIdentityContinuityOnline();
      setState('loading');
      const result = await api.beginEnrollment({
        factorType: 'totp',
        ...(friendlyName.trim() ? { friendlyName: friendlyName.trim() } : {}),
      });
      setEnrollment(result);
      setQrVisible(isLocalQrDataUri(result.qrUri));
      setVerificationCode('');
      setNowMs(Date.now());
      setState('pending');
    } catch (error) {
      setState(stateForProblem(error));
    }
  };

  const verifyEnrollment = async () => {
    if (connection.reconciliationRequired) return setState('auth-degraded');
    if (!enrollment || expiresInSeconds === 0) {
      setState('expired');
      return;
    }
    try {
      assertIdentityContinuityOnline();
      setState('loading');
      const result = await api.verifyEnrollment({
        enrollmentId: enrollment.enrollmentId,
        code: verificationCode,
      });
      await api.installSession(result.session);
      setEnrollment(undefined);
      setQrVisible(false);
      setVerificationCode('');
      await loadFactors('success');
    } catch (error) {
      setState(stateForProblem(error));
    }
  };

  const removeFactor = async (factorId: string) => {
    if (connection.reconciliationRequired) return setState('auth-degraded');
    try {
      assertIdentityContinuityOnline();
      setState('loading');
      await api.removeFactor(factorId, {
        proofCaseId: null,
        confirmOptionalLastFactor: true,
      });
      setConfirmingFactorId(undefined);
      await loadFactors('success');
      removalActionRef.current?.focus?.();
    } catch (error) {
      setState(stateForProblem(error));
    }
  };

  const bodyType = localizedType(locale, 'body');
  const labelType = localizedType(locale, 'label');
  const titleType = localizedType(locale, 'title');
  const direction = directionFor(locale);
  const message = stateMessage(locale, state);

  return (
    <PatientScreen locale={locale} title="mfa.title" current={0} critical>
      {message ? (
        <SecurityStatusBanner
          tone={
            state === 'success'
              ? 'success'
              : state === 'offline'
                ? 'offline'
                : state === 'loading'
                  ? 'information'
                  : 'danger'
          }
          title={message}
          direction={direction}
          focusKey={state}
          {...(state !== 'loading' && state !== 'success'
            ? { actionLabel: translate(locale, 'state.retry'), onAction: () => void loadFactors() }
            : {})}
        />
      ) : null}

      <View style={{ ...semanticStyles.card, gap: spacing.md, direction }}>
        <Text accessibilityRole="header" style={{ ...titleType, color: color.ink }}>
          {translate(locale, 'mfa.factors')}
        </Text>
        {factors.length === 0 ? (
          <Text style={{ ...bodyType, color: color.mutedInk }}>
            {translate(locale, 'mfa.none')}
          </Text>
        ) : (
          factors.map((factor, index) => {
            const factorName = factor.friendlyName || translate(locale, 'mfa.factorDefault');
            const confirming = confirmingFactorId === factor.id;
            return (
              <View
                key={factor.id}
                accessibilityRole="summary"
                style={{
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderColor: color.border,
                  paddingBlockStart: index === 0 ? 0 : spacing.md,
                  gap: spacing.sm,
                }}
              >
                <Text style={{ ...labelType, color: color.ink }}>{factorName}</Text>
                <Text style={{ ...bodyType, color: color.mutedInk }}>
                  {translate(locale, 'mfa.factorVerified')} ·{' '}
                  {isolateLtr(new Date(factor.createdAt).toLocaleString(locale))}
                </Text>
                {!confirming ? (
                  <Pressable
                    ref={factor.id === factors[0]?.id ? (removalActionRef as never) : undefined}
                    accessibilityRole="button"
                    onPress={() => setConfirmingFactorId(factor.id)}
                    style={{ ...semanticStyles.destructiveAction, minHeight: minimumTargetSize }}
                  >
                    <Text style={{ ...labelType, color: color.inverse, textAlign: 'center' }}>
                      {translate(locale, 'mfa.remove')}
                    </Text>
                  </Pressable>
                ) : (
                  <SecurityDestructiveConfirmation
                    title={translate(locale, 'mfa.remove')}
                    resourceLabel={factorName}
                    consequence={translate(locale, 'mfa.removeConfirm')}
                    confirmLabel={translate(locale, 'mfa.removeConfirmAction')}
                    cancelLabel={translate(locale, 'mfa.cancel')}
                    direction={direction}
                    disabled={busy || !online}
                    onConfirm={() => void removeFactor(factor.id)}
                    onCancel={() => {
                      setConfirmingFactorId(undefined);
                      removalActionRef.current?.focus?.();
                    }}
                  />
                )}
              </View>
            );
          })
        )}
      </View>

      {!enrollment ? (
        <View style={{ ...semanticStyles.card, gap: spacing.md, direction }}>
          <Text accessibilityRole="header" style={{ ...titleType, color: color.ink }}>
            {translate(locale, factors.length ? 'mfa.addAdditional' : 'mfa.begin')}
          </Text>
          <Text style={{ ...bodyType, color: color.mutedInk }}>
            {translate(locale, 'mfa.totpOnly')}
          </Text>
          <Text nativeID="mfa-friendly-name" style={{ ...labelType, color: color.ink }}>
            {translate(locale, 'mfa.friendlyName')}
          </Text>
          <TextInput
            aria-labelledby="mfa-friendly-name"
            accessibilityLabel={translate(locale, 'mfa.friendlyName')}
            value={friendlyName}
            onChangeText={setFriendlyName}
            maxLength={64}
            style={{
              minHeight: patientPrimaryTargetSize,
              borderWidth: 1,
              borderColor: color.border,
              paddingInline: spacing.md,
              color: color.ink,
              ...bodyType,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !online }}
            disabled={busy || !online}
            onPress={() => void beginEnrollment()}
            style={{ ...semanticStyles.primaryAction, opacity: busy || !online ? 0.6 : 1 }}
          >
            <Text style={{ ...labelType, color: color.inverse, textAlign: 'center' }}>
              {translate(locale, 'mfa.begin')}
            </Text>
          </Pressable>
          <Text style={{ ...bodyType, color: color.mutedInk }}>
            {translate(locale, 'mfa.unsupported')}
          </Text>
        </View>
      ) : (
        <View style={{ ...semanticStyles.card, gap: spacing.md, direction }}>
          <Text accessibilityRole="header" style={{ ...titleType, color: color.ink }}>
            {translate(locale, 'mfa.pending')}
          </Text>
          <Text style={{ ...bodyType, color: color.warning }}>
            {translate(locale, 'mfa.secretOnce')}
          </Text>
          {qrVisible ? (
            <Image
              accessibilityLabel={translate(locale, 'mfa.qrLabel')}
              source={{ uri: enrollment.qrUri }}
              cachePolicy="none"
              contentFit="contain"
              onError={() => setQrVisible(false)}
              style={{ width: '100%', maxWidth: 240, aspectRatio: 1, alignSelf: 'center' }}
            />
          ) : (
            <Text accessibilityRole="alert" style={{ ...bodyType, color: color.warning }}>
              {translate(locale, 'mfa.qrUnavailable')}
            </Text>
          )}
          <Text style={{ ...labelType, color: color.ink }}>
            {translate(locale, 'mfa.manualSecret')}
          </Text>
          <BidiSafeText text={isolateLtr(enrollment.secret)} direction={direction} />
          <Text
            accessibilityLiveRegion="polite"
            aria-live="polite"
            style={{ ...bodyType, color: color.warning }}
          >
            {translate(locale, 'mfa.expiresIn')} {isolateLtr(String(expiresInSeconds))}
          </Text>
          <Text nativeID="mfa-code-label" style={{ ...labelType, color: color.ink }}>
            {translate(locale, 'mfa.code')}
          </Text>
          <TextInput
            aria-labelledby="mfa-code-label"
            accessibilityLabel={translate(locale, 'mfa.code')}
            inputMode="numeric"
            maxLength={6}
            value={verificationCode}
            onChangeText={(value) => setVerificationCode(value.replace(/\D/g, ''))}
            style={{
              minHeight: patientPrimaryTargetSize,
              borderWidth: 1,
              borderColor: color.border,
              paddingInline: spacing.md,
              color: color.ink,
              ...bodyType,
              direction: 'ltr',
              textAlign: 'left',
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: busy || !online || verificationCode.length !== 6,
            }}
            disabled={busy || !online || verificationCode.length !== 6}
            onPress={() => void verifyEnrollment()}
            style={{
              ...semanticStyles.primaryAction,
              minHeight: patientPrimaryTargetSize,
              opacity: busy || !online || verificationCode.length !== 6 ? 0.6 : 1,
            }}
          >
            <Text style={{ ...labelType, color: color.inverse, textAlign: 'center' }}>
              {translate(locale, 'mfa.verify')}
            </Text>
          </Pressable>
        </View>
      )}
    </PatientScreen>
  );
}
