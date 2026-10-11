import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feature011Client } from '@shifaa/api-client/feature-011';
import { AllergyReportController } from './feature-011-allergies';
import { allergyCopy, allergyDate, isolateLtr, verificationCopy } from '@shifaa/i18n';
import { allergyHistoryMetadata } from './feature-011-allergy-history';
import {
  color,
  spacing,
  radius,
  localizedType,
  FocusVisiblePressable,
  RouteStatePanel,
} from '@shifaa/design-system';
import { patientAccessTokens } from './patient-auth-store';
type Props = {
  locale: 'ar-EG' | 'en-EG';
  role: 'PAT' | 'GUA' | 'DEL';
  baseUrl: string;
  purpose: string;
  managedPatientId: string;
  reauthorize: () => Promise<void>;
};
export function AllergyRecordsPanel({
  locale,
  role,
  baseUrl,
  purpose,
  managedPatientId,
  reauthorize,
}: Props) {
  const copy = allergyCopy[locale],
    router = useRouter(),
    direction = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const [substance, setSubstance] = useState(''),
    [source, setSource] = useState(''),
    [, redraw] = useState(0),
    [history, setHistory] = useState(false);
  const outcome = useRef<View>(null),
    action = useRef<View>(null);
  const makeModel = useMemo(
    () => () =>
      new AllergyReportController({
        client: new Feature011Client({
          baseUrl,
          accessToken: () => patientAccessTokens.read(),
          purpose,
          acceptLanguage: locale,
        }),
        patientId: managedPatientId,
        role,
        online: () => typeof navigator === 'undefined' || navigator.onLine,
        idempotencyKey: () => crypto.randomUUID(),
        reauthorize,
      }),
    [baseUrl, purpose, managedPatientId, role, locale, reauthorize],
  );
  const [model, setModel] = useState(makeModel);
  useEffect(() => {
    model.dispose();
    const fresh = makeModel();
    setModel(fresh);
    return () => fresh.dispose();
  }, [makeModel]);
  const refresh = async () => {
    const promise = model.load(history ? 'history' : 'current');
    redraw((n) => n + 1);
    await promise;
    redraw((n) => n + 1);
  };
  useEffect(() => {
    void refresh();
    const offline = () => void refresh();
    if (typeof window !== 'undefined') window.addEventListener('offline', offline);
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('offline', offline);
    };
  }, [model, history]);
  useEffect(() => {
    if (model.phase === 'review' || model.phase === 'success' || model.phase === 'reconciling')
      (outcome.current as unknown as { focus?: () => void })?.focus?.();
  }, [model.phase]);
  const text = {
    ...localizedType(locale, 'body'),
    color: color.ink,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%' as const,
  };
  const button = (label: string, run: () => void, disabled = false) => (
    <FocusVisiblePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={run}
      style={{
        minHeight: 48,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: color.border,
        borderRadius: radius.control,
      }}
    >
      <Text style={text}>{label}</Text>
    </FocusVisiblePressable>
  );
  const submit = async () => {
    const promise = model.submit();
    redraw((n) => n + 1);
    await promise;
    setSubstance('');
    setSource('');
    redraw((n) => n + 1);
  };
  return (
    <View
      testID="f011-allergy-panel"
      style={{
        gap: spacing.md,
        direction,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: color.border,
        borderRadius: radius.card,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ ...localizedType(locale, 'title'), color: color.ink }}
      >
        {copy.title}
      </Text>
      <Text style={text}>{copy.boundary}</Text>
      <View ref={outcome} focusable accessibilityLiveRegion="polite">
        <RouteStatePanel
          title={
            history && model.phase === 'ready'
              ? verificationCopy[locale].history
              : copy[model.phase]
          }
          direction={direction}
        />
      </View>
      {['GUA', 'DEL'].includes(role) && <Text style={text}>{copy.readonly}</Text>}
      {model.rows.map((row) => (
        <View key={row.revisionId} style={{ gap: spacing.sm, minWidth: 0 }}>
          <Text style={text}>
            {row.substance.display} — {copy[row.status]}
          </Text>
          <Text style={text}>
            {copy.source}: {row.source.display}
          </Text>
          {(['coding', 'reaction', 'severity', 'onset'] as const).map((key) => (
            <Text key={key} style={text}>
              {copy[key]}:{' '}
              {row[key].knowledge === 'unknown'
                ? copy.unknown
                : typeof row[key].value === 'string'
                  ? row[key].value
                  : (row[key].value.display ?? isolateLtr(row[key].value.code))}
            </Text>
          ))}
          <Text style={text}>
            {copy.time}: {allergyDate(row.recordedAt, locale)} · {copy.version}: {row.version}
          </Text>
          <Text selectable style={{ ...text, writingDirection: 'ltr' }}>
            {isolateLtr(row.revisionId)}
          </Text>
          <Text style={text}>
            {verificationCopy[locale].originalRecorder}:{' '}
            {isolateLtr(allergyHistoryMetadata(row).originalRecorder)}
          </Text>
          <Text style={text}>
            {verificationCopy[locale].actor}: {isolateLtr(row.actionActorPersonId)} ·{' '}
            {verificationCopy[locale].actionTime}: {allergyDate(row.actionAt, locale)}
          </Text>
          {!!row.previousRevisionId && (
            <Text selectable style={text}>
              {verificationCopy[locale].predecessor}: {isolateLtr(row.previousRevisionId)}
            </Text>
          )}
          {!!row.verification && (
            <>
              <Text style={text}>
                {verificationCopy[locale].reason}: {row.verification.reason}
              </Text>
              <Text selectable style={text}>
                {verificationCopy[locale].evidence}: {isolateLtr(row.verification.evidenceRef)}
              </Text>
              <Text selectable style={text}>
                {verificationCopy[locale].verifier}: {isolateLtr(row.verification.verifierPersonId)}
              </Text>
            </>
          )}
          {row.status === 'entered_in_error' && (
            <Text style={text}>{verificationCopy[locale].terminal}</Text>
          )}
          {!!row.correctsAllergyId && (
            <Text selectable style={text}>
              {verificationCopy[locale].correction}: {isolateLtr(row.correctsAllergyId)}
            </Text>
          )}
        </View>
      ))}
      {model.canReport && (
        <>
          <Text style={text}>{copy.substance}</Text>
          <TextInput
            accessibilityLabel={copy.substance}
            value={substance}
            onChangeText={setSubstance}
            maxLength={200}
            style={{
              ...text,
              minHeight: 48,
              borderWidth: 1,
              borderColor: color.border,
              padding: spacing.sm,
            }}
          />
          <Text style={text}>{copy.source}</Text>
          <TextInput
            accessibilityLabel={copy.source}
            value={source}
            onChangeText={setSource}
            maxLength={200}
            style={{
              ...text,
              minHeight: 48,
              borderWidth: 1,
              borderColor: color.border,
              padding: spacing.sm,
            }}
          />
          <View ref={action}>
            {button(
              copy.report,
              () => {
                model.review({
                  substance: { identity: substance, display: substance },
                  source: { display: source },
                });
                redraw((n) => n + 1);
              },
              !substance.trim() || !source.trim(),
            )}
          </View>
        </>
      )}
      {model.phase === 'review' && (
        <>
          <Text style={text}>
            {substance} — {source} — {copy.self_reported}
          </Text>
          {button(copy.cancel, () => {
            model.cancel();
            redraw((n) => n + 1);
            requestAnimationFrame(() => {
              const node = action.current as unknown as {
                focus?: () => void;
                querySelector?: (selector: string) => { focus: () => void } | null;
              };
              const report = node?.querySelector?.('[role="button"]');
              if (report) report.focus();
              else node?.focus?.();
            });
          })}
          {button(copy.confirm, () => void submit())}
        </>
      )}
      {model.phase === 'reconciling' &&
        button(
          copy.retry,
          () => void submit(),
          typeof navigator !== 'undefined' && !navigator.onLine,
        )}
      {model.receipt && (
        <>
          <Text style={text}>
            {copy.reference}: {isolateLtr(model.receipt.revisionId)}
          </Text>
          <Text style={text}>
            {copy.time}: {allergyDate(model.receipt.recordedAt, locale)}
          </Text>
          <Text style={text}>{copy.next}</Text>
        </>
      )}
      {!['review', 'submitting', 'reconciling'].includes(model.phase) && (
        <>
          {button(copy.refresh, () => void refresh())}
          {button(history ? copy.current : copy.history, () => setHistory(!history))}
        </>
      )}
      {button(copy.privacy, () => router.push('/privacy-consents'))}
    </View>
  );
}
