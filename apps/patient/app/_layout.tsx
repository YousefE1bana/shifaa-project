import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import React from 'react';
import { PatientLocaleProvider } from '../src/locale-context';
import { PatientSessionLifecycle } from '../src/patient-session-runtime';

export default function PatientLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (fontError) throw fontError;
  if (!fontsLoaded) return null;
  return (
    <PatientLocaleProvider>
      <PatientSessionLifecycle />
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </PatientLocaleProvider>
  );
}
