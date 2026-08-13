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

type ContactState = 'pending' | 'confirmed' | 'declined' | 'revoked' | 'expired';

export default function EmergencyContactsScreen() {
  const { locale, setLocale } = usePatientLocaleController();
  const params = useLocalSearchParams<{ patientId?: string }>();
  const [invitation, setInvitation] = useState<Record<string, string>>({});
  // Expo web pre-renders this route, so browser-only fragment consumption must
  // happen after hydration; a lazy state initializer would run only on the server.
  useEffect(() => setInvitation(consumeInvitationFragment()), []);
  const patientId = params.patientId ?? syntheticFamilyIds.selfPatient;
  const client = useMemo(() => createPatientFamilyClient(locale), [locale]);
  const [displayName, setDisplayName] = useState(
    locale === 'ar-EG' ? 'جهة اصطناعية' : 'Synthetic contact',
  );
  const [phone, setPhone] = useState('+999000000000');
  const [precision, setPrecision] = useState<'none' | 'coarse' | 'exact'>('coarse');
  const [state, setState] = useState<ContactState>('pending');
  const [message, setMessage] = useState<'success' | 'offline' | 'invite' | ''>('');
  const run = async (work: () => Promise<unknown>) => {
    try {
      assertOnline();
      await work();
      setMessage('success');
    } catch (error: unknown) {
      setMessage(
        error instanceof Error && error.message === 'offline-no-queue' ? 'offline' : 'invite',
      );
    }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16, direction: directionFor(locale) }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setLocale(locale === 'ar-EG' ? 'en-EG' : 'ar-EG')}
        style={{ minHeight: 44 }}
      >
        <Text>{translate(locale, 'locale.switch')}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '700' }}>
        {translate(locale, 'family.contact.title')}
      </Text>
      <Text nativeID="contact-name-label">
        {locale === 'ar-EG' ? 'اسم جهة الاتصال' : 'Contact name'}
      </Text>
      <TextInput
        accessibilityLabel={locale === 'ar-EG' ? 'اسم جهة الاتصال' : 'Contact name'}
        aria-labelledby="contact-name-label"
        value={displayName}
        onChangeText={setDisplayName}
        style={{ minHeight: 48, width: '100%', borderWidth: 1, padding: 10 }}
      />
      <Text nativeID="contact-phone-label">
        {locale === 'ar-EG' ? 'رقم الهاتف' : 'Phone number'}
      </Text>
      <TextInput
        accessibilityLabel={locale === 'ar-EG' ? 'رقم الهاتف' : 'Phone number'}
        aria-labelledby="contact-phone-label"
        value={phone}
        onChangeText={setPhone}
        style={{ minHeight: 48, width: '100%', borderWidth: 1, padding: 10, direction: 'ltr' }}
      />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={translate(locale, 'family.contact.location')}
        style={{ gap: 8 }}
      >
        {(['none', 'coarse', 'exact'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: precision === value }}
            onPress={() => setPrecision(value)}
            style={{ minHeight: 44 }}
          >
            <Text style={{ direction: 'ltr', textAlign: 'left' }}>{value}</Text>
          </Pressable>
        ))}
      </View>
      <Text>{translate(locale, 'family.contact.disclosure')}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          run(() =>
            client.createEmergencyContact(
              patientId,
              {
                display_name: displayName,
                phone_e164: phone,
                preferred_locale: locale,
                location_precision: precision,
              },
              familyMutationKey('contact-create'),
            ),
          )
        }
        style={{ minHeight: 48 }}
      >
        <Text>{translate(locale, 'family.contact.create')}</Text>
      </Pressable>
      {invitation.token ? (
        <View style={{ gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              run(async () => {
                await client.respondEmergencyContact(
                  invitation.token!,
                  { decision: 'confirmed' },
                  familyMutationKey('contact-confirm'),
                );
                setState('confirmed');
              })
            }
            style={{ minHeight: 48 }}
          >
            <Text>{translate(locale, 'family.contact.confirmed')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              run(async () => {
                await client.respondEmergencyContact(
                  invitation.token!,
                  { decision: 'declined' },
                  familyMutationKey('contact-decline'),
                );
                setState('declined');
              })
            }
            style={{ minHeight: 48 }}
          >
            <Text>{translate(locale, 'family.contact.declined')}</Text>
          </Pressable>
        </View>
      ) : null}
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite">
        {translate(locale, `family.contact.${state}`)}
      </Text>
      {(['pending', 'confirmed', 'declined', 'revoked', 'expired'] as const).map((value) => (
        <Pressable
          key={value}
          accessibilityRole="button"
          onPress={() => setState(value)}
          style={{ minHeight: 44 }}
        >
          <Text>{translate(locale, `family.contact.${value}`)}</Text>
        </Pressable>
      ))}
      {(['declined', 'revoked', 'expired'] as ContactState[]).includes(state) ? (
        <Text>{translate(locale, 'family.contact.reinvite')}</Text>
      ) : null}
      <Text accessibilityRole="alert" aria-live="polite">
        {message === 'success'
          ? translate(locale, 'state.success')
          : message === 'offline'
            ? translate(locale, 'family.problem.offline')
            : message === 'invite'
              ? translate(locale, 'family.problem.invite')
              : ''}
      </Text>
    </ScrollView>
  );
}
