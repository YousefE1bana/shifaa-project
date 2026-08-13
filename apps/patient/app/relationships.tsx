import type { DelegablePermissionCode } from '@shifaa/contracts/family-care';
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
