import type { DelegablePermissionCode } from '@shifaa/contracts/family-care';
import type { PatientDependentTransitionSummary } from '@shifaa/contracts/family-care';
import {
  color,
  minimumTargetSize,
  patientPrimaryTargetSize,
  semanticStyles,
  spacing,
} from '@shifaa/design-system';
import { directionFor, translate } from '@shifaa/i18n';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  assertOnline,
  consumeInvitationFragment,
  createPatientFamilyClient,
  familyMutationKey,
  syntheticFamilyIds,
} from '../src/family-care-api';
import { usePatientLocaleController } from '../src/locale-context';
import {
  PatientTransitionApi,
  assertIdentityContinuityOnline,
} from '../src/identity-continuity-api';

const permissions: readonly DelegablePermissionCode[] = [
  'profile.view',
  'appointment.manage',
  'record.view',
  'medication.manage',
  'sos.activate',
  'sos.share',
  'complaint.create',
  'symptom_routing.use',
];

type UiState =
  | 'idle'
  | 'loading'
  | 'success'
  | 'conflict'
  | 'permission'
  | 'offline'
  | 'dependency'
  | 'error';

export default function RelationshipsScreen() {
  const { locale, setLocale } = usePatientLocaleController();
  const params = useLocalSearchParams<{
    patientId?: string;
  }>();
  const [invitation, setInvitation] = useState<Record<string, string>>({});
  useEffect(() => setInvitation(consumeInvitationFragment()), []);
  const patientId = params.patientId ?? syntheticFamilyIds.selfPatient;
  const client = useMemo(() => createPatientFamilyClient(locale), [locale]);
  const [state, setState] = useState<UiState>('idle');
  const [delegatePersonId, setDelegatePersonId] = useState<string>(
    syntheticFamilyIds.delegatePerson,
  );
  const [purpose, setPurpose] = useState('family_support');
  const [validUntil, setValidUntil] = useState('2027-08-11T09:00:00.000Z');
  const [selected, setSelected] = useState<DelegablePermissionCode[]>(['record.view']);
  const [result, setResult] = useState('');
  const [transition, setTransition] = useState<PatientDependentTransitionSummary>({
    relationshipId: null,
    transitionCaseId: null,
    status: 'not_eligible',
    continuityCaseVersion: null,
    updatedAt: null,
    recordConsequence: 'unchanged_before_decision',
    priorAuthorityConsequence: 'current_until_decision',
  });
  const [transitionUiState, setTransitionUiState] = useState<
    PatientDependentTransitionSummary['status'] | 'conflict' | 'error'
  >('not_eligible');
  const [verificationCaseId, setVerificationCaseId] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const transitionClient = useMemo(() => new PatientTransitionApi({ locale }), [locale]);
  const refreshTransition = async () => {
    try {
      const page = await transitionClient.read(patientId);
      setTransition(page.dependentTransition);
      setTransitionUiState(page.dependentTransition.status);
    } catch {
      setTransitionUiState('error');
    }
  };
  useEffect(() => {
    void refreshTransition();
  }, [transitionClient, patientId]);
  const run = async (work: () => Promise<unknown>) => {
    try {
      assertOnline();
      setState('loading');
      const value = await work();
      setResult(JSON.stringify(value));
      setState('success');
    } catch (error: unknown) {
      const status =
        typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
      setState(
        status === 409
          ? 'conflict'
          : status === 403
            ? 'permission'
            : error instanceof Error && error.message === 'offline-no-queue'
              ? 'offline'
              : error instanceof TypeError
                ? 'dependency'
                : 'error',
      );
    }
  };
  const toggle = (permission: DelegablePermissionCode) =>
    setSelected((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission],
    );
  const submitTransitionProof = async () => {
    if (
      !reviewConfirmed ||
      !transition.relationshipId ||
      !transition.continuityCaseVersion ||
      !verificationCaseId.trim()
    )
      return;
    try {
      assertIdentityContinuityOnline();
      const value = await transitionClient.submitProof(
        transition.relationshipId,
        verificationCaseId.trim(),
        transition.continuityCaseVersion,
      );
      setTransitionUiState(
        value.status === 'proof_required' ? 'verification_required' : value.status,
      );
      await refreshTransition();
    } catch (error: unknown) {
      const status =
        typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
      setTransitionUiState(status === 409 ? 'conflict' : 'error');
    }
  };
  const transitionText = {
    not_eligible: translate(locale, 'transition.notEligible'),
    verification_required: translate(locale, 'transition.verification'),
    review_required: translate(locale, 'transition.review'),
    human_review_required: translate(locale, 'transition.humanReview'),
    approved: translate(locale, 'transition.approved'),
    rejected: translate(locale, 'transition.rejected'),
    conflict: translate(locale, 'transition.conflict'),
    error: translate(locale, 'state.unavailable'),
  }[transitionUiState];
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 18, direction: directionFor(locale) }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
        style={{ minHeight: 44 }}
      >
        <Text>{translate(locale, 'locale.switch')}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '700' }}>
        {translate(locale, 'family.relationships.title')}
      </Text>
      <section
        aria-label={translate(locale, 'family.guardianship.title')}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <Text style={{ fontSize: 22, fontWeight: '700' }}>
          {translate(locale, 'family.guardianship.title')}
        </Text>
        <Text>{translate(locale, 'family.guardianship.evidence')}</Text>
        <Text>{translate(locale, 'family.guardianship.pending')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            run(() =>
              client.createGuardianship(
                patientId,
                {
                  evidence_object_id: syntheticFamilyIds.releasedEvidence,
                  purpose_code: 'dependent_care',
                  requested_permissions: ['profile.view', 'appointment.manage'],
                },
                familyMutationKey('guardianship-create'),
              ),
            )
          }
          style={{ minHeight: 48 }}
        >
          <Text>{translate(locale, 'family.guardianship.title')}</Text>
        </Pressable>
      </section>
      <section
        aria-label={locale === 'ar-EG' ? 'انتقال صلاحية التابع' : 'Dependent authority transition'}
        style={{
          ...semanticStyles.card,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.sm,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: '700', color: color.ink }}>
          {locale === 'ar-EG' ? 'انتقال صلاحية التابع' : 'Dependent authority transition'}
        </Text>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite">
          {transitionText}
        </Text>
        <Text>
          {locale === 'ar-EG'
            ? 'لا يغيّر بلوغ عمر معيّن الوصول بذاته. يلزم إثبات الهوية ومراجعة بشرية موثقة.'
            : 'Reaching an age does not change access by itself. Identity proof and a recorded human review are required.'}
        </Text>
        <Text>
          {transition.recordConsequence === 'same_patient_record_preserved'
            ? locale === 'ar-EG'
              ? 'يستمر سجل المريض نفسه.'
              : 'The same patient record continues.'
            : locale === 'ar-EG'
              ? 'لا يتغير سجل المريض قبل القرار.'
              : 'The patient record is unchanged before the decision.'}
        </Text>
        <Text>
          {transition.priorAuthorityConsequence === 'ended_after_approval'
            ? locale === 'ar-EG'
              ? 'انتهت صلاحية الوصي السابقة؛ ويتطلب أي وصول لاحق منحًا مشروعًا منفصلًا.'
              : 'Former guardian authority ended; later access requires a separate lawful grant.'
            : locale === 'ar-EG'
              ? 'تبقى الصلاحية الحالية حتى صدور القرار.'
              : 'Current authority remains until the decision.'}
        </Text>
        {transition.status === 'verification_required' ? (
          <>
            <Text nativeID="transition-verification-label">
              {locale === 'ar-EG' ? 'معرّف حالة إثبات الهوية' : 'Identity verification case ID'}
            </Text>
            <TextInput
              accessibilityLabel={
                locale === 'ar-EG' ? 'معرّف حالة إثبات الهوية' : 'Identity verification case ID'
              }
              aria-labelledby="transition-verification-label"
              value={verificationCaseId}
              onChangeText={setVerificationCaseId}
              autoCapitalize="none"
              style={{
                minHeight: minimumTargetSize,
                borderWidth: 1,
                borderColor: color.border,
                padding: spacing.sm,
                direction: 'ltr',
              }}
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: reviewConfirmed }}
              onPress={() => setReviewConfirmed((value) => !value)}
              style={{ minHeight: minimumTargetSize, justifyContent: 'center' }}
            >
              <Text>
                {locale === 'ar-EG'
                  ? 'أؤكد إرسال إثبات الهوية للمراجعة البشرية.'
                  : 'I confirm sending identity proof for human review.'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !reviewConfirmed || !verificationCaseId.trim() }}
              disabled={!reviewConfirmed || !verificationCaseId.trim()}
              onPress={() => void submitTransitionProof()}
              style={{ ...semanticStyles.primaryAction, minHeight: patientPrimaryTargetSize }}
            >
              <Text style={{ color: color.inverse, textAlign: 'center' }}>
                {translate(locale, 'transition.submit')}
              </Text>
            </Pressable>
          </>
        ) : null}
        {transitionUiState === 'conflict' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void refreshTransition()}
            style={{ minHeight: minimumTargetSize }}
          >
            <Text>{locale === 'ar-EG' ? 'تحديث الحالة' : 'Refresh state'}</Text>
          </Pressable>
        ) : null}
      </section>
      <section
        aria-label={translate(locale, 'family.delegation.title')}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <Text style={{ fontSize: 22, fontWeight: '700' }}>
          {translate(locale, 'family.delegation.title')}
        </Text>
        <Text nativeID="delegate-person-label">
          {locale === 'ar-EG' ? 'الشخص المفوّض' : 'Delegate person'}
        </Text>
        <TextInput
          accessibilityLabel={locale === 'ar-EG' ? 'الشخص المفوّض' : 'Delegate person'}
          aria-labelledby="delegate-person-label"
          value={delegatePersonId}
          onChangeText={setDelegatePersonId}
          style={{ minHeight: 48, width: '100%', borderWidth: 1, padding: 10, direction: 'ltr' }}
        />
        <Text nativeID="delegation-purpose-label">
          {translate(locale, 'family.delegation.purpose')}
        </Text>
        <TextInput
          accessibilityLabel={translate(locale, 'family.delegation.purpose')}
          aria-labelledby="delegation-purpose-label"
          value={purpose}
          onChangeText={setPurpose}
          style={{ minHeight: 48, width: '100%', borderWidth: 1, padding: 10, direction: 'ltr' }}
        />
        <Text nativeID="delegation-validity-label">
          {translate(locale, 'family.delegation.validity')}
        </Text>
        <TextInput
          accessibilityLabel={translate(locale, 'family.delegation.validity')}
          aria-labelledby="delegation-validity-label"
          value={validUntil}
          onChangeText={setValidUntil}
          style={{ minHeight: 48, width: '100%', borderWidth: 1, padding: 10, direction: 'ltr' }}
        />
        <View accessibilityRole="list" style={{ gap: 8 }}>
          {permissions.map((permission) => (
            <Pressable
              key={permission}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected.includes(permission) }}
              onPress={() => toggle(permission)}
              style={{ minHeight: 44 }}
            >
              <Text style={{ direction: 'ltr', textAlign: 'left' }}>{permission}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            run(() =>
              client.createDelegation(
                patientId,
                {
                  delegate_person_id: delegatePersonId,
                  purpose_code: purpose,
                  permissions: selected,
                  valid_until: validUntil,
                },
                familyMutationKey('delegation-create'),
              ),
            )
          }
          style={{ minHeight: 48 }}
        >
          <Text>{translate(locale, 'family.delegation.create')}</Text>
        </Pressable>
        {invitation.invite && invitation.relationshipId ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              run(() =>
                createPatientFamilyClient(
                  locale,
                  syntheticFamilyIds.delegatePerson,
                ).acceptDelegation(
                  invitation.relationshipId!,
                  { token: invitation.invite!, confirmed: true },
                  familyMutationKey('delegation-accept'),
                ),
              )
            }
            style={{ minHeight: 48 }}
          >
            <Text>{translate(locale, 'family.delegation.accept')}</Text>
          </Pressable>
        ) : null}
        <Text>{translate(locale, 'family.delegation.terminal')}</Text>
      </section>
      <Text accessibilityRole="alert" aria-live="polite">
        {state === 'loading'
          ? translate(locale, 'state.loading')
          : state === 'success'
            ? translate(locale, 'state.success')
            : state === 'conflict'
              ? translate(locale, 'family.problem.conflict')
              : state === 'permission'
                ? translate(locale, 'family.problem.permission')
                : state === 'offline'
                  ? translate(locale, 'family.problem.offline')
                  : state === 'dependency'
                    ? translate(locale, 'family.problem.dependency')
                    : state === 'error'
                      ? translate(locale, 'state.unavailable')
                      : ''}
      </Text>
      {result ? (
        <Text accessibilityLabel={locale === 'ar-EG' ? 'نتيجة آمنة' : 'Safe result'}>
          {result.replace(/invitation_token[^,}]*/g, 'invitation_token:[REDACTED]')}
        </Text>
      ) : null}
    </ScrollView>
  );
}
