import {
  color,
  mapSecurityProblem,
  SecurityStatusBanner,
  semanticStyles,
  spacing,
  type,
  useSecurityConnection,
} from '@shifaa/design-system';
import { directionFor, translate, type Locale } from '@shifaa/i18n';
import { Link } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FieldLabel, PatientScreen } from '../src/PatientScreen';
import {
  assertIdentityContinuityOnline,
  PatientRecoveryApi,
  type PatientRecoveryApiPort,
} from '../src/identity-continuity-api';
import { usePatientLocale } from '../src/locale-context';

type RecoveryState =
  | 'request'
  | 'accepted'
  | 'proof'
  | 'pending'
  | 'failed'
  | 'restricted'
  | 'completed'
  | 'expired'
  | 'rate'
  | 'offline';

function stateMessage(locale: Locale, state: RecoveryState): string | undefined {
  switch (state) {
    case 'accepted':
      return translate(locale, 'recovery.accepted');
    case 'proof':
      return translate(locale, 'recovery.proofRequired');
    case 'pending':
      return translate(locale, 'recovery.pending');
    case 'restricted':
      return translate(locale, 'recovery.restricted');
    case 'completed':
      return translate(locale, 'recovery.completed');
    case 'expired':
      return translate(locale, 'recovery.expired');
    case 'rate':
      return translate(locale, 'recovery.rate');
    case 'offline':
      return translate(locale, 'state.offline');
    case 'failed':
      return translate(locale, 'recovery.failed');
    default:
      return undefined;
  }
}

function stateForError(error: unknown): RecoveryState {
  const problem = mapSecurityProblem(error);
  if (problem.state === 'offline') return 'offline';
  if (problem.state === 'rate-limited') return 'rate';
  if (problem.state === 'expired') return 'expired';
  return 'failed';
}

export default function RecoveryRoute({
  locale: localeOverride,
  online: onlineOverride,
  api: apiOverride,
}: {
  locale?: Locale;
  online?: boolean;
  api?: PatientRecoveryApiPort;
}) {
  const locale = usePatientLocale(localeOverride);
  const connection = useSecurityConnection(onlineOverride);
  const { online } = connection;
  const api = useMemo(
    () => apiOverride ?? new PatientRecoveryApi({ locale }),
    [apiOverride, locale],
  );
  const [state, setState] = useState<RecoveryState>(online ? 'request' : 'offline');
  const [handle, setHandle] = useState('');
  const [recoveryOtp, setRecoveryOtp] = useState('');
  const [factorEvidence, setFactorEvidence] = useState('');
  const [verificationCaseId, setVerificationCaseId] = useState('');
  const [newCredential, setNewCredential] = useState('');
  const caseRef = useRef<{ id: string; token: string } | undefined>(undefined);

  useEffect(() => {
    if (online || state === 'completed') {
      if (online && state === 'offline') {
        connection.markReconciled();
        setState('request');
      }
      return;
    }
    caseRef.current = undefined;
    setRecoveryOtp('');
    setFactorEvidence('');
    setVerificationCaseId('');
    setNewCredential('');
    setState('offline');
  }, [online, state, connection.reconnectVersion]);

  const start = async () => {
    if (!online) return setState('offline');
    try {
      assertIdentityContinuityOnline();
      const accepted = await api.startRecovery({ handle, locale });
      caseRef.current = { id: accepted.caseId, token: accepted.caseToken };
      setState('accepted');
    } catch (error) {
      setState(stateForError(error));
    }
  };

  const complete = async () => {
    const intake = caseRef.current;
    if (!intake) return setState('failed');
    if (!online) return setState('offline');
    try {
      assertIdentityContinuityOnline();
      setState('pending');
      const result = await api.completeRecovery(intake.id, {
        caseToken: intake.token,
        handle,
        recoveryOtp,
        proofMethod: verificationCaseId
          ? 'repeated_identity_proof'
          : 'bound_factor_independent_method',
        ...(verificationCaseId ? { verificationCaseId } : { factorEvidence }),
        newCredential,
      });
      setState(result.status === 'restricted_enrollment' ? 'restricted' : 'completed');
      setRecoveryOtp('');
      setFactorEvidence('');
      setNewCredential('');
    } catch (error) {
      setState(stateForError(error));
    }
  };

  const message = stateMessage(locale, state);
  const direction = directionFor(locale);
  const proofVisible =
    state === 'proof' || state === 'pending' || state === 'failed' || state === 'rate';

  return (
    <PatientScreen locale={locale} title="recovery.title" current={0} critical>
      {message ? (
        <SecurityStatusBanner
          tone={
            state === 'completed'
              ? 'success'
              : state === 'offline'
                ? 'offline'
                : state === 'accepted' || state === 'pending'
                  ? 'information'
                  : 'warning'
          }
          title={message}
          direction={direction}
          focusKey={state}
        />
      ) : null}
      <View style={{ ...semanticStyles.card, gap: spacing.md, direction }}>
        <FieldLabel>{translate(locale, 'recovery.handle')}</FieldLabel>
        <TextInput
          accessibilityLabel={translate(locale, 'recovery.handle')}
          autoCapitalize="none"
          inputMode="email"
          value={handle}
          onChangeText={setHandle}
          editable={state === 'request' || state === 'accepted'}
          style={{
            minHeight: 48,
            borderWidth: 1,
            borderColor: color.border,
            paddingInline: spacing.md,
            ...type.body,
          }}
        />
        {!proofVisible ? (
          <Pressable
            accessibilityRole="button"
            disabled={!handle || !online}
            onPress={() => (state === 'accepted' ? setState('proof') : void start())}
            style={semanticStyles.primaryAction}
          >
            <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
              {state === 'accepted'
                ? translate(locale, 'recovery.proofRequired')
                : translate(locale, 'recovery.start')}
            </Text>
          </Pressable>
        ) : (
          <>
            <FieldLabel>{translate(locale, 'auth.otp')}</FieldLabel>
            <TextInput
              accessibilityLabel={translate(locale, 'auth.otp')}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={12}
              value={recoveryOtp}
              onChangeText={(value) => setRecoveryOtp(value.replace(/\D/g, ''))}
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: color.border,
                paddingInline: spacing.md,
                direction: 'ltr',
                textAlign: 'left',
                ...type.body,
              }}
            />
            <FieldLabel>{translate(locale, 'recovery.proofRequired')}</FieldLabel>
            <TextInput
              accessibilityLabel={translate(locale, 'recovery.proofRequired')}
              value={factorEvidence}
              onChangeText={setFactorEvidence}
              secureTextEntry
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: color.border,
                paddingInline: spacing.md,
                ...type.body,
              }}
            />
            <TextInput
              accessibilityLabel={translate(locale, 'recovery.pending')}
              value={verificationCaseId}
              onChangeText={setVerificationCaseId}
              autoCapitalize="none"
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: color.border,
                paddingInline: spacing.md,
                direction: 'ltr',
                textAlign: 'left',
                ...type.body,
              }}
            />
            <FieldLabel>{translate(locale, 'auth.password')}</FieldLabel>
            <TextInput
              accessibilityLabel={translate(locale, 'auth.password')}
              value={newCredential}
              onChangeText={setNewCredential}
              secureTextEntry
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: color.border,
                paddingInline: spacing.md,
                ...type.body,
              }}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!recoveryOtp || !newCredential || !online || state === 'pending'}
              onPress={() => void complete()}
              style={semanticStyles.primaryAction}
            >
              <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
                {translate(locale, 'auth.verify')}
              </Text>
            </Pressable>
          </>
        )}
        {state === 'restricted' ? (
          <Link href="/mfa" asChild>
            <Pressable accessibilityRole="link" style={semanticStyles.primaryAction}>
              <Text style={{ ...type.label, color: color.inverse, textAlign: 'center' }}>
                {translate(locale, 'mfa.begin')}
              </Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </PatientScreen>
  );
}
